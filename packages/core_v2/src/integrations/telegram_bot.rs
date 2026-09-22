use anyhow::{anyhow, Result};
use chrono::Utc;
use parking_lot::Mutex as SyncMutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Notify, RwLock};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

use crate::automation::{BrowserNavigateTool, BrowserScreenshotTool, WebSearchTool};
use crate::integrations::telegram::{
    TelegramClient, TelegramMessage, TelegramSendMediaOptions, TelegramSendOptions,
};
use crate::media::GeneratePdfTool;
use crate::orchestrator::AgentEngine;
use crate::server::ipc::voice::transcribe_audio_bytes;
use crate::server::routes::chat::resolve_active_workspace_model;
use crate::server::state::SessionStateEntry;
use crate::storage::chat_storage::{ChatSession, ChatStorage};
use crate::storage::settings::{get_superagent_dir, SettingsStore};
use crate::tools::builtin::{
    CreateArtifactAppTool, EditFileTool, GetAvailableToolsTool, GlobTool, GrepSearchTool,
    ListArtifactsTool, ListDirTool, PlanTool, QuestionTool, ReadArtifactTool, ReadFileTool,
    RunCommandTool, SkillTool, SleepTimerTool, TelegramTool, TodoTool, WriteFileTool,
};
use crate::tools::ToolRegistry;
use crate::types::{ChatMessage, ContentBlock, ModelConfig, ProviderType, Role};

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
    #[serde(default)]
    pub auto_start: bool,
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

    /// Evaluates whether the bot should auto-start on daemon boot based on stored settings.
    pub fn is_autostart_enabled(&self) -> bool {
        let raw = self.settings_store.load_raw().unwrap_or_default();
        let tg_obj = raw.get("telegram");

        tg_obj
            .and_then(|t| t.get("autoStart").or_else(|| t.get("auto_start")))
            .and_then(|v| v.as_bool())
            .unwrap_or_else(|| {
                // Backwards-compatibility fallback: if autoStart hasn't been configured yet,
                // fallback to twoWayEnabled.
                tg_obj
                    .and_then(|t| t.get("twoWayEnabled").or_else(|| t.get("two_way_enabled")))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
            })
    }

    /// Checks settings and starts the bot worker if autoStart is true and botToken is configured.
    pub async fn autostart_if_enabled(self: &Arc<Self>) {
        let auto_start = self.is_autostart_enabled();

        let raw = self.settings_store.load_raw().unwrap_or_default();
        let tg_obj = raw.get("telegram");

        let token = tg_obj
            .and_then(|t| t.get("botToken").or_else(|| t.get("bot_token")))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .or_else(|| std::env::var("TELEGRAM_BOT_TOKEN").ok())
            .unwrap_or_default();

        if auto_start && !token.is_empty() {
            info!("🤖 Telegram 2-Way Bot auto-start is enabled. Launching polling engine...");
            let mut attempts = 0;
            while attempts < 3 {
                attempts += 1;
                match self.start().await {
                    Ok(_) => break,
                    Err(e) => {
                        error!(
                            "Attempt {}/3 to autostart Telegram bot failed: {}",
                            attempts, e
                        );
                        if attempts < 3 {
                            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                        }
                    }
                }
            }
        } else if !auto_start {
            info!("🤖 Telegram Bot auto-start is disabled in settings. Skipping launch on backend boot.");
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

                // Register default slash commands so they appear in Telegram clients
                let default_commands = vec![
                    crate::integrations::telegram::TelegramBotCommand {
                        command: "new".to_string(),
                        description: "Start a fresh conversation topic".to_string(),
                    },
                    crate::integrations::telegram::TelegramBotCommand {
                        command: "clear".to_string(),
                        description: "Clear conversation history".to_string(),
                    },
                    crate::integrations::telegram::TelegramBotCommand {
                        command: "status".to_string(),
                        description: "Show agent status and active model".to_string(),
                    },
                    crate::integrations::telegram::TelegramBotCommand {
                        command: "help".to_string(),
                        description: "Show capabilities and guide".to_string(),
                    },
                ];
                let _ = self
                    .client
                    .set_my_commands(&bot_token, &default_commands)
                    .await;
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
            auto_start: self.is_autostart_enabled(),
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
            .unwrap_or_else(|| "Telegram User".to_string());

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
                    resolve_telegram_model(&raw_settings, &self.settings_store);
                let status_msg = format!(
                    "⚡ *SuperAgent Status*\n• Engine: Native Rust Core v2\n• Active Model: `{}`\n• State: Connected & Ready",
                    model_id
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
            } else if trimmed == "/help" || trimmed == "/start" || trimmed == "/commands" {
                let help_msg = "🤖 *Welcome to SuperAgent*!\n\n\
                    Here are the commands you can use:\n\
                    • `/new` or `/clear` - Start a fresh conversation topic\n\
                    • `/status` - Show current agent model and system status\n\
                    • `/help` - Show capabilities and guide\n\n\
                    ✨ *SuperAgent Capabilities*:\n\
                    • **Video & Media Downloads**: Send YouTube Shorts, Reels, or video links with 'send me the video' to receive the file directly.\n\
                    • **Multi-message input**: Send multiple messages, ideas, or corrections in rapid bursts. I will wait for you to finish typing before providing one consolidated response.\n\
                    • **Multimodal files**: Send photos, voice notes, audio tracks, PDFs, code files, or documents.\n\
                    • **Voice notes**: Spoken voice notes are automatically transcribed using Whisper and processed.\n\
                    • **Adaptive Memory**: I remember context across chat gaps and can recall earlier discussions or preferences using `recall_memory`.";
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
        user_name: String,
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
                                turn_texts.push(format!("[Attached File: {}]", filename));
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

        // Direct Social Media Download Interceptor (Instagram Reels, YouTube Shorts/Video, TikTok, Twitter/X)
        if let Some(media_url) = extract_social_media_url(&prompt) {
            let prompt_lower = prompt.to_lowercase();
            let is_video_request = prompt_lower.contains("send")
                || prompt_lower.contains("video")
                || prompt_lower.contains("reel")
                || prompt_lower.contains("short")
                || prompt_lower.contains("download")
                || prompt_lower.contains("get")
                || prompt_lower.contains("play")
                || prompt_lower.contains("fetch")
                || prompt_lower.contains("watch")
                || turn_texts.len() == 1;

            if is_video_request {
                info!(
                    "🎬 Detected direct media video request for URL: {} in chat {}",
                    media_url, chat_id
                );
                let _ = self
                    .client
                    .send_chat_action(&bot_token, &chat_id.to_string(), "upload_video")
                    .await;

                if let Some(ytdlp_bin) = find_ytdlp_binary() {
                    let out_id = uuid::Uuid::new_v4().simple().to_string();
                    let out_filename = format!("media_{}.mp4", out_id);
                    let out_path = media_dir.join(&out_filename);
                    let out_template = media_dir
                        .join(format!("media_{}.%(ext)s", out_id))
                        .to_string_lossy()
                        .to_string();

                    let ffmpeg_bin = find_ffmpeg_binary();

                    info!(
                        "Running yt-dlp to download media to {} (ffmpeg: {:?})",
                        out_path.display(),
                        ffmpeg_bin
                    );
                    let mut cmd = tokio::process::Command::new(&ytdlp_bin);
                    cmd.arg("--no-playlist");
                    cmd.arg("--max-filesize").arg("48M");

                    if let Some(ref ff) = ffmpeg_bin {
                        cmd.arg("--ffmpeg-location").arg(ff);
                        cmd.args([
                            "-f",
                            "bv*[filesize<40M]+ba[filesize<8M]/b[filesize<48M]/best[filesize<48M]/bv*+ba/b",
                            "--merge-output-format",
                            "mp4",
                            "--format-sort",
                            "res:720,size",
                        ]);
                    } else {
                        // Without ffmpeg, yt-dlp cannot merge video and audio streams.
                        // Request single pre-merged formats (b / best / worst)
                        cmd.args([
                            "-f",
                            "b[filesize<48M]/best[filesize<48M]/worst[filesize<48M]/worst",
                        ]);
                    }

                    cmd.arg("-o").arg(&out_template);
                    cmd.arg(&media_url);

                    #[cfg(target_os = "windows")]
                    {
                        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    }

                    let dl_res = tokio::time::timeout(Duration::from_secs(45), cmd.output()).await;
                    match dl_res {
                        Ok(Ok(output)) => {
                            let mut found_file: Option<PathBuf> = None;
                            if out_path.exists() {
                                found_file = Some(out_path);
                            } else {
                                for ext in &["mp4", "mkv", "webm", "mov"] {
                                    let cand = media_dir.join(format!("media_{}.{}", out_id, ext));
                                    if cand.exists() {
                                        found_file = Some(cand);
                                        break;
                                    }
                                }
                            }

                            if let Some(final_video) = found_file {
                                let meta = tokio::fs::metadata(&final_video).await.ok();
                                let size_bytes = meta.map(|m| m.len()).unwrap_or(0);
                                if size_bytes > 0 {
                                    info!("Downloaded media file successfully ({} bytes). Sending to Telegram...", size_bytes);
                                    let send_opts = TelegramSendMediaOptions {
                                        bot_token: bot_token.clone(),
                                        chat_id: chat_id.to_string(),
                                        file_path_or_url: final_video.to_string_lossy().to_string(),
                                        caption: Some(format!(
                                            "🎬 Here is your video!\n{}",
                                            media_url
                                        )),
                                        media_type: Some("video".to_string()),
                                        title: None,
                                    };
                                    let send_res = self.client.send_media(&send_opts).await;
                                    match send_res {
                                        Ok(res) if res.success => {
                                            info!("✔ Video successfully delivered to Telegram chat {}", chat_id);
                                            let existing_session =
                                                self.chat_storage.load_session(&session_id).ok();
                                            let mut full_history = existing_session
                                                .as_ref()
                                                .map(|s| s.messages.clone())
                                                .unwrap_or_default();
                                            full_history.push(ChatMessage::user(&prompt));
                                            full_history.push(ChatMessage::assistant(format!(
                                                "🎬 Here is your video!\n{}",
                                                media_url
                                            )));
                                            let updated_session = ChatSession {
                                                id: session_id.clone(),
                                                title: generate_telegram_chat_title(
                                                    &prompt, &user_name,
                                                ),
                                                project: None,
                                                model: Some("media_downloader".to_string()),
                                                created_at: existing_session
                                                    .as_ref()
                                                    .map(|s| s.created_at)
                                                    .unwrap_or_else(|| {
                                                        Utc::now().timestamp_millis()
                                                    }),
                                                updated_at: Utc::now().timestamp_millis(),
                                                messages: full_history.clone(),
                                            };
                                            let _ =
                                                self.chat_storage.save_session(&updated_session);
                                            {
                                                let mut store = self.session_store.lock();
                                                let entry = SessionStateEntry {
                                                    full_assistant_text: format!(
                                                        "🎬 Here is your video!\n{}",
                                                        media_url
                                                    ),
                                                    conversation_history: full_history,
                                                    ..Default::default()
                                                };
                                                store.put(session_id.clone(), entry);
                                            }
                                            return;
                                        }
                                        Ok(res) => {
                                            warn!(
                                                "Telegram send_media returned failure: {:?}",
                                                res.error
                                            );
                                            let err_msg = res.error.unwrap_or_else(|| {
                                                "Failed to upload video to Telegram.".to_string()
                                            });
                                            let _ = self.client.send_message_chunked(
                                                &bot_token,
                                                &chat_id.to_string(),
                                                &format!("⚠️ Could not send video to Telegram: {}\n\nLink: {}", err_msg, media_url),
                                                None,
                                            ).await;
                                            return;
                                        }
                                        Err(e) => {
                                            warn!("Failed to send media to Telegram: {}", e);
                                            let _ = self.client.send_message_chunked(
                                                &bot_token,
                                                &chat_id.to_string(),
                                                &format!("⚠️ Network error sending video to Telegram: {}\n\nLink: {}", e, media_url),
                                                None,
                                            ).await;
                                            return;
                                        }
                                    }
                                }
                            } else {
                                let stderr = String::from_utf8_lossy(&output.stderr);
                                warn!(
                                    "yt-dlp completed but output file not found. stderr: {}",
                                    stderr
                                );
                                if stderr.contains("File is larger than max-filesize")
                                    || stderr.contains("exceeds")
                                {
                                    let _ = self.client.send_message_chunked(&bot_token, &chat_id.to_string(), "⚠️ The requested video exceeds Telegram's 50MB bot upload limit.", None).await;
                                    return;
                                } else if ffmpeg_bin.is_none()
                                    && (stderr.contains("ffmpeg")
                                        || stderr.contains("Requested format is not available")
                                        || stderr.contains("not available"))
                                {
                                    let _ = self.client.send_message_chunked(
                                        &bot_token,
                                        &chat_id.to_string(),
                                        "⚠️ This video requires FFmpeg to combine video and audio streams, but FFmpeg was not found on this machine.\n\n💡 Please install FFmpeg (e.g. `winget install Gyan.FFmpeg` or place `ffmpeg.exe` in ~/.superagent) to enable high-quality video downloads.",
                                        None,
                                    ).await;
                                    return;
                                } else {
                                    let error_snippet = stderr
                                        .lines()
                                        .find(|l| l.contains("ERROR:"))
                                        .unwrap_or("Unable to download this video format from the provided source.");
                                    let _ = self.client.send_message_chunked(
                                        &bot_token,
                                        &chat_id.to_string(),
                                        &format!("⚠️ Could not download video from the link:\n{}\n\nURL: {}", error_snippet, media_url),
                                        None,
                                    ).await;
                                    return;
                                }
                            }
                        }
                        Ok(Err(e)) => {
                            warn!("Failed to execute yt-dlp: {}", e);
                            let _ = self
                                .client
                                .send_message_chunked(
                                    &bot_token,
                                    &chat_id.to_string(),
                                    &format!("⚠️ Failed to launch media downloader: {}", e),
                                    None,
                                )
                                .await;
                            return;
                        }
                        Err(_) => {
                            warn!("yt-dlp execution timed out after 45s");
                            let _ = self.client.send_message_chunked(
                                &bot_token,
                                &chat_id.to_string(),
                                "⚠️ Video download timed out after 45s. The media server may be throttling or the file is too large.",
                                None,
                            ).await;
                            return;
                        }
                    }
                } else {
                    warn!("yt-dlp binary not found on system");
                    let _ = self
                        .client
                        .send_message_chunked(
                            &bot_token,
                            &chat_id.to_string(),
                            "⚠️ Video download tool (`yt-dlp`) is not installed on this system.",
                            None,
                        )
                        .await;
                    return;
                }
            }
        }

        // 3. Load or initialize continuous multi-turn chat session with adaptive context
        let existing_session = self.chat_storage.load_session(&session_id).ok();
        let (initial_history, adaptive_summary) = if let Some(ref sess) = existing_session {
            crate::memory::context::prepare_adaptive_history(
                &sess.messages,
                Some(sess.updated_at),
                7200, // 2-hour gap threshold
                10,   // up to 10 recent messages kept verbatim
            )
        } else {
            (Vec::new(), None)
        };

        // 4. Resolve Telegram model & provider
        let raw_settings = self.settings_store.load_raw().unwrap_or_default();
        let (prov_type, model_id, api_key, base_url) =
            resolve_telegram_model(&raw_settings, &self.settings_store);

        let mut model_config = ModelConfig::new(prov_type, model_id.clone());
        model_config.api_key = api_key.or_else(|| match model_config.provider {
            ProviderType::OpenAI => std::env::var("OPENAI_API_KEY").ok(),
            ProviderType::Anthropic => std::env::var("ANTHROPIC_API_KEY").ok(),
            ProviderType::Gemini => std::env::var("GEMINI_API_KEY").ok(),
            ProviderType::Groq => std::env::var("GROQ_API_KEY").ok(),
            ProviderType::DeepSeek => std::env::var("DEEPSEEK_API_KEY").ok(),
            ProviderType::OpenRouter => std::env::var("OPENROUTER_API_KEY").ok(),
            _ => None,
        });
        model_config.base_url = base_url;

        // 5. Build isolated Tool Registry for this Telegram session
        let effective_workspace = media_dir.parent().unwrap_or(&media_dir).to_path_buf();
        let mut tool_registry = ToolRegistry::new();
        tool_registry.register(CreateArtifactAppTool::new());
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
        tool_registry.register(WebSearchTool::new());
        tool_registry.register(BrowserNavigateTool::new());
        tool_registry.register(BrowserScreenshotTool::new(effective_workspace.clone()));
        tool_registry.register(GeneratePdfTool::new(effective_workspace.clone()));
        tool_registry.register(TelegramTool::with_chat_id(
            self.settings_store.clone(),
            effective_workspace.clone(),
            chat_id.to_string(),
        ));
        tool_registry.register(crate::tools::builtin::RecallMemoryTool::with_storage(
            self.chat_storage.clone(),
            Some(session_id.clone()),
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

        let adaptive_context_note = if let Some(ref summary) = adaptive_summary {
            format!("\n\n{}", summary)
        } else {
            String::new()
        };

        let system_prompt = format!(
            "You are SuperAgent, an intelligent and helpful AI assistant interacting directly with the user via Telegram.\n\
            - Be conversational, insightful, friendly, and practical.\n\
            - Adaptive Context & Memory: You have access to the `recall_memory` tool. If the user refers to past conversations, earlier links, previous tasks, or preferences from past sessions that are not in the immediate context window, use `recall_memory` to look them up.\n\
            - When the user asks you to send or download media (such as a YouTube video/short, song, audio note, image, or document):\n\
              1. Download or generate the media file into your working directory (e.g. using yt-dlp, curl, ffmpeg, or python via run_command).\n\
              2. Deliver the file directly to the user using the `telegram` tool with `file_path`.\n\
              3. Send a friendly message explaining what was done.\n\
            - If the user sends you images, documents, or voice recordings, analyze them thoroughly.\n\
            - When writing code, use markdown code blocks with language specifiers.\n\
            - Format your replies using clean Telegram Markdown or clear plain text.{}",
            adaptive_context_note
        );

        let engine = AgentEngine::new(Arc::new(tool_registry));

        // 6. Start background typing heartbeat task with safety ceiling & RAII guard
        let tok_heartbeat = bot_token.clone();
        let client_heartbeat = self.client.clone();
        let (heartbeat_stop_tx, mut heartbeat_stop_rx) = tokio::sync::oneshot::channel::<()>();

        struct TypingHeartbeatGuard {
            stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
        }
        impl Drop for TypingHeartbeatGuard {
            fn drop(&mut self) {
                if let Some(tx) = self.stop_tx.take() {
                    let _ = tx.send(());
                }
            }
        }
        let _typing_guard = TypingHeartbeatGuard {
            stop_tx: Some(heartbeat_stop_tx),
        };

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(4));
            let mut ticks = 0;
            const MAX_TYPING_TICKS: usize = 11; // 44-second maximum typing pulse ceiling
            loop {
                tokio::select! {
                    _ = &mut heartbeat_stop_rx => {
                        break;
                    }
                    _ = interval.tick() => {
                        ticks += 1;
                        if ticks > MAX_TYPING_TICKS {
                            debug!("Typing heartbeat safety ceiling reached; stopping pulse.");
                            break;
                        }
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
        let mut assistant_text = String::new();
        let mut new_messages_collected = Vec::new();
        let mut stream_error_msg: Option<String> = None;

        let run_res = engine
            .run_loop_with_history_and_attachments(
                &model_config,
                &system_prompt,
                &prompt,
                initial_history.clone(),
                attachments.clone(),
            )
            .await;

        match run_res {
            Ok((mut event_rx, mut history_rx)) => {
                while let Some(event) = event_rx.recv().await {
                    match event {
                        crate::types::AgentEvent::Token { text } => {
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
                        crate::types::AgentEvent::Error { message } => {
                            warn!(
                                "Agent stream error for Telegram chat {}: {}",
                                chat_id, message
                            );
                            stream_error_msg = Some(message);
                        }
                        crate::types::AgentEvent::ToolCall { .. } => {
                            let _ = self
                                .client
                                .send_chat_action(&bot_token, &chat_id.to_string(), "typing")
                                .await;
                        }
                        _ => {}
                    }
                }
                if let Some(new_msgs) = history_rx.recv().await {
                    new_messages_collected = new_msgs;
                }
            }
            Err(err) => {
                error!("Agent loop error for Telegram chat {}: {}", chat_id, err);
                stream_error_msg = Some(err.to_string());
            }
        }

        // Automatic Provider Failover on Rate Limit / Quota / FreeTier Error
        let needs_fallback = stream_error_msg.as_ref().is_some_and(|err| {
            err.contains("429")
                || err.contains("Rate limit")
                || err.contains("FreeUsageLimitError")
                || err.contains("daily usage limit")
                || err.contains("exhausted")
                || err.contains("quota")
                || err.contains("RESOURCE_EXHAUSTED")
                || err.contains("OpenCode Zen cloud streaming error")
        });

        if needs_fallback && assistant_text.trim().is_empty() {
            let fallback_gemini_key = self
                .settings_store
                .get_api_key("gemini")
                .ok()
                .flatten()
                .or_else(|| self.settings_store.get_api_key("google").ok().flatten())
                .or_else(|| std::env::var("GEMINI_API_KEY").ok())
                .or_else(|| std::env::var("GOOGLE_API_KEY").ok());

            if let Some(key) = fallback_gemini_key {
                if model_config.provider != ProviderType::Gemini {
                    info!(
                        "🔄 Primary model '{}' failed with rate limit. Automatically failing over to Gemini (gemini-3.6-flash)...",
                        model_config.model_id
                    );
                    let mut fallback_config =
                        ModelConfig::new(ProviderType::Gemini, "gemini-3.6-flash".to_string());
                    fallback_config.api_key = Some(key);

                    let fallback_res = engine
                        .run_loop_with_history_and_attachments(
                            &fallback_config,
                            &system_prompt,
                            &prompt,
                            initial_history.clone(),
                            attachments.clone(),
                        )
                        .await;

                    if let Ok((mut fb_event_rx, mut fb_hist_rx)) = fallback_res {
                        stream_error_msg = None;
                        while let Some(event) = fb_event_rx.recv().await {
                            match event {
                                crate::types::AgentEvent::Token { text } => {
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
                                crate::types::AgentEvent::Error { message } => {
                                    warn!("Fallback stream error: {}", message);
                                    stream_error_msg = Some(message);
                                }
                                crate::types::AgentEvent::ToolCall { .. } => {
                                    let _ = self
                                        .client
                                        .send_chat_action(
                                            &bot_token,
                                            &chat_id.to_string(),
                                            "typing",
                                        )
                                        .await;
                                }
                                _ => {}
                            }
                        }
                        if let Some(fb_msgs) = fb_hist_rx.recv().await {
                            new_messages_collected = fb_msgs;
                        }
                    }
                }
            }
        }

        // Clean up cancellation handle
        {
            let mut cancels = self.active_cancellations.lock();
            cancels.remove(&session_id);
        }

        // Stop the typing heartbeat
        drop(_typing_guard);

        // Extract assistant response if not streamed as individual tokens
        if assistant_text.trim().is_empty() {
            for msg in new_messages_collected.iter().rev() {
                if msg.role == Role::Assistant {
                    let txt = msg.text_content();
                    if !txt.trim().is_empty() {
                        assistant_text = txt;
                        break;
                    }
                }
            }
        }

        // If still empty, check if tool calls produced output or error
        if assistant_text.trim().is_empty() {
            let mut tool_results = Vec::new();
            for msg in &new_messages_collected {
                for block in &msg.content {
                    if let ContentBlock::ToolResult {
                        content, is_error, ..
                    } = block
                    {
                        if !content.trim().is_empty() {
                            tool_results.push((content.clone(), *is_error));
                        }
                    }
                }
            }
            if let Some((last_result, is_err)) = tool_results.last() {
                if *is_err {
                    assistant_text =
                        format!("⚠️ Action resulted in an error:\n```\n{}\n```", last_result);
                } else {
                    assistant_text = last_result.clone();
                }
            }
        }

        // If still empty and a stream error was captured, report it
        if assistant_text.trim().is_empty() {
            if let Some(err) = stream_error_msg {
                if err.contains("FreeUsageLimitError")
                    || err.contains("daily usage limit")
                    || err.contains("Rate limit")
                    || err.contains("429")
                {
                    assistant_text = "⚠️ The AI service is currently experiencing high demand or rate limits. Please configure an API key in Settings for unlimited access or try again shortly.".to_string();
                } else {
                    assistant_text = format!(
                        "⚠️ I ran into an error while processing your request: {}",
                        err
                    );
                }
            }
        }

        if assistant_text.trim().is_empty() {
            assistant_text = "I have processed your request.".to_string();
        }

        // 8. Save updated session to ChatStorage (preserving complete history)
        let mut full_history = existing_session
            .as_ref()
            .map(|s| s.messages.clone())
            .unwrap_or_default();
        if !new_messages_collected.is_empty() {
            full_history.extend(new_messages_collected);
        } else {
            full_history.push(ChatMessage::user(&prompt));
            if !assistant_text.is_empty() {
                full_history.push(ChatMessage::assistant(assistant_text.clone()));
            }
        }

        let session_title = if let Some(ref sess) = existing_session {
            let current = sess.title.trim();
            if !current.is_empty()
                && !current.starts_with("Telegram Chat")
                && current != "Telegram Assistant"
            {
                sess.title.clone()
            } else {
                generate_telegram_chat_title(&prompt, &user_name)
            }
        } else {
            generate_telegram_chat_title(&prompt, &user_name)
        };

        let updated_session = ChatSession {
            id: session_id.clone(),
            title: session_title,
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

/// Extracts a direct downloadable social media video link from text (Instagram Reel/Post, YouTube Short/Video, TikTok, Twitter/X)
pub fn extract_social_media_url(text: &str) -> Option<String> {
    for word in text.split_whitespace() {
        let clean = word.trim_matches(|c: char| {
            c == '<'
                || c == '>'
                || c == '('
                || c == ')'
                || c == '"'
                || c == '\''
                || c == '['
                || c == ']'
                || c == ','
        });
        if clean.starts_with("http://") || clean.starts_with("https://") {
            let lower = clean.to_lowercase();
            if lower.contains("instagram.com/reel/")
                || lower.contains("instagram.com/p/")
                || lower.contains("instagram.com/share/")
                || lower.contains("youtube.com/shorts/")
                || lower.contains("youtube.com/watch")
                || lower.contains("youtu.be/")
                || lower.contains("tiktok.com/")
                || lower.contains("x.com/")
                || lower.contains("twitter.com/")
                || lower.contains("fb.watch/")
            {
                return Some(clean.to_string());
            }
        }
    }
    None
}

/// Locates yt-dlp binary across user data directories and system PATH
pub fn find_ytdlp_binary() -> Option<PathBuf> {
    let sa_dir = crate::storage::settings::get_superagent_dir();
    let candidates = [
        sa_dir.join("yt-dlp.exe"),
        sa_dir.join("bin").join("yt-dlp.exe"),
        sa_dir.join("yt-dlp"),
        sa_dir.join("bin").join("yt-dlp"),
        PathBuf::from("C:\\ProgramData\\SuperAgent\\bin\\yt-dlp.exe"),
    ];
    for c in &candidates {
        if c.exists() {
            return Some(c.clone());
        }
    }

    if let Ok(output) =
        std::process::Command::new(if cfg!(windows) { "where.exe" } else { "which" })
            .arg("yt-dlp")
            .output()
    {
        if output.status.success() {
            if let Ok(s) = String::from_utf8(output.stdout) {
                if let Some(first_line) = s.lines().next() {
                    let p = PathBuf::from(first_line.trim());
                    if p.exists() {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}

/// Locates ffmpeg binary across user data directories, WinGet, Chocolatey, and system PATH
pub fn find_ffmpeg_binary() -> Option<PathBuf> {
    let sa_dir = crate::storage::settings::get_superagent_dir();
    let candidates = [
        sa_dir.join("ffmpeg.exe"),
        sa_dir.join("bin").join("ffmpeg.exe"),
        sa_dir.join("bin").join("ffmpeg").join(if cfg!(windows) {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        }),
        sa_dir.join("ffmpeg"),
        sa_dir.join("bin").join("ffmpeg"),
        PathBuf::from("C:\\ProgramData\\SuperAgent\\bin\\ffmpeg.exe"),
        PathBuf::from("C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe"),
        PathBuf::from("C:\\ffmpeg\\bin\\ffmpeg.exe"),
        PathBuf::from("C:\\tools\\ffmpeg\\bin\\ffmpeg.exe"),
    ];
    for c in &candidates {
        if c.exists() {
            return Some(c.clone());
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            let local_path = PathBuf::from(&local_appdata);
            let winget_link = local_path
                .join("Microsoft")
                .join("WinGet")
                .join("Links")
                .join("ffmpeg.exe");
            if winget_link.exists() {
                return Some(winget_link);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        for mac in &[
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/opt/local/bin/ffmpeg",
        ] {
            let p = PathBuf::from(mac);
            if p.exists() {
                return Some(p);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for linux in &[
            "/usr/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/snap/bin/ffmpeg",
        ] {
            let p = PathBuf::from(linux);
            if p.exists() {
                return Some(p);
            }
        }
    }

    if let Ok(output) =
        std::process::Command::new(if cfg!(windows) { "where.exe" } else { "which" })
            .arg("ffmpeg")
            .output()
    {
        if output.status.success() {
            if let Ok(s) = String::from_utf8(output.stdout) {
                if let Some(first_line) = s.lines().next() {
                    let p = PathBuf::from(first_line.trim());
                    if p.exists() {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}

/// Generates a clean, topic-based chat title for Telegram conversations without exposing private user/chat IDs.
pub fn generate_telegram_chat_title(prompt: &str, user_name: &str) -> String {
    // If the prompt includes voice note transcription tags, extract the transcribed text
    let prompt_to_clean = if let Some(idx) = prompt.find("[Voice Message Transcribed]:") {
        &prompt[idx + "[Voice Message Transcribed]:".len()..]
    } else {
        prompt
    };

    let clean = prompt_to_clean
        .lines()
        .map(|l| l.trim())
        .find(|l| {
            !l.is_empty() && !l.starts_with('[') && !l.starts_with('#') && !l.starts_with("```")
        })
        .unwrap_or("")
        .trim();

    // Strip leading punctuation, commands, or quote marks
    let trimmed = clean
        .trim_matches(['"', '\''])
        .trim_start_matches(['/', '?', '!', '.', ':'])
        .trim();

    if !trimmed.is_empty() {
        let words: Vec<&str> = trimmed.split_whitespace().collect();
        if !words.is_empty() {
            let mut selected = Vec::new();
            let mut total_len = 0;
            for word in words {
                if selected.len() >= 6 || (total_len + word.len() > 36 && selected.len() >= 2) {
                    break;
                }
                total_len += word.len() + 1;
                selected.push(word);
            }
            if !selected.is_empty() {
                return selected.join(" ");
            }
        }
    }

    if !user_name.trim().is_empty()
        && user_name != "Telegram User"
        && !user_name.chars().all(|c| c.is_ascii_digit())
    {
        format!("Telegram: {}", user_name.trim())
    } else {
        "Telegram Conversation".to_string()
    }
}

/// Resolves the LLM provider and model to use for Telegram requests.
/// Respects user-configured model in Telegram settings first, falling back to the active workspace model.
pub fn resolve_telegram_model(
    raw_settings: &serde_json::Value,
    settings_store: &crate::storage::SettingsStore,
) -> (ProviderType, String, Option<String>, Option<String>) {
    let tg_obj = raw_settings.get("telegram");

    if let Some(tg) = tg_obj {
        let chosen_model = tg
            .get("model")
            .or_else(|| tg.get("modelId"))
            .or_else(|| tg.get("model_id"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let chosen_provider = tg
            .get("provider")
            .or_else(|| tg.get("providerId"))
            .or_else(|| tg.get("provider_id"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();

        if !chosen_model.is_empty() && chosen_model != "auto" {
            let (prov_hint, m_id) = if chosen_model.contains("::") {
                let parts: Vec<&str> = chosen_model.split("::").collect();
                (parts[0], parts[1])
            } else if !chosen_provider.is_empty() {
                (chosen_provider, chosen_model)
            } else {
                ("", chosen_model)
            };

            // 1. Look up model in raw_settings["models"]
            if let Some(models) = raw_settings.get("models").and_then(|m| m.as_array()) {
                if let Some(matched) = models.iter().find(|m| {
                    let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    let name = m.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let pid = m.get("providerId").and_then(|v| v.as_str()).unwrap_or("");

                    if !prov_hint.is_empty() && !pid.eq_ignore_ascii_case(prov_hint) {
                        return false;
                    }
                    id == m_id || name == m_id || id.ends_with(&format!("-{}", m_id))
                }) {
                    let pid = matched
                        .get("providerId")
                        .and_then(|v| v.as_str())
                        .unwrap_or(prov_hint);
                    let id = matched.get("id").and_then(|v| v.as_str()).unwrap_or(m_id);
                    let prefix = format!("{}-", pid);
                    let clean_id = if id.starts_with(&prefix) {
                        &id[prefix.len()..]
                    } else {
                        id
                    };
                    let mut prov_type = match pid.to_lowercase().as_str() {
                        "gemini" | "google" => ProviderType::Gemini,
                        "openai" => ProviderType::OpenAI,
                        "anthropic" | "claude" => ProviderType::Anthropic,
                        "ollama" => ProviderType::Ollama,
                        "openrouter" => ProviderType::OpenRouter,
                        "deepseek" => ProviderType::DeepSeek,
                        "groq" => ProviderType::Groq,
                        "opencode" => ProviderType::OpenCode,
                        _ => ProviderType::Gemini,
                    };
                    if crate::providers::opencode::OPENCODE_FREE_MODELS.contains(&clean_id) {
                        prov_type = ProviderType::OpenCode;
                    }
                    let api_key = matched
                        .get("apiKey")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| settings_store.get_api_key(pid).ok().flatten());
                    let base_url = matched
                        .get("baseUrl")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    return (prov_type, clean_id.to_string(), api_key, base_url);
                }
            }

            // 2. Direct provider type mapping if not in models array
            let mut prov_type = match prov_hint.to_lowercase().as_str() {
                "gemini" | "google" => ProviderType::Gemini,
                "openai" => ProviderType::OpenAI,
                "anthropic" | "claude" => ProviderType::Anthropic,
                "ollama" => ProviderType::Ollama,
                "openrouter" => ProviderType::OpenRouter,
                "deepseek" => ProviderType::DeepSeek,
                "groq" => ProviderType::Groq,
                "opencode" => ProviderType::OpenCode,
                _ => ProviderType::Gemini,
            };
            let clean_id = if !prov_hint.is_empty() && m_id.starts_with(&format!("{}-", prov_hint))
            {
                &m_id[prov_hint.len() + 1..]
            } else {
                m_id
            };
            if crate::providers::opencode::OPENCODE_FREE_MODELS.contains(&clean_id) {
                prov_type = ProviderType::OpenCode;
            }
            let api_key = settings_store.get_api_key(prov_hint).ok().flatten();
            return (prov_type, clean_id.to_string(), api_key, None);
        }
    }

    // 3. Fallback to active workspace model
    resolve_active_workspace_model(raw_settings, settings_store)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_bot(tg_val: serde_json::Value) -> (TelegramBotManager, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("test_tg_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&dir);
        let settings = Arc::new(SettingsStore::with_path(dir.join("settings.json")));
        let _ = settings.save_raw(&serde_json::json!({
            "telegram": tg_val
        }));

        let chat_storage = Arc::new(ChatStorage::with_dir(dir.join("chats")));
        let (ws_tx, _) = tokio::sync::broadcast::channel(10);
        let session_store = Arc::new(parking_lot::Mutex::new(lru::LruCache::new(
            std::num::NonZeroUsize::new(10).unwrap(),
        )));
        let active_cancellations = Arc::new(parking_lot::Mutex::new(HashMap::new()));

        let bot = TelegramBotManager::new(
            settings,
            chat_storage,
            ws_tx,
            session_store,
            active_cancellations,
        );

        (bot, dir)
    }

    #[test]
    fn test_is_autostart_enabled_explicit_true() {
        let (bot, dir) = create_test_bot(serde_json::json!({
            "autoStart": true,
            "twoWayEnabled": false,
            "botToken": "123:abc"
        }));

        assert!(bot.is_autostart_enabled());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn test_is_autostart_enabled_explicit_false() {
        let (bot, dir) = create_test_bot(serde_json::json!({
            "autoStart": false,
            "twoWayEnabled": true,
            "botToken": "123:abc"
        }));

        assert!(!bot.is_autostart_enabled());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn test_is_autostart_enabled_fallback_two_way() {
        let (bot, dir) = create_test_bot(serde_json::json!({
            "twoWayEnabled": true,
            "botToken": "123:abc"
        }));

        assert!(bot.is_autostart_enabled());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn test_is_autostart_enabled_snake_case() {
        let (bot, dir) = create_test_bot(serde_json::json!({
            "auto_start": true,
            "botToken": "123:abc"
        }));

        assert!(bot.is_autostart_enabled());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn test_generate_telegram_chat_title_never_contains_user_id() {
        let title = generate_telegram_chat_title(
            "can you download this youtube short video for me",
            "5084960883",
        );
        assert_eq!(title, "can you download this youtube short");
        assert!(!title.contains("5084960883"));

        let title_voice = generate_telegram_chat_title(
            "[Voice Message Transcribed]: \"please summarize my notes\"",
            "Aninda",
        );
        assert_eq!(title_voice, "please summarize my notes");

        let title_empty = generate_telegram_chat_title("", "5084960883");
        assert_eq!(title_empty, "Telegram Conversation");
        assert!(!title_empty.contains("5084960883"));

        let title_user = generate_telegram_chat_title("", "Aninda");
        assert_eq!(title_user, "Telegram: Aninda");
    }

    #[test]
    fn test_resolve_telegram_model_explicit() {
        let dir = std::env::temp_dir().join(format!("test_tg_model_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&dir);
        let settings = SettingsStore::with_path(dir.join("settings.json"));
        let _ = settings.set_api_key("gemini", "test-gemini-key");

        let raw = serde_json::json!({
            "telegram": {
                "model": "gemini-2.5-flash",
                "provider": "gemini"
            },
            "models": [
                {
                    "id": "gemini-gemini-2.5-flash",
                    "name": "Gemini 2.5 Flash",
                    "providerId": "gemini",
                    "enabled": true
                }
            ]
        });

        let (prov, model_id, api_key, _) = resolve_telegram_model(&raw, &settings);
        assert_eq!(prov, ProviderType::Gemini);
        assert_eq!(model_id, "gemini-2.5-flash");
        assert_eq!(api_key, Some("test-gemini-key".to_string()));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn test_resolve_telegram_model_colon_format() {
        let dir = std::env::temp_dir().join(format!("test_tg_model2_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&dir);
        let settings = SettingsStore::with_path(dir.join("settings.json"));
        let _ = settings.set_api_key("openai", "test-openai-key");

        let raw = serde_json::json!({
            "telegram": {
                "model": "openai::gpt-4o"
            },
            "models": [
                {
                    "id": "openai-gpt-4o",
                    "name": "GPT-4o",
                    "providerId": "openai",
                    "enabled": true
                }
            ]
        });

        let (prov, model_id, api_key, _) = resolve_telegram_model(&raw, &settings);
        assert_eq!(prov, ProviderType::OpenAI);
        assert_eq!(model_id, "gpt-4o");
        assert_eq!(api_key, Some("test-openai-key".to_string()));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn test_resolve_telegram_model_fallback_to_workspace() {
        let dir = std::env::temp_dir().join(format!("test_tg_model3_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&dir);
        let settings = SettingsStore::with_path(dir.join("settings.json"));
        let _ = settings.set_api_key("anthropic", "test-claude-key");

        let raw = serde_json::json!({
            "telegram": {
                "model": "auto"
            },
            "lastUsedModel": "claude-3-5-sonnet",
            "models": [
                {
                    "id": "anthropic-claude-3-5-sonnet",
                    "name": "Claude 3.5 Sonnet",
                    "providerId": "anthropic",
                    "enabled": true
                }
            ]
        });

        let (prov, model_id, api_key, _) = resolve_telegram_model(&raw, &settings);
        assert_eq!(prov, ProviderType::Anthropic);
        assert_eq!(model_id, "claude-3-5-sonnet");
        assert_eq!(api_key, Some("test-claude-key".to_string()));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn test_extract_social_media_url_instagram_reel() {
        let text1 = "https://www.instagram.com/reel/DdZJqMrBzK6/";
        assert_eq!(
            extract_social_media_url(text1),
            Some("https://www.instagram.com/reel/DdZJqMrBzK6/".to_string())
        );

        let text2 = "[User sent 2 messages in sequence]:\n1. https://www.instagram.com/reel/DdZJqMrBzK6/\n2. Send me the video";
        assert_eq!(
            extract_social_media_url(text2),
            Some("https://www.instagram.com/reel/DdZJqMrBzK6/".to_string())
        );
    }

    #[test]
    fn test_extract_social_media_url_youtube_shorts() {
        let text = "Check this short out: https://youtube.com/shorts/abc123xyz please";
        assert_eq!(
            extract_social_media_url(text),
            Some("https://youtube.com/shorts/abc123xyz".to_string())
        );
    }

    #[test]
    fn test_extract_social_media_url_tiktok() {
        let text = "Watch this TikTok: https://www.tiktok.com/@user/video/7123456789012345678";
        assert_eq!(
            extract_social_media_url(text),
            Some("https://www.tiktok.com/@user/video/7123456789012345678".to_string())
        );
    }

    #[test]
    fn test_extract_social_media_url_twitter_x() {
        let text = "Awesome clip: https://x.com/OpenAI/status/1880000000000000000 please download";
        assert_eq!(
            extract_social_media_url(text),
            Some("https://x.com/OpenAI/status/1880000000000000000".to_string())
        );

        let text2 = "Old link format: https://twitter.com/nasa/status/123456789";
        assert_eq!(
            extract_social_media_url(text2),
            Some("https://twitter.com/nasa/status/123456789".to_string())
        );
    }

    #[test]
    fn test_extract_social_media_url_youtube_watch() {
        let text = "Watch: https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        assert_eq!(
            extract_social_media_url(text),
            Some("https://www.youtube.com/watch?v=dQw4w9WgXcQ".to_string())
        );

        let text2 = "Short format: https://youtu.be/dQw4w9WgXcQ";
        assert_eq!(
            extract_social_media_url(text2),
            Some("https://youtu.be/dQw4w9WgXcQ".to_string())
        );
    }

    #[test]
    fn test_extract_social_media_url_bracket_sanitization() {
        let text = "Check (<https://www.instagram.com/reel/DdZJqMrBzK6/>)";
        assert_eq!(
            extract_social_media_url(text),
            Some("https://www.instagram.com/reel/DdZJqMrBzK6/".to_string())
        );
    }

    #[test]
    fn test_extract_social_media_url_negative() {
        let text = "Hello SuperAgent! Can you explain how async rust works?";
        assert_eq!(extract_social_media_url(text), None);
    }

    #[test]
    fn test_find_ytdlp_binary() {
        // Since yt-dlp is installed on system, this returns Some
        let bin = find_ytdlp_binary();
        assert!(bin.is_some());
    }

    #[tokio::test]
    async fn test_typing_heartbeat_guard_drop_signal() {
        let (tx, mut rx) = tokio::sync::oneshot::channel::<()>();

        struct TypingHeartbeatGuard {
            stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
        }
        impl Drop for TypingHeartbeatGuard {
            fn drop(&mut self) {
                if let Some(tx) = self.stop_tx.take() {
                    let _ = tx.send(());
                }
            }
        }

        {
            let _guard = TypingHeartbeatGuard { stop_tx: Some(tx) };
            assert!(rx.try_recv().is_err());
        }

        // After scope ends and guard is dropped, signal MUST have been delivered
        assert!(rx.try_recv().is_ok());
    }

    #[test]
    fn test_find_ffmpeg_binary() {
        let bin = find_ffmpeg_binary();
        assert!(bin.is_some());
    }
}
