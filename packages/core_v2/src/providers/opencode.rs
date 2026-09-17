use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::json;
use std::collections::HashMap;
use tokio::sync::mpsc::{channel, Receiver};

use crate::providers::LlmProvider;
use crate::types::{AgentEvent, ChatMessage, ContentBlock, ModelConfig, Role};

/// OpenCode Zen default base URL
pub const DEFAULT_OPENCODE_BASE_URL: &str = "https://opencode.ai/zen/v1";

/// Curated high-performance free models hosted on OpenCode Zen
pub const OPENCODE_FREE_MODELS: &[&str] = &[
    "big-pickle",
    "deepseek-v4-flash-free",
    "mimo-v2.5-free",
    "muse-spark-1.3-contributor-free",
    "muse-spark-1.2-contributor-free",
    "nemotron-3-ultra-free",
    "nemotron-3.5-lightning-free",
    "ling-3.0-flash-fin-free",
    "union-alpha",
];

/// Standalone OpenCode provider implementing `LlmProvider`.
/// All OpenCode Zen specific headers, session affinity, and streaming logic
/// are self-contained in this single file for zero-friction future removal.
pub struct OpenCodeProvider {
    client: Client,
}

impl Default for OpenCodeProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl OpenCodeProvider {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .connect_timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { client }
    }

    fn format_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
        let mut formatted = Vec::new();
        for msg in messages {
            match msg.role {
                Role::System => {
                    formatted.push(json!({
                        "role": "system",
                        "content": msg.text_content()
                    }));
                }
                Role::User => {
                    let mut parts = Vec::new();
                    for block in &msg.content {
                        match block {
                            ContentBlock::Text { text } => {
                                parts.push(json!({
                                    "type": "text",
                                    "text": text
                                }));
                            }
                            ContentBlock::Image { media_type, data } => {
                                let url = if data.starts_with("data:") {
                                    data.clone()
                                } else {
                                    format!("data:{};base64,{}", media_type, data)
                                };
                                parts.push(json!({
                                    "type": "image_url",
                                    "image_url": {
                                        "url": url
                                    }
                                }));
                            }
                            _ => {}
                        }
                    }
                    if parts.len() == 1
                        && parts[0].get("type").and_then(|v| v.as_str()) == Some("text")
                    {
                        formatted.push(json!({
                            "role": "user",
                            "content": parts[0]["text"]
                        }));
                    } else if !parts.is_empty() {
                        formatted.push(json!({
                            "role": "user",
                            "content": parts
                        }));
                    } else {
                        formatted.push(json!({
                            "role": "user",
                            "content": msg.text_content()
                        }));
                    }
                }
                Role::Assistant => {
                    let mut tool_calls = Vec::new();
                    let mut text_parts = Vec::new();
                    for block in &msg.content {
                        match block {
                            ContentBlock::Text { text } => text_parts.push(text.clone()),
                            ContentBlock::ToolUse { id, name, input } => {
                                tool_calls.push(json!({
                                    "id": id,
                                    "type": "function",
                                    "function": {
                                        "name": name,
                                        "arguments": input.to_string()
                                    }
                                }));
                            }
                            _ => {}
                        }
                    }
                    let mut assistant_obj = serde_json::Map::new();
                    assistant_obj.insert("role".to_string(), json!("assistant"));
                    if !text_parts.is_empty() {
                        assistant_obj.insert("content".to_string(), json!(text_parts.join("")));
                    } else if tool_calls.is_empty() {
                        assistant_obj.insert("content".to_string(), json!(""));
                    }
                    if !tool_calls.is_empty() {
                        assistant_obj.insert("tool_calls".to_string(), json!(tool_calls));
                    }
                    formatted.push(serde_json::Value::Object(assistant_obj));
                }
                Role::Tool => {
                    for block in &msg.content {
                        if let ContentBlock::ToolResult {
                            tool_use_id,
                            content,
                            is_error: _,
                        } = block
                        {
                            formatted.push(json!({
                                "role": "tool",
                                "tool_call_id": tool_use_id,
                                "content": content
                            }));
                        }
                    }
                }
            }
        }
        formatted
    }
}

