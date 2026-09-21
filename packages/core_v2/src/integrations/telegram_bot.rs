use anyhow::{anyhow, Result};
use chrono::Utc;
use parking_lot::Mutex as SyncMutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Notify, RwLock};
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};

use crate::integrations::telegram::{TelegramClient, TelegramMessage, TelegramSendOptions};
use crate::orchestrator::AgentEngine;
use crate::server::ipc::voice::transcribe_audio_bytes;
use crate::server::routes::chat::resolve_active_workspace_model;
use crate::server::state::SessionStateEntry;
use crate::storage::chat_storage::{ChatSession, ChatStorage};
use crate::storage::settings::{get_superagent_dir, SettingsStore};
use crate::tools::builtin::{
    CreateArtifactTool, EditFileTool, GetAvailableToolsTool, GlobTool, GrepSearchTool,
    ListArtifactsTool, ListDirTool, PlanTool, QuestionTool, ReadArtifactTool, ReadFileTool,
    RunCommandTool, SkillTool, SleepTimerTool, TelegramTool, TodoTool, WriteFileTool,
};
use crate::tools::ToolRegistry;
use crate::types::{ChatMessage, ModelConfig, ProviderType};

// ─── Status & Configuration Models ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BotLifecycleState {
    Stopped,
    Starting,
    Running,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramBotStatus {
    pub state: BotLifecycleState,
    pub bot_username: Option<String>,
    pub bot_name: Option<String>,
    pub last_poll_time: Option<String>,
    pub processed_updates: u64,
    pub active_chats_count: usize,
    pub debounce_seconds: f32,
}

// ─── Message Burst Debouncing Models ─────────────────────────────────────────

#[allow(dead_code)]
struct PendingChatBurst {
    chat_id: i64,
    user_id: i64,
    user_name: String,
    messages: Vec<TelegramMessage>,
    first_received_at: Instant,
    last_received_at: Instant,
    notify: Arc<Notify>,
}

// ─── Telegram Bot Manager ────────────────────────────────────────────────────

pub struct TelegramBotManager {
    client: Arc<TelegramClient>,
    settings_store: Arc<SettingsStore>,
    chat_storage: Arc<ChatStorage>,
    ws_broadcast_tx: tokio::sync::broadcast::Sender<String>,
    session_store: Arc<SyncMutex<lru::LruCache<String, SessionStateEntry>>>,
    active_cancellations: Arc<SyncMutex<HashMap<String, tokio::sync::broadcast::Sender<()>>>>,
    cancel_token: Arc<RwLock<Option<CancellationToken>>>,
    state: Arc<RwLock<BotLifecycleState>>,
    last_update_id: Arc<AtomicI64>,
    processed_count: Arc<std::sync::atomic::AtomicU64>,
    last_poll_iso: Arc<RwLock<Option<String>>>,
    bot_identity: Arc<RwLock<Option<(String, String)>>>, // (bot_name, username)
    active_bursts: Arc<RwLock<HashMap<i64, Arc<RwLock<PendingChatBurst>>>>>,
}

