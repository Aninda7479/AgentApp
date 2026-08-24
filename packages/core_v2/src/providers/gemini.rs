use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::json;
use tokio::sync::mpsc::{channel, Receiver};

use crate::providers::LlmProvider;
use crate::types::{AgentEvent, ChatMessage, ContentBlock, ModelConfig, Role};

pub struct GeminiProvider {
    client: Client,
}

impl GeminiProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }
}

impl Default for GeminiProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LlmProvider for GeminiProvider {
    async fn chat_stream(
        &self,
        config: &ModelConfig,
        messages: &[ChatMessage],
        tools: &[serde_json::Value],
    ) -> anyhow::Result<Receiver<AgentEvent>> {
        let base_url = config.get_base_url();
        let base_trimmed = base_url.trim_end_matches('/');
        let effective_base = if !base_trimmed.contains("/v1") {
            format!("{}/v1beta", base_trimmed)
        } else {
            base_trimmed.to_string()
        };
        let api_key = config.api_key.clone().unwrap_or_default();
        let clean_model_id = config.model_id.strip_prefix("models/").unwrap_or(&config.model_id);
        let clean_model_id = clean_model_id.strip_prefix("google-").unwrap_or(clean_model_id);
        let url = format!(
            "{}/models/{}:streamGenerateContent?alt=sse&key={}",
            effective_base,
            clean_model_id,
            api_key
        );

        let mut system_instruction_parts = Vec::new();
        let mut contents = Vec::new();

        for msg in messages {
            match msg.role {
                Role::System => {
                    system_instruction_parts.push(json!({ "text": msg.text_content() }));
                }
                Role::User => {
                    let mut parts = Vec::new();
                    for block in &msg.content {
                        match block {
                            ContentBlock::Text { text } => {
                                parts.push(json!({ "text": text }));
                            }
                            ContentBlock::ToolResult { tool_use_id, content, .. } => {
                                parts.push(json!({
                                    "functionResponse": {
                                        "name": tool_use_id,
                                        "response": { "output": content }
                                    }
                                }));
                            }
                            _ => {}
                        }
                    }
                    contents.push(json!({
                        "role": "user",
                        "parts": parts
                    }));
                }
                Role::Assistant => {
                    let mut parts = Vec::new();
                    for block in &msg.content {
                        match block {
                            ContentBlock::Text { text } => {
                                parts.push(json!({ "text": text }));
                            }
                            ContentBlock::ToolUse { name, input, .. } => {
                                parts.push(json!({
                                    "text": format!("[Called tool: {} with arguments: {}]", name, input)
                                }));
                            }
                            _ => {}
                        }
                    }
                    contents.push(json!({
                        "role": "model",
                        "parts": parts
                    }));
                }
                Role::Tool => {
                    let mut parts = Vec::new();
                    for block in &msg.content {
                        if let ContentBlock::ToolResult { tool_use_id, content, .. } = block {
                            parts.push(json!({
                                "text": format!("[Tool result for {}]: {}", tool_use_id, content)
                            }));
                        }
                    }
                    if !parts.is_empty() {
                        contents.push(json!({
                            "role": "user",
                            "parts": parts
                        }));
                    }
                }
            }
        }

        let mut payload = json!({
            "contents": contents
        });

        if !system_instruction_parts.is_empty() {
            payload["systemInstruction"] = json!({
                "parts": system_instruction_parts
            });
        }

        let mut gen_config = serde_json::Map::new();
        if let Some(temp) = config.temperature {
            gen_config.insert("temperature".into(), json!(temp));
        }
        if let Some(max_t) = config.max_tokens {
            gen_config.insert("maxOutputTokens".into(), json!(max_t));
        }
        if !gen_config.is_empty() {
            payload["generationConfig"] = serde_json::Value::Object(gen_config);
        }

        if !tools.is_empty() {
            payload["tools"] = json!([{
                "functionDeclarations": tools
            }]);
        }

        let res = self
            .client
            .post(&url)
            .header("content-type", "application/json")
            .json(&payload)
            .send()
            .await?;

        if !res.status().is_success() {
            let err_text = res.text().await.unwrap_or_default();
            anyhow::bail!("Gemini API error ({url}): {}", err_text);
        }

        let (tx, rx) = channel(100);
        let mut stream = res.bytes_stream();

        tokio::spawn(async move {
            let mut buffer = String::new();
            let mut stop_reason = String::from("STOP");

            while let Some(item) = stream.next().await {
                let bytes = match item {
                    Ok(b) => b,
                    Err(e) => {
                        let _ = tx.send(AgentEvent::Error { message: e.to_string() }).await;
                        return;
                    }
                };

                buffer.push_str(&String::from_utf8_lossy(&bytes));

                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim_end_matches('\r').trim().to_string();
                    buffer.drain(..=pos);

                    if line.is_empty() || line.starts_with(':') {
                        continue;
                    }

                    if let Some(data_str) = line.strip_prefix("data: ") {
                        let data_str = data_str.trim();
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(data_str) {
                            if let Some(candidate) = v.get("candidates").and_then(|c| c.get(0)) {
                                if let Some(reason) = candidate.get("finishReason").and_then(|r| r.as_str()) {
                                    if !reason.is_empty() {
                                        stop_reason = reason.to_string();
                                    }
                                }

                                if let Some(parts) = candidate.get("content").and_then(|c| c.get("parts")).and_then(|p| p.as_array()) {
                                    for part in parts {
                                        if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                            if !text.is_empty() {
                                                if tx.send(AgentEvent::Token { text: text.to_string() }).await.is_err() {
                                                    return;
                                                }
                                            }
                                        }

                                        if let Some(func) = part.get("functionCall") {
                                            let name = func.get("name").and_then(|n| n.as_str()).unwrap_or_default().to_string();
                                            let args = func.get("args").cloned().unwrap_or(json!({}));
                                            let id = format!("call_{}", uuid::Uuid::new_v4());
                                            if tx.send(AgentEvent::ToolCall { id, name, input: args }).await.is_err() {
                                                return;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let _ = tx.send(AgentEvent::Finished { stop_reason }).await;
        });

        Ok(rx)
    }
}
