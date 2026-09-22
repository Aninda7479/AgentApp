use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramSendOptions {
    pub bot_token: String,
    pub chat_id: String,
    pub text: String,
    pub parse_mode: Option<String>,
    pub disable_notification: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramSendMediaOptions {
    pub bot_token: String,
    pub chat_id: String,
    pub file_path_or_url: String,
    pub media_type: Option<String>,
    pub title: Option<String>,
    pub caption: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramSendResult {
    pub success: bool,
    pub message_id: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TelegramBotCommand {
    pub command: String,
    pub description: String,
}

// ─── Telegram Bot API Inbound Models ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramUser {
    pub id: i64,
    #[serde(default)]
    pub is_bot: bool,
    pub first_name: String,
    pub last_name: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramChat {
    pub id: i64,
    pub r#type: String,
    pub title: Option<String>,
    pub username: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramPhotoSize {
    pub file_id: String,
    pub file_unique_id: String,
    pub width: u32,
    pub height: u32,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramVoice {
    pub file_id: String,
    pub file_unique_id: String,
    pub duration: u32,
    pub mime_type: Option<String>,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramAudio {
    pub file_id: String,
    pub file_unique_id: String,
    pub duration: u32,
    pub performer: Option<String>,
    pub title: Option<String>,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramDocument {
    pub file_id: String,
    pub file_unique_id: String,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramVideo {
    pub file_id: String,
    pub file_unique_id: String,
    pub width: u32,
    pub height: u32,
    pub duration: u32,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramMessage {
    pub message_id: i64,
    pub message_thread_id: Option<i64>,
    pub from: Option<TelegramUser>,
    pub chat: TelegramChat,
    pub date: i64,
    pub text: Option<String>,
    pub caption: Option<String>,
    pub photo: Option<Vec<TelegramPhotoSize>>,
    pub voice: Option<TelegramVoice>,
    pub audio: Option<TelegramAudio>,
    pub document: Option<TelegramDocument>,
    pub video: Option<TelegramVideo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramUpdate {
    pub update_id: i64,
    pub message: Option<TelegramMessage>,
    pub edited_message: Option<TelegramMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramFileInfo {
    pub file_id: String,
    pub file_unique_id: Option<String>,
    pub file_size: Option<u64>,
    pub file_path: Option<String>,
}

// ─── Connection-Pooled Telegram Client ────────────────────────────────────────

#[derive(Clone)]
pub struct TelegramClient {
    client: reqwest::Client,
    poll_client: reqwest::Client,
}

impl TelegramClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(10)
            .tcp_keepalive(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let poll_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(75))
            .pool_idle_timeout(Duration::from_secs(120))
            .pool_max_idle_per_host(5)
            .tcp_keepalive(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            client,
            poll_client,
        }
    }

    /// Sends a text message to a Telegram chat or channel.
    pub async fn send_message(&self, options: &TelegramSendOptions) -> Result<TelegramSendResult> {
        if options.bot_token.is_empty() || options.chat_id.is_empty() {
            return Ok(TelegramSendResult {
                success: false,
                message_id: None,
                error: Some("Bot token and chat ID are required".to_string()),
            });
        }

        let endpoint = format!(
            "https://api.telegram.org/bot{}/sendMessage",
            options.bot_token
        );

        let mut payload = serde_json::json!({
            "chat_id": options.chat_id,
            "text": options.text,
        });

        if let Some(ref mode) = options.parse_mode {
            payload["parse_mode"] = serde_json::Value::String(mode.clone());
        }

        if let Some(disable) = options.disable_notification {
            payload["disable_notification"] = serde_json::Value::Bool(disable);
        }

        let resp = self.client.post(&endpoint).json(&payload).send().await?;
        Self::parse_response(resp).await
    }

    /// Sends long messages cleanly chunked at <= 4096 character boundaries.
    /// If delivery with parse_mode (e.g. Markdown) fails, automatically falls back to plain text.
    pub async fn send_message_chunked(
        &self,
        bot_token: &str,
        chat_id: &str,
        text: &str,
        parse_mode: Option<&str>,
    ) -> Result<Vec<TelegramSendResult>> {
        let chunks = split_telegram_message(text, 4000);
        let mut results = Vec::with_capacity(chunks.len());

        for (i, chunk) in chunks.iter().enumerate() {
            let opts = TelegramSendOptions {
                bot_token: bot_token.to_string(),
                chat_id: chat_id.to_string(),
                text: chunk.clone(),
                parse_mode: parse_mode.map(|s| s.to_string()),
                disable_notification: if i == 0 { None } else { Some(true) },
            };
            let mut res = self.send_message(&opts).await?;
            if !res.success && parse_mode.is_some() {
                // If markdown parsing failed, retry plain text
                let fallback_opts = TelegramSendOptions {
                    parse_mode: None,
                    ..opts
                };
                if let Ok(fb_res) = self.send_message(&fallback_opts).await {
                    if fb_res.success {
                        res = fb_res;
                    }
                }
            }
            results.push(res);

            // Small throttle between chunk deliveries to prevent rate-limit 429
            if i + 1 < chunks.len() {
                tokio::time::sleep(Duration::from_millis(300)).await;
            }
        }

        Ok(results)
    }

    /// Registers bot slash commands with the Telegram Bot API via `setMyCommands`.
    pub async fn set_my_commands(
        &self,
        bot_token: &str,
        commands: &[TelegramBotCommand],
    ) -> Result<bool> {
        if bot_token.is_empty() {
            return Ok(false);
        }

        let endpoint = format!("https://api.telegram.org/bot{}/setMyCommands", bot_token);
        let payload = serde_json::json!({
            "commands": commands,
        });

        let resp = self.client.post(&endpoint).json(&payload).send().await?;
        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await?;
            Ok(json.get("ok").and_then(|v| v.as_bool()).unwrap_or(false))
        } else {
            Ok(false)
        }
    }

    /// Sends a chat action (e.g. "typing", "upload_document", "record_voice").
    pub async fn send_chat_action(
        &self,
        bot_token: &str,
        chat_id: &str,
        action: &str,
    ) -> Result<bool> {
        if bot_token.is_empty() || chat_id.is_empty() {
            return Ok(false);
        }

        let endpoint = format!("https://api.telegram.org/bot{}/sendChatAction", bot_token);

        let payload = serde_json::json!({
            "chat_id": chat_id,
            "action": action,
        });

        let resp = self.client.post(&endpoint).json(&payload).send().await?;
        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await?;
            Ok(json.get("ok").and_then(|v| v.as_bool()).unwrap_or(false))
        } else {
            Ok(false)
        }
    }

    /// Polls for incoming updates via long polling.
    pub async fn get_updates(
        &self,
        bot_token: &str,
        offset: Option<i64>,
        timeout_secs: u64,
    ) -> Result<Vec<TelegramUpdate>> {
        if bot_token.is_empty() {
            return Ok(Vec::new());
        }

        let endpoint = format!("https://api.telegram.org/bot{}/getUpdates", bot_token);

        let mut payload = serde_json::json!({
            "timeout": timeout_secs,
            "allowed_updates": ["message", "edited_message"]
        });

        if let Some(off) = offset {
            payload["offset"] = serde_json::Value::Number(serde_json::Number::from(off));
        }

        let resp = self
            .poll_client
            .post(&endpoint)
            .json(&payload)
            .send()
            .await?;
        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await?;
            if let Some(arr) = json.get("result").and_then(|v| v.as_array()) {
                let updates: Vec<TelegramUpdate> = arr
                    .iter()
                    .filter_map(|u| serde_json::from_value(u.clone()).ok())
                    .collect();
                return Ok(updates);
            }
            Ok(Vec::new())
        } else {
            let err_text = resp
                .text()
                .await
                .unwrap_or_else(|_| "getUpdates request failed".to_string());
            Err(anyhow!("Telegram API error: {}", err_text))
        }
    }

    /// Gets file metadata including file_path for download.
    pub async fn get_file(&self, bot_token: &str, file_id: &str) -> Result<TelegramFileInfo> {
        let endpoint = format!("https://api.telegram.org/bot{}/getFile", bot_token);

        let payload = serde_json::json!({ "file_id": file_id });
        let resp = self.client.post(&endpoint).json(&payload).send().await?;

        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await?;
            if let Some(result) = json.get("result") {
                let info: TelegramFileInfo = serde_json::from_value(result.clone())?;
                return Ok(info);
            }
            Err(anyhow!("Missing 'result' in Telegram getFile response"))
        } else {
            let err_text = resp.text().await.unwrap_or_default();
            Err(anyhow!(
                "Failed to get file info from Telegram: {}",
                err_text
            ))
        }
    }

    /// Downloads a file by file_path from Telegram's file server.
    pub async fn download_file(&self, bot_token: &str, file_path: &str) -> Result<Vec<u8>> {
        let clean_path = file_path.trim_start_matches('/');
        let url = format!(
            "https://api.telegram.org/file/bot{}/{}",
            bot_token, clean_path
        );

        let resp = self.client.get(&url).send().await?;
        if resp.status().is_success() {
            let bytes = resp.bytes().await?;
            Ok(bytes.to_vec())
        } else {
            let err_text = resp.text().await.unwrap_or_default();
            Err(anyhow!(
                "Failed to download file from Telegram: {}",
                err_text
            ))
        }
    }

    /// Sends media (audio, video, document) to a Telegram chat or channel.
    pub async fn send_media(
        &self,
        options: &TelegramSendMediaOptions,
    ) -> Result<TelegramSendResult> {
        if options.bot_token.is_empty() || options.chat_id.is_empty() {
            return Ok(TelegramSendResult {
                success: false,
                message_id: None,
                error: Some("Bot token and chat ID are required".to_string()),
            });
        }

        let target = options.file_path_or_url.trim();
        if target.is_empty() {
            return Ok(TelegramSendResult {
                success: false,
                message_id: None,
                error: Some("File path or URL is required".to_string()),
            });
        }

        let ext = Path::new(target)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let media_type = options
            .media_type
            .as_deref()
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|| match ext.as_str() {
                "mp3" | "m4a" | "wav" | "ogg" | "flac" | "aac" | "opus" => "audio".to_string(),
                "mp4" | "webm" | "mkv" | "mov" | "avi" => "video".to_string(),
                "jpg" | "jpeg" | "png" | "webp" | "gif" => "photo".to_string(),
                _ => "document".to_string(),
            });

        let (method, file_field) = match media_type.as_str() {
            "audio" => ("sendAudio", "audio"),
            "video" => ("sendVideo", "video"),
            "photo" => ("sendPhoto", "photo"),
            _ => ("sendDocument", "document"),
        };

        let endpoint = format!(
            "https://api.telegram.org/bot{}/{}",
            options.bot_token, method
        );

        let is_url = target.starts_with("http://") || target.starts_with("https://");

        if is_url {
            let mut payload = serde_json::json!({
                "chat_id": options.chat_id,
                file_field: target,
            });
            if let Some(ref cap) = options.caption {
                payload["caption"] = serde_json::Value::String(cap.clone());
            }
            if method == "sendAudio" {
                if let Some(ref title) = options.title {
                    payload["title"] = serde_json::Value::String(title.clone());
                }
            }
            let resp = self.client.post(&endpoint).json(&payload).send().await?;
            return Self::parse_response(resp).await;
        }

        let path = Path::new(target);
        if !path.exists() {
            return Ok(TelegramSendResult {
                success: false,
                message_id: None,
                error: Some(format!("File does not exist: {}", target)),
            });
        }

        let bytes = tokio::fs::read(path).await?;
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();

        let part = reqwest::multipart::Part::bytes(bytes).file_name(filename);

        let mut form = reqwest::multipart::Form::new()
            .text("chat_id", options.chat_id.clone())
            .part(file_field.to_string(), part);

        if let Some(ref cap) = options.caption {
            form = form.text("caption", cap.clone());
        }

        if method == "sendAudio" {
            if let Some(ref title) = options.title {
                form = form.text("title", title.clone());
            }
        }

        let resp = self.client.post(&endpoint).multipart(form).send().await?;
        Self::parse_response(resp).await
    }

    async fn parse_response(resp: reqwest::Response) -> Result<TelegramSendResult> {
        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await?;
            let msg_id = json["result"]["message_id"].as_i64();
            Ok(TelegramSendResult {
                success: true,
                message_id: msg_id,
                error: None,
            })
        } else {
            let err_text = resp
                .text()
                .await
                .unwrap_or_else(|_| "Unknown Telegram API error".to_string());
            Ok(TelegramSendResult {
                success: false,
                message_id: None,
                error: Some(err_text),
            })
        }
    }
}

impl Default for TelegramClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Splits a long message into chunks <= max_len characters, splitting at line breaks or spaces where possible.
pub fn split_telegram_message(text: &str, max_len: usize) -> Vec<String> {
    if text.len() <= max_len {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut remaining = text;

    while !remaining.is_empty() {
        if remaining.len() <= max_len {
            chunks.push(remaining.to_string());
            break;
        }

        // Search for a good split point within the first max_len characters
        let slice = &remaining[..max_len];
        let split_idx = slice
            .rfind("\n\n")
            .map(|i| i + 2)
            .or_else(|| slice.rfind('\n').map(|i| i + 1))
            .or_else(|| slice.rfind(". ").map(|i| i + 2))
            .or_else(|| slice.rfind(' ').map(|i| i + 1))
            .unwrap_or(max_len);

        let chunk = &remaining[..split_idx];
        chunks.push(chunk.to_string());
        remaining = &remaining[split_idx..];
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_telegram_bot_command_serialization() {
        let commands = vec![
            TelegramBotCommand {
                command: "new".to_string(),
                description: "Start fresh conversation".to_string(),
            },
            TelegramBotCommand {
                command: "help".to_string(),
                description: "Show help".to_string(),
            },
        ];
        let val = serde_json::to_value(&commands).unwrap();
        assert_eq!(val[0]["command"], "new");
        assert_eq!(val[1]["description"], "Show help");
    }

    #[test]
    fn test_split_telegram_message_short() {
        let text = "Hello world";
        let chunks = split_telegram_message(text, 50);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "Hello world");
    }

    #[test]
    fn test_split_telegram_message_long_paragraphs() {
        let text = "Paragraph 1\n\nParagraph 2 is slightly longer and contains more details.\n\nParagraph 3.";
        let chunks = split_telegram_message(text, 30);
        assert!(chunks.len() >= 3);
        let rejoined = chunks.join("");
        assert_eq!(rejoined, text);
    }

    #[test]
    fn test_split_telegram_message_hard_boundary() {
        let text = "abcdefghijklmnopqrstuvwxyz";
        let chunks = split_telegram_message(text, 10);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0], "abcdefghij");
        assert_eq!(chunks[1], "klmnopqrst");
        assert_eq!(chunks[2], "uvwxyz");
    }

    #[test]
    fn test_deserialize_telegram_update_with_text() {
        let json_str = r#"{
            "update_id": 10001,
            "message": {
                "message_id": 42,
                "date": 1700000000,
                "chat": {
                    "id": 123456,
                    "type": "private",
                    "first_name": "Test",
                    "username": "tester"
                },
                "from": {
                    "id": 123456,
                    "is_bot": false,
                    "first_name": "Test"
                },
                "text": "Hello Agent"
            }
        }"#;

        let update: TelegramUpdate =
            serde_json::from_str(json_str).expect("deserialize TelegramUpdate");
        assert_eq!(update.update_id, 10001);
        let msg = update.message.expect("message present");
        assert_eq!(msg.message_id, 42);
        assert_eq!(msg.text.as_deref(), Some("Hello Agent"));
        assert_eq!(msg.chat.id, 123456);
    }

    #[test]
    fn test_deserialize_telegram_update_with_voice_and_photo() {
        let json_str = r#"{
            "update_id": 10002,
            "message": {
                "message_id": 43,
                "date": 1700000010,
                "chat": {
                    "id": 123456,
                    "type": "private"
                },
                "voice": {
                    "file_id": "v123",
                    "file_unique_id": "vu123",
                    "duration": 5,
                    "mime_type": "audio/ogg"
                },
                "photo": [
                    {
                        "file_id": "p_thumb",
                        "file_unique_id": "pu_thumb",
                        "width": 100,
                        "height": 100
                    },
                    {
                        "file_id": "p_high",
                        "file_unique_id": "pu_high",
                        "width": 1024,
                        "height": 1024,
                        "file_size": 204800
                    }
                ]
            }
        }"#;

        let update: TelegramUpdate =
            serde_json::from_str(json_str).expect("deserialize TelegramUpdate with media");
        let msg = update.message.expect("message present");
        let voice = msg.voice.expect("voice present");
        assert_eq!(voice.file_id, "v123");
        assert_eq!(voice.duration, 5);

        let photos = msg.photo.expect("photos present");
        assert_eq!(photos.len(), 2);
        assert_eq!(photos.last().unwrap().file_id, "p_high");
        assert_eq!(photos.last().unwrap().width, 1024);
    }
}