impl TelegramBotManager {
    pub fn new(
        settings_store: Arc<SettingsStore>,
        chat_storage: Arc<ChatStorage>,
        ws_broadcast_tx: tokio::sync::broadcast::Sender<String>,
        session_store: Arc<SyncMutex<lru::LruCache<String, SessionStateEntry>>>,
        active_cancellations: Arc<SyncMutex<HashMap<String, tokio::sync::broadcast::Sender<()>>>>,
    ) -> Self {
        Self {
            client: Arc::new(TelegramClient::new()),
            settings_store,
            chat_storage,
            ws_broadcast_tx,
            session_store,
            active_cancellations,
            cancel_token: Arc::new(RwLock::new(None)),
            state: Arc::new(RwLock::new(BotLifecycleState::Stopped)),
            last_update_id: Arc::new(AtomicI64::new(0)),
            processed_count: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            last_poll_iso: Arc::new(RwLock::new(None)),
            bot_identity: Arc::new(RwLock::new(None)),
            active_bursts: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Checks settings and starts the bot worker if twoWayEnabled is true and botToken is configured.
    pub async fn autostart_if_enabled(self: &Arc<Self>) {
        let raw = self.settings_store.load_raw().unwrap_or_default();
        let tg_obj = raw.get("telegram");

        let enabled = tg_obj
            .and_then(|t| t.get("twoWayEnabled").or_else(|| t.get("two_way_enabled")))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let token = tg_obj
            .and_then(|t| t.get("botToken").or_else(|| t.get("bot_token")))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .or_else(|| std::env::var("TELEGRAM_BOT_TOKEN").ok())
            .unwrap_or_default();

        if enabled && !token.is_empty() {
            info!("🤖 Telegram 2-Way Bot is enabled. Launching polling engine...");
            if let Err(e) = self.start().await {
                error!("Failed to autostart Telegram bot: {}", e);
            }
        }
    }

    /// Starts or restarts the Telegram bot polling loop.
    pub async fn start(self: &Arc<Self>) -> Result<()> {
        let mut token_lock = self.cancel_token.write().await;
        if let Some(ref old_token) = *token_lock {
            old_token.cancel();
        }

        let raw = self.settings_store.load_raw().unwrap_or_default();
        let tg_obj = raw.get("telegram");

        let bot_token = tg_obj
            .and_then(|t| t.get("botToken").or_else(|| t.get("bot_token")))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .or_else(|| std::env::var("TELEGRAM_BOT_TOKEN").ok())
            .unwrap_or_default();

        if bot_token.is_empty() {
            *self.state.write().await =
                BotLifecycleState::Error("Missing Telegram botToken in settings".to_string());
            return Err(anyhow!("Telegram Bot Token is required to start the bot."));
        }

        // Verify token & fetch bot username
        let me_url = format!("https://api.telegram.org/bot{}/getMe", bot_token);
        let check_resp = reqwest::get(&me_url).await?;
        if check_resp.status().is_success() {
            let json: serde_json::Value = check_resp.json().await?;
            if let Some(res) = json.get("result") {
                let name = res
                    .get("first_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("SuperAgent Bot")
                    .to_string();
                let username = res
                    .get("username")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                *self.bot_identity.write().await = Some((name.clone(), username.clone()));
                info!("Verified Telegram Bot: {} (@{})", name, username);
            }
        } else {
            let err_body = check_resp.text().await.unwrap_or_default();
            *self.state.write().await =
                BotLifecycleState::Error(format!("Invalid bot token: {}", err_body));
            return Err(anyhow!("Telegram getMe validation failed: {}", err_body));
        }

        let cancel_token = CancellationToken::new();
        *token_lock = Some(cancel_token.clone());
        *self.state.write().await = BotLifecycleState::Running;

        let self_clone = self.clone();
        tokio::spawn(async move {
            self_clone.run_polling_loop(bot_token, cancel_token).await;
        });

        Ok(())
    }

    /// Gracefully halts the Telegram bot polling loop.
    pub async fn stop(&self) {
        let mut token_lock = self.cancel_token.write().await;
        if let Some(ref token) = *token_lock {
            token.cancel();
        }
        *token_lock = None;
        *self.state.write().await = BotLifecycleState::Stopped;
        info!("🛑 Telegram 2-Way Bot stopped gracefully.");
    }

    /// Gets current bot telemetry status.
    pub async fn get_status(&self) -> TelegramBotStatus {
        let raw = self.settings_store.load_raw().unwrap_or_default();
        let debounce_secs = raw
            .get("telegram")
            .and_then(|t| {
                t.get("debounceSeconds")
                    .or_else(|| t.get("debounce_seconds"))
            })
            .and_then(|v| v.as_f64())
            .map(|f| f as f32)
            .unwrap_or(2.5);

        let state = self.state.read().await.clone();
        let id_lock = self.bot_identity.read().await;
        let (bot_name, bot_username) = match id_lock.as_ref() {
            Some((name, uname)) => (Some(name.clone()), Some(uname.clone())),
            None => (None, None),
        };
        let last_poll = self.last_poll_iso.read().await.clone();
        let count = self.processed_count.load(Ordering::Relaxed);
        let active_chats = self.active_bursts.read().await.len();

        TelegramBotStatus {
            state,
            bot_username,
            bot_name,
            last_poll_time: last_poll,
            processed_updates: count,
            active_chats_count: active_chats,
            debounce_seconds: debounce_secs,
        }
    }

    // ─── Internal Polling Engine ─────────────────────────────────────────────

    async fn run_polling_loop(self: Arc<Self>, bot_token: String, cancel_token: CancellationToken) {
        info!("🚀 Telegram Polling Engine online. Listening for incoming messages...");
        let mut error_backoff_secs = 1u64;

        loop {
            if cancel_token.is_cancelled() {
                break;
            }

            *self.last_poll_iso.write().await = Some(Utc::now().to_rfc3339());
            let current_offset = self.last_update_id.load(Ordering::Relaxed);
            let poll_offset = if current_offset > 0 {
                Some(current_offset + 1)
            } else {
                None
            };

            let poll_fut = self.client.get_updates(&bot_token, poll_offset, 30);
            tokio::select! {
                _ = cancel_token.cancelled() => {
                    break;
                }
                res = poll_fut => {
                    match res {
                        Ok(updates) => {
                            error_backoff_secs = 1;
                            for update in updates {
                                if update.update_id >= current_offset {
                                    self.last_update_id.store(update.update_id, Ordering::Relaxed);
                                }
                                self.processed_count.fetch_add(1, Ordering::Relaxed);

                                if let Some(msg) = update.message.or(update.edited_message) {
                                    let self_ref = self.clone();
                                    let tok = bot_token.clone();
                                    tokio::spawn(async move {
                                        self_ref.handle_incoming_message(msg, tok).await;
                                    });
                                }
                            }
                        }
                        Err(err) => {
                            warn!("Telegram poll error: {}. Reconnecting in {}s...", err, error_backoff_secs);
                            tokio::select! {
                                _ = cancel_token.cancelled() => break,
                                _ = tokio::time::sleep(Duration::from_secs(error_backoff_secs)) => {}
                            }
                            error_backoff_secs = (error_backoff_secs * 2).min(30);
                        }
                    }
                }
            }
        }

        *self.state.write().await = BotLifecycleState::Stopped;
    }

    // ─── Inbound Message Intake & Debouncing ──────────────────────────────────

    async fn handle_incoming_message(self: Arc<Self>, msg: TelegramMessage, bot_token: String) {
        let chat_id = msg.chat.id;
        let user_id = msg.from.as_ref().map(|u| u.id).unwrap_or(chat_id);
        let user_name = msg
            .from
            .as_ref()
            .map(|u| {
                if let Some(ref un) = u.username {
                    format!("@{}", un)
                } else {
                    format!("{} {}", u.first_name, u.last_name.as_deref().unwrap_or(""))
                        .trim()
                        .to_string()
                }
            })
            .unwrap_or_else(|| format!("User {}", user_id));

        // 1. Authorization Guard
        let is_authorized = self.is_chat_authorized(chat_id, user_id).await;
        if !is_authorized {
            warn!(
                "⛔ Unauthorized Telegram message from chat_id: {}, user: {}",
                chat_id, user_name
            );
            let alert_text = format!(
                "🔒 SuperAgent is running in private mode.\n\nYour Telegram Chat ID is: `{}`\n\nTo allow access, please add this Chat ID in the SuperAgent Desktop/Web App under Settings -> Telegram.",
                chat_id
            );
            let send_opts = TelegramSendOptions {
                bot_token,
                chat_id: chat_id.to_string(),
                text: alert_text,
                parse_mode: Some("Markdown".to_string()),
                disable_notification: None,
            };
            let _ = self.client.send_message(&send_opts).await;
            return;
        }

        // 2. Direct Command Interceptions (/new, /clear, /status, /help)
        if let Some(ref text) = msg.text {
            let trimmed = text.trim();
            if trimmed == "/new" || trimmed == "/clear" || trimmed == "/reset" {
                let session_id = format!("telegram-{}", chat_id);
                let _ = self.chat_storage.delete_session(&session_id);
                let _ = self
                    .client
                    .send_message(&TelegramSendOptions {
                        bot_token,
                        chat_id: chat_id.to_string(),
                        text: "✨ Started a fresh conversation. What would you like to work on?"
                            .to_string(),
                        parse_mode: None,
                        disable_notification: None,
                    })
                    .await;
                return;
            } else if trimmed == "/status" {
                let raw_settings = self.settings_store.load_raw().unwrap_or_default();
                let (_, model_id, _, _) =
                    resolve_active_workspace_model(&raw_settings, &self.settings_store);
                let status_msg = format!(
                    "⚡ *SuperAgent Status*\n• Engine: Native Rust Core v2\n• Active Model: `{}`\n• Chat ID: `{}`\n• State: Connected & Ready",
                    model_id, chat_id
                );
                let _ = self
                    .client
                    .send_message(&TelegramSendOptions {
                        bot_token,
                        chat_id: chat_id.to_string(),
                        text: status_msg,
                        parse_mode: Some("Markdown".to_string()),
                        disable_notification: None,
                    })
                    .await;
                return;
            } else if trimmed == "/help" {
                let help_msg = "🤖 *SuperAgent Telegram Capabilities*:\n\n\
                    • **Multi-message input**: Send multiple messages, ideas, or corrections in rapid bursts. I will wait for you to finish typing before providing one consolidated response.\n\
                    • **Multimodal files**: Send photos, voice notes, audio tracks, PDFs, code files, or documents.\n\
                    • **Voice notes**: Spoken voice notes are automatically transcribed using Whisper and processed.\n\
                    • **Commands**:\n  - `/new`: Start a fresh conversation topic\n  - `/status`: Show current agent model and system status\n  - `/help`: Show this guide";
                let _ = self
                    .client
                    .send_message(&TelegramSendOptions {
                        bot_token,
                        chat_id: chat_id.to_string(),
                        text: help_msg.to_string(),
                        parse_mode: Some("Markdown".to_string()),
                        disable_notification: None,
                    })
                    .await;
                return;
            }
        }

        // 3. Immediate "typing" feedback so user knows agent heard them
        let _ = self
            .client
            .send_chat_action(&bot_token, &chat_id.to_string(), "typing")
            .await;

        // 4. Retrieve settings debounce parameters
        let raw_settings = self.settings_store.load_raw().unwrap_or_default();
        let debounce_secs = raw_settings
            .get("telegram")
            .and_then(|t| {
                t.get("debounceSeconds")
                    .or_else(|| t.get("debounce_seconds"))
            })
            .and_then(|v| v.as_f64())
            .map(|f| f as f32)
            .unwrap_or(2.5)
            .max(1.0);

        let max_debounce_cap = raw_settings
            .get("telegram")
            .and_then(|t| {
                t.get("maxDebounceSeconds")
                    .or_else(|| t.get("max_debounce_seconds"))
            })
            .and_then(|v| v.as_u64())
            .unwrap_or(20)
            .max(5);

        // 5. Enqueue into the per-chat Debounce Queue
        let (burst_ref, is_new_burst) = {
            let mut bursts = self.active_bursts.write().await;
            if let Some(existing) = bursts.get(&chat_id) {
                (existing.clone(), false)
            } else {
                let notify = Arc::new(Notify::new());
                let burst = Arc::new(RwLock::new(PendingChatBurst {
                    chat_id,
                    user_id,
                    user_name: user_name.clone(),
                    messages: Vec::new(),
                    first_received_at: Instant::now(),
                    last_received_at: Instant::now(),
                    notify,
                }));
                bursts.insert(chat_id, burst.clone());
                (burst, true)
            }
        };

        // Append this message to the burst
        {
            let mut b = burst_ref.write().await;
            b.messages.push(msg);
            b.last_received_at = Instant::now();
            b.notify.notify_one();
        }

        // If this is the initial message of a burst, spawn the timer manager loop
        if is_new_burst {
            let self_worker = self.clone();
            let b_clone = burst_ref.clone();
            let tok = bot_token.clone();

            tokio::spawn(async move {
                let quiet_dur = Duration::from_millis((debounce_secs * 1000.0) as u64);
                let hard_cap = Duration::from_secs(max_debounce_cap);

                loop {
                    let (notify, last_rec, first_rec) = {
                        let b = b_clone.read().await;
                        (b.notify.clone(), b.last_received_at, b.first_received_at)
                    };

                    let elapsed_since_last = last_rec.elapsed();
                    let elapsed_since_first = first_rec.elapsed();

                    if elapsed_since_first >= hard_cap || elapsed_since_last >= quiet_dur {
                        // Debounce window satisfied! Flush the turn.
                        break;
                    }

                    let remaining_quiet = quiet_dur.saturating_sub(elapsed_since_last);
                    tokio::select! {
                        _ = tokio::time::sleep(remaining_quiet) => {
                            // Quiet window expired without a new message
                        }
                        _ = notify.notified() => {
                            // A new message arrived; send typing action again and loop
                            let _ = self_worker.client.send_chat_action(&tok, &chat_id.to_string(), "typing").await;
                        }
                    }
                }

                // Remove from active bursts map
                {
                    let mut bursts = self_worker.active_bursts.write().await;
                    bursts.remove(&chat_id);
                }

                // Extract all collected messages for this turn
                let burst_data = {
                    let mut b = b_clone.write().await;
                    std::mem::take(&mut b.messages)
                };

                if !burst_data.is_empty() {
                    self_worker
                        .execute_aggregated_turn(chat_id, user_id, user_name, burst_data, tok)
                        .await;
                }
            });
        }
    }

    /// Checks if a given Telegram chat ID or user ID is authorized.
    async fn is_chat_authorized(&self, chat_id: i64, user_id: i64) -> bool {
        let raw = self.settings_store.load_raw().unwrap_or_default();
        let tg_obj = match raw.get("telegram") {
            Some(obj) => obj,
            None => return true, // If no telegram settings block, allow
        };

        // 1. Check primary configured chatId
        if let Some(cid_str) = tg_obj
            .get("chatId")
            .or_else(|| tg_obj.get("chat_id"))
            .and_then(|v| v.as_str())
        {
            let cid_trimmed = cid_str.trim();
            if !cid_trimmed.is_empty() {
                if let Ok(allowed_id) = cid_trimmed.parse::<i64>() {
                    if allowed_id == chat_id || allowed_id == user_id {
                        return true;
                    }
                } else if cid_trimmed == chat_id.to_string() {
                    return true;
                }
            }
        }

        // 2. Check allowedChatIds list
        if let Some(arr) = tg_obj
            .get("allowedChatIds")
            .or_else(|| tg_obj.get("allowed_chat_ids"))
            .and_then(|v| v.as_array())
        {
            for item in arr {
                if let Some(id_str) = item.as_str() {
                    let trimmed = id_str.trim();
                    if trimmed == chat_id.to_string() || trimmed == user_id.to_string() {
                        return true;
                    }
                } else if let Some(id_num) = item.as_i64() {
                    if id_num == chat_id || id_num == user_id {
                        return true;
                    }
                }
            }
        }

        // If no chat IDs are configured at all, treat as authorized for the first user
        let has_configured_chat = tg_obj
            .get("chatId")
            .or_else(|| tg_obj.get("chat_id"))
            .and_then(|v| v.as_str())
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);

        !has_configured_chat
    }

    // ─── Turn Ingestion, Multimodal Extraction & Agent Execution ──────────────

    async fn execute_aggregated_turn(
        self: Arc<Self>,
        chat_id: i64,
        _user_id: i64,
        _user_name: String,
        messages: Vec<TelegramMessage>,
        bot_token: String,
    ) {
        let session_id = format!("telegram-{}", chat_id);
        let clean_chat_id = format!("telegram-{}", chat_id);

        // Prepare session media workspace directory
        let media_dir = get_superagent_dir()
            .join("conversation")
            .join("chats")
            .join(&clean_chat_id)
            .join("media");
        let _ = std::fs::create_dir_all(&media_dir);

        let mut turn_texts: Vec<String> = Vec::new();
        let mut attachments: Vec<String> = Vec::new();

        // 1. Multimodal Extraction across all messages in this burst
        for msg in &messages {
            // Text or Caption
            if let Some(ref txt) = msg.text {
                if !txt.trim().is_empty() {
                    turn_texts.push(txt.trim().to_string());
                }
            }
            if let Some(ref cap) = msg.caption {
                if !cap.trim().is_empty() {
                    turn_texts.push(cap.trim().to_string());
                }
            }

            // Photo ingestion (highest resolution photo is always last in Telegram's array)
            if let Some(ref photos) = msg.photo {
                if let Some(best_photo) = photos.last() {
                    if let Ok(info) = self.client.get_file(&bot_token, &best_photo.file_id).await {
                        if let Some(ref fpath) = info.file_path {
                            if let Ok(bytes) = self.client.download_file(&bot_token, fpath).await {
                                let photo_name = format!(
                                    "photo_{}_{}.jpg",
                                    msg.message_id, best_photo.file_unique_id
                                );
                                let local_path = media_dir.join(&photo_name);
                                if tokio::fs::write(&local_path, &bytes).await.is_ok() {
                                    let path_str = local_path.to_string_lossy().to_string();
                                    attachments.push(path_str.clone());
                                    turn_texts.push(format!("[Attached Image: {}]", photo_name));
                                }
                            }
                        }
                    }
                }
            }

            // Voice note ingestion & automatic STT transcription
            if let Some(ref voice) = msg.voice {
                if let Ok(info) = self.client.get_file(&bot_token, &voice.file_id).await {
                    if let Some(ref fpath) = info.file_path {
                        if let Ok(bytes) = self.client.download_file(&bot_token, fpath).await {
                            let voice_name = format!("voice_{}.ogg", msg.message_id);
                            let local_path = media_dir.join(&voice_name);
                            let _ = tokio::fs::write(&local_path, &bytes).await;

                            // Send voice action feedback
                            let _ = self
                                .client
                                .send_chat_action(&bot_token, &chat_id.to_string(), "record_voice")
                                .await;

                            match transcribe_audio_bytes(
                                &self.settings_store,
                                bytes,
                                &voice_name,
                                None,
                                None,
                            )
                            .await
                            {
                                Ok(transcript) => {
                                    info!("✔ Transcribed Telegram voice note: \"{}\"", transcript);
                                    turn_texts.push(format!(
                                        "[Voice Message Transcribed]: \"{}\"",
                                        transcript
                                    ));
                                }
                                Err(err) => {
                                    warn!("Voice note transcription error: {}", err);
                                    turn_texts.push(format!("[Voice note received ({}) but automatic transcription failed: {}]", voice_name, err));
                                }
                            }
                        }
                    }
                }
            }

            // Audio track ingestion
            if let Some(ref audio) = msg.audio {
                let filename = audio
                    .file_name
                    .clone()
                    .unwrap_or_else(|| format!("audio_{}.mp3", msg.message_id));
                if let Ok(info) = self.client.get_file(&bot_token, &audio.file_id).await {
                    if let Some(ref fpath) = info.file_path {
                        if let Ok(bytes) = self.client.download_file(&bot_token, fpath).await {
                            let local_path = media_dir.join(&filename);
                            let _ = tokio::fs::write(&local_path, &bytes).await;
                            turn_texts.push(format!("[Attached Audio: {}]", filename));
                        }
                    }
                }
            }

            // Document / PDF / Code file ingestion
            if let Some(ref doc) = msg.document {
                let filename = doc
                    .file_name
                    .clone()
                    .unwrap_or_else(|| format!("document_{}", msg.message_id));
                let size_mb = doc.file_size.unwrap_or(0) / (1024 * 1024);

                if size_mb > 20 {
                    turn_texts.push(format!(
                        "[Document: {} exceeds Telegram 20MB limit and could not be downloaded]",
                        filename
                    ));
                } else if let Ok(info) = self.client.get_file(&bot_token, &doc.file_id).await {
                    if let Some(ref fpath) = info.file_path {
                        if let Ok(bytes) = self.client.download_file(&bot_token, fpath).await {
                            let local_path = media_dir.join(&filename);
                            if tokio::fs::write(&local_path, &bytes).await.is_ok() {
                                let path_str = local_path.to_string_lossy().to_string();
                                turn_texts.push(format!(
                                    "[Attached File: {} (saved at {})]",
                                    filename, path_str
                                ));
                            }
                        }
                    }
                }
            }

            // Video ingestion
            if let Some(ref video) = msg.video {
                let filename = video
                    .file_name
                    .clone()
                    .unwrap_or_else(|| format!("video_{}.mp4", msg.message_id));
                if let Ok(info) = self.client.get_file(&bot_token, &video.file_id).await {
                    if let Some(ref fpath) = info.file_path {
                        if let Ok(bytes) = self.client.download_file(&bot_token, fpath).await {
                            let local_path = media_dir.join(&filename);
                            let _ = tokio::fs::write(&local_path, &bytes).await;
                            turn_texts.push(format!(
                                "[Attached Video: {} (duration: {}s)]",
                                filename, video.duration
                            ));
                        }
                    }
                }
            }
        }

        if turn_texts.is_empty() {
            return;
        }

        // 2. Synthesize unified turn text
        let prompt = if turn_texts.len() == 1 {
            turn_texts[0].clone()
        } else {
            let mut combined = format!("[User sent {} messages in sequence]:\n", turn_texts.len());
            for (idx, t) in turn_texts.iter().enumerate() {
                combined.push_str(&format!("{}. {}\n", idx + 1, t));
            }
            combined
        };

        info!(
            "💬 Assembled Telegram turn from chat {}: {}",
            chat_id, prompt
        );

        // 3. Load or initialize continuous multi-turn chat session
        let existing_session = self.chat_storage.load_session(&session_id).ok();
        let initial_history = if let Some(ref sess) = existing_session {
            sess.messages.clone()
        } else {
            Vec::new()
        };

        // 4. Resolve active workspace model & provider
        let raw_settings = self.settings_store.load_raw().unwrap_or_default();
        let (prov_type, model_id, api_key, base_url) =
            resolve_active_workspace_model(&raw_settings, &self.settings_store);

        let mut model_config = ModelConfig::new(prov_type, model_id.clone());
        model_config.api_key = api_key.or_else(|| match model_config.provider {
            ProviderType::OpenAI => std::env::var("OPENAI_API_KEY").ok(),
            ProviderType::Anthropic => std::env::var("ANTHROPIC_API_KEY").ok(),
            ProviderType::Gemini => std::env::var("GEMINI_API_KEY").ok(),
            ProviderType::Groq => std::env::var("GROQ_API_KEY").ok(),
            ProviderType::DeepSeek => std::env::var("DEEPSEEK_API_KEY").ok(),
            _ => None,
        });
        model_config.base_url = base_url;

        // 5. Build isolated Tool Registry for this Telegram session
        let effective_workspace = media_dir.parent().unwrap_or(&media_dir).to_path_buf();
        let mut tool_registry = ToolRegistry::new();
        tool_registry.register(CreateArtifactTool::new());
        tool_registry.register(ListArtifactsTool::new());
        tool_registry.register(ReadArtifactTool::new());
        tool_registry.register(QuestionTool::new());
        tool_registry.register(SleepTimerTool::new());
        tool_registry.register(PlanTool::new());
        tool_registry.register(TodoTool::new());
        tool_registry.register(SkillTool::new(effective_workspace.clone()));
        tool_registry.register(ReadFileTool::new(effective_workspace.clone()));
        tool_registry.register(WriteFileTool::new(effective_workspace.clone()));
        tool_registry.register(EditFileTool::new(effective_workspace.clone()));
        tool_registry.register(ListDirTool::new(effective_workspace.clone()));
        tool_registry.register(GlobTool::new(effective_workspace.clone()));
        tool_registry.register(RunCommandTool::new(effective_workspace.clone()));
        tool_registry.register(GrepSearchTool::new(effective_workspace.clone()));
        tool_registry.register(TelegramTool::with_workspace(
            self.settings_store.clone(),
            effective_workspace.clone(),
        ));

        let tools_summary: Vec<(String, String)> = tool_registry
            .list_schemas()
            .iter()
            .map(|s| {
                let name = s
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let desc = s
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                (name, desc)
            })
            .collect();
        tool_registry.register(GetAvailableToolsTool::new(tools_summary));

        let system_prompt = "You are SuperAgent, speaking with your user via Telegram. Be conversational, concise, insightful, and practical. Format your answers using clean Telegram-compatible Markdown or clear plain text. When writing code, use markdown code blocks.".to_string();

        let engine = AgentEngine::new(Arc::new(tool_registry));

        // 6. Start background typing heartbeat task
        let tok_heartbeat = bot_token.clone();
        let client_heartbeat = self.client.clone();
        let (heartbeat_stop_tx, mut heartbeat_stop_rx) = tokio::sync::oneshot::channel::<()>();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(4));
            loop {
                tokio::select! {
                    _ = &mut heartbeat_stop_rx => {
                        break;
                    }
                    _ = interval.tick() => {
                        let _ = client_heartbeat.send_chat_action(&tok_heartbeat, &chat_id.to_string(), "typing").await;
                    }
                }
            }
        });

