use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

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

pub struct TelegramClient {
    client: reqwest::Client,
}

impl TelegramClient {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
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

    /// Sends media (audio, video, document) to a Telegram chat or channel.
    pub async fn send_media(&self, options: &TelegramSendMediaOptions) -> Result<TelegramSendResult> {
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
            .unwrap_or_else(|| {
                match ext.as_str() {
                    "mp3" | "m4a" | "wav" | "ogg" | "flac" | "aac" | "opus" => "audio".to_string(),
                    "mp4" | "webm" | "mkv" | "mov" | "avi" => "video".to_string(),
                    _ => "document".to_string(),
                }
            });

        let (method, file_field) = match media_type.as_str() {
            "audio" => ("sendAudio", "audio"),
            "video" => ("sendVideo", "video"),
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
