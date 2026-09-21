use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::integrations::telegram::{
    TelegramClient, TelegramSendMediaOptions, TelegramSendOptions,
};
use crate::storage::SettingsStore;
use crate::tools::r#trait::Tool;

/// Tool for sending messages, audio, video, and documents to Telegram.
pub struct TelegramTool {
    settings_store: Arc<SettingsStore>,
    workspace_root: Option<PathBuf>,
    default_chat_id: Option<String>,
}

impl TelegramTool {
    pub fn new(settings_store: Arc<SettingsStore>) -> Self {
        Self {
            settings_store,
            workspace_root: None,
            default_chat_id: None,
        }
    }

    pub fn with_workspace(settings_store: Arc<SettingsStore>, workspace_root: PathBuf) -> Self {
        Self {
            settings_store,
            workspace_root: Some(workspace_root),
            default_chat_id: None,
        }
    }

    pub fn with_chat_id(
        settings_store: Arc<SettingsStore>,
        workspace_root: PathBuf,
        chat_id: impl Into<String>,
    ) -> Self {
        Self {
            settings_store,
            workspace_root: Some(workspace_root),
            default_chat_id: Some(chat_id.into()),
        }
    }

    fn resolve_credentials(&self, input: &Value) -> Result<(String, String)> {
        let raw = self.settings_store.load_raw().unwrap_or_default();
        let tg_obj = raw
            .get("telegram")
            .or_else(|| raw.get("integrations").and_then(|i| i.get("telegram")));

        let bot_token = input
            .get("bot_token")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                tg_obj
                    .and_then(|t| t.get("botToken").or_else(|| t.get("bot_token")))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .or_else(|| std::env::var("TELEGRAM_BOT_TOKEN").ok())
            .unwrap_or_default();

        let chat_id = input
            .get("chat_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| self.default_chat_id.clone())
            .or_else(|| {
                tg_obj
                    .and_then(|t| t.get("chatId").or_else(|| t.get("chat_id")))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .or_else(|| std::env::var("TELEGRAM_CHAT_ID").ok())
            .unwrap_or_default();

        if bot_token.trim().is_empty() {
            return Err(anyhow!("Telegram bot token is not configured in settings."));
        }
        if chat_id.trim().is_empty() {
            return Err(anyhow!("Telegram chat ID is not configured in settings."));
        }

        Ok((bot_token.trim().to_string(), chat_id.trim().to_string()))
    }
}

#[async_trait]
impl Tool for TelegramTool {
    fn name(&self) -> &str {
        "telegram"
    }

    fn description(&self) -> &str {
        "Sends audio files, video files, documents, or text messages to the user's Telegram. Media types and Telegram credentials are automatically resolved."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to local file to send (audio, video, document, or image). Optional if text is provided."
                },
                "text": {
                    "type": "string",
                    "description": "Text message or caption to send. Optional if file_path is provided."
                },
                "title": {
                    "type": "string",
                    "description": "Title for audio track (e.g. 'devils laugh'). Optional."
                },
                "media_type": {
                    "type": "string",
                    "enum": ["audio", "video", "document", "auto"],
                    "description": "Type of media. If 'auto' or omitted, detected automatically from file extension."
                }
            }
        })
    }

    async fn execute(&self, arguments: Value) -> Result<String> {
        let (bot_token, chat_id) = self.resolve_credentials(&arguments)?;

        let file_path = arguments
            .get("file_path")
            .or_else(|| arguments.get("filePath"))
            .or_else(|| arguments.get("file"))
            .and_then(|v| v.as_str());

        let text = arguments
            .get("text")
            .or_else(|| arguments.get("message"))
            .or_else(|| arguments.get("caption"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let title = arguments
            .get("title")
            .or_else(|| arguments.get("name"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let media_type = arguments
            .get("media_type")
            .or_else(|| arguments.get("mediaType"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let client = TelegramClient::new();

        if let Some(raw_path) = file_path {
            let path_str = raw_path.trim();
            let resolved_path = if (path_str.starts_with("http://")
                || path_str.starts_with("https://"))
                || Path::new(path_str).is_absolute()
            {
                path_str.to_string()
            } else if let Some(ref root) = self.workspace_root {
                root.join(path_str).to_string_lossy().to_string()
            } else {
                path_str.to_string()
            };

            let send_opts = TelegramSendMediaOptions {
                bot_token,
                chat_id,
                file_path_or_url: resolved_path,
                media_type,
                title,
                caption: text,
            };

            let res = client.send_media(&send_opts).await?;
            if res.success {
                let msg_id = res
                    .message_id
                    .map(|id| id.to_string())
                    .unwrap_or_else(|| "unknown".to_string());
                Ok(format!(
                    "Delivered media to Telegram successfully (message_id: {})",
                    msg_id
                ))
            } else {
                Err(anyhow!(res.error.unwrap_or_else(|| {
                    "Failed to send media to Telegram".to_string()
                })))
            }
        } else if let Some(msg_text) = text {
            let send_opts = TelegramSendOptions {
                bot_token,
                chat_id,
                text: msg_text,
                parse_mode: None,
                disable_notification: None,
            };

            let res = client.send_message(&send_opts).await?;
            if res.success {
                let msg_id = res
                    .message_id
                    .map(|id| id.to_string())
                    .unwrap_or_else(|| "unknown".to_string());
                Ok(format!(
                    "Delivered message to Telegram successfully (message_id: {})",
                    msg_id
                ))
            } else {
                Err(anyhow!(res.error.unwrap_or_else(|| {
                    "Failed to send message to Telegram".to_string()
                })))
            }
        } else {
            Err(anyhow!(
                "Either file_path or text must be provided to telegram tool"
            ))
        }
    }
}