        // 7. Register session and cancellation in state
        let (cancel_tx, _) = tokio::sync::broadcast::channel::<()>(1);
        {
            let mut cancels = self.active_cancellations.lock();
            cancels.insert(session_id.clone(), cancel_tx);
        }

        // 8. Run Agent Engine Loop
        let run_res = engine
            .run_loop_with_history_and_attachments(
                &model_config,
                &system_prompt,
                &prompt,
                initial_history.clone(),
                attachments,
            )
            .await;

        let mut assistant_text = String::new();
        let mut new_messages_collected = Vec::new();

        match run_res {
            Ok((mut event_rx, mut history_rx)) => {
                while let Some(event) = event_rx.recv().await {
                    if let crate::types::AgentEvent::Token { text } = event {
                        assistant_text.push_str(&text);
                        let broadcast_msg = serde_json::json!({
                            "channel": "agent-event",
                            "data": {
                                "sessionId": session_id,
                                "type": "token",
                                "content": text
                            }
                        });
                        let _ = self.ws_broadcast_tx.send(broadcast_msg.to_string());
                    }
                }
                if let Ok(new_msgs) = history_rx.try_recv() {
                    new_messages_collected = new_msgs;
                }
            }
            Err(err) => {
                error!("Agent loop error for Telegram chat {}: {}", chat_id, err);
                assistant_text = format!(
                    "⚠️ I ran into an error while processing your request: {}",
                    err
                );
            }
        }

