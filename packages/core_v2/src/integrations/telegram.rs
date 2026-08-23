use anyhow::Result;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramSendOptions {
    pub bot_token: String,
    pub chat_id: String,
    pub text: String,
    pub parse_mode: Option<String>,
    pub disable_notification: Option<bool>,
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
        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await?;
            let msg_id = json["result"]["message_id"].as_i64();
            Ok(TelegramSendResult {
                success: true,
                message_id: msg_id,
                error: None,
            })
        } else {
            let err_text = resp.text().await.unwrap_or_else(|_| "Unknown Telegram API error".to_string());
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