#[async_trait]
impl LlmProvider for OpenCodeProvider {
    async fn chat_stream(
        &self,
        config: &ModelConfig,
        messages: &[ChatMessage],
        tools: &[serde_json::Value],
    ) -> anyhow::Result<Receiver<AgentEvent>> {
        let base_url = config.get_base_url();
        let trimmed_base = base_url.trim_end_matches('/');
        let url = if trimmed_base.ends_with("/chat/completions") {
            trimmed_base.to_string()
        } else {
            format!("{}/chat/completions", trimmed_base)
        };

        let mut payload = json!({
            "model": config.model_id,
            "messages": Self::format_messages(messages),
            "stream": true,
        });

        if let Some(temp) = config.temperature {
            payload["temperature"] = json!(temp);
        }
        if let Some(tokens) = config.max_tokens {
            payload["max_tokens"] = json!(tokens);
        }

        if !tools.is_empty() {
            let formatted_tools: Vec<serde_json::Value> = tools
                .iter()
                .map(|t| {
                    if t.get("type").is_none() {
                        json!({
                            "type": "function",
                            "function": {
                                "name": t.get("name").and_then(|v| v.as_str()).unwrap_or_default(),
                                "description": t.get("description").and_then(|v| v.as_str()).unwrap_or_default(),
                                "parameters": t.get("parameters").cloned().unwrap_or(json!({
                                    "type": "object",
                                    "properties": {}
                                }))
                            }
                        })
                    } else {
                        t.clone()
                    }
                })
                .collect();
            payload["tools"] = json!(formatted_tools);
        }

        // OpenCode Zen requires a session ID header to authorize free-tier access
        let session_id = format!("sess_{}", uuid::Uuid::new_v4().simple());

        let mut last_send_err = String::new();
        let mut res_opt = None;

        for attempt in 1..=3 {
            let mut req = self
                .client
                .post(&url)
                .header("x-session-id", &session_id)
                .header("User-Agent", "opencode/1.0.0")
                .json(&payload);

            if let Some(ref key) = config.api_key {
                if !key.trim().is_empty() {
                    req = req.bearer_auth(key.trim());
                }
            }

            match req.send().await {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() {
                        res_opt = Some(response);
                        break;
                    } else if (status.as_u16() == 429 || status.is_server_error()) && attempt < 3 {
                        tracing::warn!(
                            "OpenCode Zen returned status {} (attempt {}/3). Retrying in 2s...",
                            status,
                            attempt
                        );
                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                        continue;
                    } else {
                        let err_text = response.text().await.unwrap_or_default();
                        anyhow::bail!("OpenCode Zen API error ({}): {}", url, err_text);
                    }
                }
                Err(err) => {
                    last_send_err = err.to_string();
                    if attempt < 3 {
                        tracing::warn!(
                            "OpenCode Zen request error (attempt {}/3): {}. Retrying in 2s...",
                            attempt,
                            last_send_err
                        );
                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    }
                }
            }
        }

        let res = match res_opt {
            Some(r) => r,
            None => anyhow::bail!(
                "OpenCode request failed after 3 attempts: {}",
                last_send_err
            ),
        };

        let (tx, rx) = channel(100);
        let mut stream = res.bytes_stream();