        // Clean up cancellation handle
        {
            let mut cancels = self.active_cancellations.lock();
            cancels.remove(&session_id);
        }

        // Stop the typing heartbeat
        let _ = heartbeat_stop_tx.send(());

        // 8. Save updated session to ChatStorage
        let mut full_history = initial_history;
        if !new_messages_collected.is_empty() {
            full_history.extend(new_messages_collected);
        } else {
            full_history.push(ChatMessage::user(prompt));
            if !assistant_text.is_empty() {
                full_history.push(ChatMessage::assistant(assistant_text.clone()));
            }
        }

        let updated_session = ChatSession {
            id: session_id.clone(),
            title: format!("Telegram Chat {}", chat_id),
            project: None,
            model: Some(model_id),
            created_at: existing_session
                .as_ref()
                .map(|s| s.created_at)
                .unwrap_or_else(|| Utc::now().timestamp_millis()),
            updated_at: Utc::now().timestamp_millis(),
            messages: full_history.clone(),
        };
        let _ = self.chat_storage.save_session(&updated_session);

        // Update in-memory LRU session store for UI synchronization
        {
            let mut store = self.session_store.lock();
            let entry = SessionStateEntry {
                full_assistant_text: assistant_text.clone(),
                conversation_history: full_history,
                ..Default::default()
            };
            store.put(session_id.clone(), entry);
        }

        // 9. Deliver response to user via Telegram
        if assistant_text.trim().is_empty() {
            assistant_text = "Task completed.".to_string();
        }

        // Try Markdown chunked delivery first; fallback to plain text if Telegram parse error occurs
        let chunk_res = self
            .client
            .send_message_chunked(
                &bot_token,
                &chat_id.to_string(),
                &assistant_text,
                Some("Markdown"),
            )
            .await;
        if let Err(e) = chunk_res {
            warn!("Markdown send failed (likely unclosed syntax from model): {}. Falling back to plain text.", e);
            let _ = self
                .client
                .send_message_chunked(&bot_token, &chat_id.to_string(), &assistant_text, None)
                .await;
        }

        info!("✔ Successfully replied to Telegram chat {}", chat_id);
    }
}
