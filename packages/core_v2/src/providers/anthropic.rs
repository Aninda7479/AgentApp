use std::collections::HashMap;
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::json;
use tokio::sync::mpsc::{channel, Receiver};

use crate::providers::LlmProvider;
use crate::types::{AgentEvent, ChatMessage, ContentBlock, ModelConfig, Role};

pub struct AnthropicProvider {
    client: Client,
}

impl AnthropicProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }
}

impl Default for AnthropicProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    async fn chat_stream(
        &self,
        config: &ModelConfig,
        messages: &[ChatMessage],
        tools: &[serde_json::Value],
    ) -> anyhow::Result<Receiver<AgentEvent>> {
        let base_url = config.get_base_url();
        let url = format!("{}/messages", base_url.trim_end_matches('/'));

        let mut system_prompts = Vec::new();
        let mut formatted_messages = Vec::new();

        for msg in messages {
            match msg.role {
                Role::System => {
                    system_prompts.push(msg.text_content());
                }
                Role::User => {
                    let mut content_blocks = Vec::new();
                    for block in &msg.content {
                        match block {
                            ContentBlock::Text { text } => {
                                content_blocks.push(json!({
                                    "type": "text",
                                    "text": text
                                }));
                            }
                            ContentBlock::ToolResult { tool_use_id, content, is_error } => {
                                content_blocks.push(json!({
                                    "type": "tool_result",
                                    "tool_use_id": tool_use_id,
                                    "content": content,
                                    "is_error": is_error
                                }));
                            }
                            _ => {}
                        }
                    }
                    formatted_messages.push(json!({
                        "role": "user",
                        "content": content_blocks
                    }));
                }
                Role::Assistant => {
                    let mut content_blocks = Vec::new();
                    for block in &msg.content {
                        match block {
                            ContentBlock::Text { text } => {
                                content_blocks.push(json!({
                                    "type": "text",
                                    "text": text
                                }));
                            }
                            ContentBlock::ToolUse { id, name, input } => {
                                content_blocks.push(json!({
                                    "type": "tool_use",
                                    "id": id,
                                    "name": name,
                                    "input": input
                                }));
                            }
                            _ => {}
                        }
                    }
                    formatted_messages.push(json!({
                        "role": "assistant",
                        "content": content_blocks
                    }));
                }
                Role::Tool => {
                    let mut content_blocks = Vec::new();
                    for block in &msg.content {
                        if let ContentBlock::ToolResult { tool_use_id, content, is_error } = block {
                            content_blocks.push(json!({
                                "type": "tool_result",
                                "tool_use_id": tool_use_id,
                                "content": content,
                                "is_error": is_error
                            }));
                        }
                    }
                    if !content_blocks.is_empty() {
                        formatted_messages.push(json!({
                            "role": "user",
                            "content": content_blocks
                        }));
                    }
                }
            }
        }

        let max_tokens = config.max_tokens.unwrap_or(4096);

        let mut payload = json!({
            "model": config.model_id,
            "messages": formatted_messages,
            "max_tokens": max_tokens,
            "stream": true
        });

        if !system_prompts.is_empty() {
            payload["system"] = json!(system_prompts.join("\n\n"));
        }
        if let Some(temp) = config.temperature {
            payload["temperature"] = json!(temp);
        }
        if !tools.is_empty() {
            payload["tools"] = json!(tools);
        }

        let mut req = self
            .client
            .post(&url)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&payload);

        if let Some(ref key) = config.api_key {
            if !key.is_empty() {
                req = req.header("x-api-key", key);
            }
        }

        let res = req.send().await?;

        if !res.status().is_success() {
            let err_text = res.text().await.unwrap_or_default();
            anyhow::bail!("Anthropic API error ({url}): {}", err_text);
        }

        let (tx, rx) = channel(100);
        let mut stream = res.bytes_stream();

        tokio::spawn(async move {
            let mut buffer = String::new();
            struct BlockState {
                id: String,
                name: String,
                json_buf: String,
            }
            let mut blocks_map: HashMap<usize, BlockState> = HashMap::new();
            let mut stop_reason = String::from("end_turn");

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
                            let event_type = v.get("type").and_then(|t| t.as_str()).unwrap_or_default();

                            match event_type {
                                "content_block_start" => {
                                    let idx = v.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                                    if let Some(block) = v.get("content_block") {
                                        let b_type = block.get("type").and_then(|t| t.as_str()).unwrap_or_default();
                                        if b_type == "tool_use" {
                                            let id = block.get("id").and_then(|s| s.as_str()).unwrap_or_default().to_string();
                                            let name = block.get("name").and_then(|s| s.as_str()).unwrap_or_default().to_string();
                                            blocks_map.insert(idx, BlockState { id, name, json_buf: String::new() });
                                        }
                                    }
                                }
                                "content_block_delta" => {
                                    let idx = v.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                                    if let Some(delta) = v.get("delta") {
                                        let d_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or_default();
                                        if d_type == "text_delta" {
                                            if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                                if !text.is_empty() {
                                                    if tx.send(AgentEvent::Token { text: text.to_string() }).await.is_err() {
                                                        return;
                                                    }
                                                }
                                            }
                                        } else if d_type == "input_json_delta" {
                                            if let Some(partial) = delta.get("partial_json").and_then(|p| p.as_str()) {
                                                if let Some(state) = blocks_map.get_mut(&idx) {
                                                    state.json_buf.push_str(partial);
                                                }
                                            }
                                        }
                                    }
                                }
                                "content_block_stop" => {
                                    let idx = v.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                                    if let Some(state) = blocks_map.remove(&idx) {
                                        let input: serde_json::Value = serde_json::from_str(&state.json_buf)
                                            .unwrap_or_else(|_| json!({ "raw": state.json_buf }));
                                        if tx.send(AgentEvent::ToolCall { id: state.id, name: state.name, input }).await.is_err() {
                                            return;
                                        }
                                    }
                                }
                                "message_delta" => {
                                    if let Some(delta) = v.get("delta") {
                                        if let Some(reason) = delta.get("stop_reason").and_then(|r| r.as_str()) {
                                            stop_reason = reason.to_string();
                                        }
                                    }
                                }
                                "message_stop" => {
                                    let _ = tx.send(AgentEvent::Finished { stop_reason: stop_reason.clone() }).await;
                                    return;
                                }
                                "error" => {
                                    let msg = v.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).unwrap_or("Unknown Anthropic error");
                                    let _ = tx.send(AgentEvent::Error { message: msg.to_string() }).await;
                                    return;
                                }
                                _ => {}
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