        tokio::spawn(async move {
            let mut buffer = String::new();
            let mut tool_calls_map: HashMap<usize, (String, String, String)> = HashMap::new();
            let mut stop_reason = String::from("stop");
            let mut in_thinking = false;

            while let Some(item) = stream.next().await {
                let bytes = match item {
                    Ok(b) => b,
                    Err(e) => {
                        let _ = tx
                            .send(AgentEvent::Error {
                                message: e.to_string(),
                            })
                            .await;
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
                        if data_str == "[DONE]" {
                            break;
                        }

                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(data_str) {
                            if let Some(choice) = v.get("choices").and_then(|c| c.get(0)) {
                                if let Some(reason) =
                                    choice.get("finish_reason").and_then(|r| r.as_str())
                                {
                                    if !reason.is_empty() {
                                        stop_reason = reason.to_string();
                                    }
                                }

                                if let Some(delta) = choice.get("delta") {
                                    // Handle reasoning content (e.g. Big Pickle / DeepSeek reasoning tokens)
                                    if let Some(reasoning) =
                                        delta.get("reasoning_content").and_then(|r| r.as_str())
                                    {
                                        if !reasoning.is_empty() {
                                            if !in_thinking {
                                                in_thinking = true;
                                                let _ = tx
                                                    .send(AgentEvent::Token {
                                                        text: "<think>\n".to_string(),
                                                    })
                                                    .await;
                                            }
                                            if tx
                                                .send(AgentEvent::Token {
                                                    text: reasoning.to_string(),
                                                })
                                                .await
                                                .is_err()
                                            {
                                                return;
                                            }
                                        }
                                    }

                                    // Handle standard text content
                                    if let Some(content) =
                                        delta.get("content").and_then(|c| c.as_str())
                                    {
                                        if !content.is_empty() {
                                            if in_thinking {
                                                in_thinking = false;
                                                let _ = tx
                                                    .send(AgentEvent::Token {
                                                        text: "\n</think>\n\n".to_string(),
                                                    })
                                                    .await;
                                            }
                                            if tx
                                                .send(AgentEvent::Token {
                                                    text: content.to_string(),
                                                })
                                                .await
                                                .is_err()
                                            {
                                                return;
                                            }
                                        }
                                    }

                                    // Handle streaming tool calls
                                    if let Some(tcs) =
                                        delta.get("tool_calls").and_then(|t| t.as_array())
                                    {
                                        for tc in tcs {
                                            let idx = tc
                                                .get("index")
                                                .and_then(|i| i.as_u64())
                                                .unwrap_or(0)
                                                as usize;
                                            let entry =
                                                tool_calls_map.entry(idx).or_insert_with(|| {
                                                    (String::new(), String::new(), String::new())
                                                });

                                            if let Some(id) = tc.get("id").and_then(|i| i.as_str())
                                            {
                                                entry.0 = id.to_string();
                                            }
                                            if let Some(func) = tc.get("function") {
                                                if let Some(name) =
                                                    func.get("name").and_then(|n| n.as_str())
                                                {
                                                    entry.1.push_str(name);
                                                }
                                                if let Some(args) =
                                                    func.get("arguments").and_then(|a| a.as_str())
                                                {
                                                    entry.2.push_str(args);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if in_thinking {
                let _ = tx
                    .send(AgentEvent::Token {
                        text: "\n</think>\n\n".to_string(),
                    })
                    .await;
            }

            let mut indices: Vec<_> = tool_calls_map.keys().cloned().collect();
            indices.sort_unstable();
            for idx in indices {
                if let Some((id, name, args_str)) = tool_calls_map.remove(&idx) {
                    let final_id = if id.trim().is_empty() {
                        format!("call_{}", uuid::Uuid::new_v4().simple())
                    } else {
                        id
                    };
                    let input: serde_json::Value = serde_json::from_str(&args_str)
                        .unwrap_or_else(|_| json!({ "raw": args_str }));
                    let _ = tx
                        .send(AgentEvent::ToolCall {
                            id: final_id,
                            name,
                            input,
                        })
                        .await;
                }
            }

            let _ = tx.send(AgentEvent::Finished { stop_reason }).await;
        });

        Ok(rx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opencode_provider_creation() {
        let provider = OpenCodeProvider::new();
        assert!(provider
            .client
            .get("https://opencode.ai/zen/v1")
            .build()
            .is_ok());
    }

    #[test]
    fn test_opencode_free_models_list() {
        assert!(OPENCODE_FREE_MODELS.contains(&"big-pickle"));
        assert!(OPENCODE_FREE_MODELS.contains(&"deepseek-v4-flash-free"));
    }
}
