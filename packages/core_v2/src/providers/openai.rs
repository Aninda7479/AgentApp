use std::collections::HashMap;
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::json;
use tokio::sync::mpsc::{channel, Receiver};

use crate::providers::LlmProvider;
use crate::types::{AgentEvent, ChatMessage, ContentBlock, ModelConfig, Role};

pub struct OpenAiProvider {
    client: Client,
}

impl OpenAiProvider {
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
                    if parts.len() == 1 && parts[0].get("type").and_then(|v| v.as_str()) == Some("text") {
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
                    let mut obj = serde_json::Map::new();
                    obj.insert("role".into(), json!("assistant"));
                    if !text_parts.is_empty() {
                        obj.insert("content".into(), json!(text_parts.join("\n")));
                    } else {
                        obj.insert("content".into(), serde_json::Value::Null);
                    }
                    if !tool_calls.is_empty() {
                        obj.insert("tool_calls".into(), json!(tool_calls));
                    }
                    formatted.push(serde_json::Value::Object(obj));
                }
                Role::Tool => {
                    for block in &msg.content {
                        if let ContentBlock::ToolResult { tool_use_id, content, .. } = block {
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

impl Default for OpenAiProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    async fn chat_stream(
        &self,
        config: &ModelConfig,
        messages: &[ChatMessage],
        tools: &[serde_json::Value],
    ) -> anyhow::Result<Receiver<AgentEvent>> {
        let base_url = config.get_base_url();
        let base_trimmed = base_url.trim_end_matches('/');
        let url = if base_trimmed.ends_with("/chat/completions") {
            base_trimmed.to_string()
        } else {
            format!("{}/chat/completions", base_trimmed)
        };

        let mut payload = json!({
            "model": config.model_id,
            "messages": Self::format_messages(messages),
            "stream": true
        });

        if let Some(temp) = config.temperature {
            payload["temperature"] = json!(temp);
        }
        if let Some(max_t) = config.max_tokens {
            payload["max_tokens"] = json!(max_t);
        }
        if !tools.is_empty() {
            let formatted_tools: Vec<serde_json::Value> = tools
                .iter()
                .map(|t| {
                    if t.get("type").is_some() && t.get("function").is_some() {
                        t.clone()
                    } else if t.get("name").is_some() {
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

        let mut last_send_err = String::new();
        let mut res_opt = None;

        for attempt in 1..=3 {
            let mut req = self.client.post(&url).json(&payload);
            if let Some(ref key) = config.api_key {
                if !key.is_empty() {
                    req = req.bearer_auth(key);
                }
            }

            match req.send().await {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() {
                        res_opt = Some(response);
                        break;
                    } else if (status.as_u16() == 429 || status.is_server_error()) && attempt < 3 {
                        tracing::warn!("OpenAI request returned status {} (attempt {}/3). Retrying in 3s...", status, attempt);
                        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                        continue;
                    } else {
                        let err_text = response.text().await.unwrap_or_default();
                        if !tools.is_empty() && (err_text.contains("does not support tools") || err_text.contains("tools are not supported") || err_text.contains("tool_calls")) {
                            let mut fallback_payload = payload.clone();
                            sanitize_and_inject_prompt_tools(&mut fallback_payload, tools);
                            let mut retry_req = self.client.post(&url).json(&fallback_payload);
                            if let Some(ref key) = config.api_key {
                                if !key.is_empty() {
                                    retry_req = retry_req.bearer_auth(key);
                                }
                            }
                            if let Ok(retry_res) = retry_req.send().await {
                                if retry_res.status().is_success() {
                                    res_opt = Some(retry_res);
                                    break;
                                }
                            }
                        }
                        anyhow::bail!("OpenAI API error ({url}): {}", err_text);
                    }
                }
                Err(err) => {
                    last_send_err = err.to_string();
                    if attempt < 3 {
                        tracing::warn!("OpenAI request send error (attempt {}/3): {}. Retrying in 3s...", attempt, last_send_err);
                        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                    }
                }
            }
        }

        let res = match res_opt {
            Some(r) => r,
            None => anyhow::bail!("OpenAI request failed after 3 attempts: {}", last_send_err),
        };

        let (tx, rx) = channel(100);
        let mut stream = res.bytes_stream();

        tokio::spawn(async move {
            let mut buffer = String::new();
            let mut tool_calls_map: HashMap<usize, (String, String, String)> = HashMap::new();
            let mut stop_reason = String::from("stop");

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
                        if data_str == "[DONE]" {
                            break;
                        }

                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(data_str) {
                            if let Some(choice) = v.get("choices").and_then(|c| c.get(0)) {
                                if let Some(reason) = choice.get("finish_reason").and_then(|r| r.as_str()) {
                                    if !reason.is_empty() {
                                        stop_reason = reason.to_string();
                                    }
                                }

                                if let Some(delta) = choice.get("delta") {
                                    if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                        if !content.is_empty() {
                                            if tx.send(AgentEvent::Token { text: content.to_string() }).await.is_err() {
                                                return;
                                            }
                                        }
                                    }

                                    if let Some(tcs) = delta.get("tool_calls").and_then(|t| t.as_array()) {
                                        for tc in tcs {
                                            let idx = tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                                            let entry = tool_calls_map.entry(idx).or_insert_with(|| (String::new(), String::new(), String::new()));

                                            if let Some(id) = tc.get("id").and_then(|i| i.as_str()) {
                                                entry.0 = id.to_string();
                                            }
                                            if let Some(func) = tc.get("function") {
                                                if let Some(name) = func.get("name").and_then(|n| n.as_str()) {
                                                    entry.1.push_str(name);
                                                }
                                                if let Some(args) = func.get("arguments").and_then(|a| a.as_str()) {
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
                    let _ = tx.send(AgentEvent::ToolCall { id: final_id, name, input }).await;
                }
            }

            let _ = tx.send(AgentEvent::Finished { stop_reason }).await;
        });

        Ok(rx)
    }
}

/// Modifies the outgoing payload when an LLM provider (e.g. Ollama with Gemma 2)
/// does not support native OpenAI function calling / tools.
/// It converts tools into a prompt-based guide and removes tool-specific roles that cause errors.
fn sanitize_and_inject_prompt_tools(payload: &mut serde_json::Value, tools: &[serde_json::Value]) {
    if let Some(obj) = payload.as_object_mut() {
        obj.remove("tools");

        // Build tool instruction text
        let mut tools_guide = String::from("\n\n# TOOL INVOCATION INSTRUCTIONS\nWhen you need to perform an action (such as creating an artifact, game, web app, or querying tools), you MUST output ONLY a JSON code block in this format:\n```json\n{\n  \"name\": \"tool_name\",\n  \"parameters\": { ... }\n}\n```\nDo not include conversational text when calling a tool.\n\nAvailable tools in this session:\n");
        for t in tools {
            let name = t.get("name")
                .or_else(|| t.get("function").and_then(|f| f.get("name")))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let desc = t.get("description")
                .or_else(|| t.get("function").and_then(|f| f.get("description")))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            tools_guide.push_str(&format!("- **{}**: {}\n", name, desc));
        }

        if let Some(messages) = obj.get_mut("messages").and_then(|m| m.as_array_mut()) {
            // Clean up any role: "tool" or assistant tool_calls that non-tool models reject
            for msg in messages.iter_mut() {
                if let Some(msg_obj) = msg.as_object_mut() {
                    let role = msg_obj.get("role").and_then(|r| r.as_str()).unwrap_or("");
                    if role == "tool" {
                        msg_obj.insert("role".to_string(), serde_json::json!("user"));
                        let content = msg_obj.get("content").and_then(|c| c.as_str()).unwrap_or("");
                        let tool_id = msg_obj.get("tool_call_id").and_then(|id| id.as_str()).unwrap_or("");
                        msg_obj.insert("content".to_string(), serde_json::json!(format!("[Tool Result for {}]: {}", tool_id, content)));
                    } else if role == "assistant" {
                        if let Some(tool_calls) = msg_obj.remove("tool_calls") {
                            let text = msg_obj.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string();
                            let tc_str = tool_calls.to_string();
                            msg_obj.insert("content".to_string(), serde_json::json!(format!("{}\n[Invoked Tools]: {}", text, tc_str)));
                        }
                    }
                }
            }

            // Append tools_guide to the system message or prepend a new system message
            let mut found_system = false;
            for msg in messages.iter_mut() {
                if msg.get("role").and_then(|r| r.as_str()) == Some("system") {
                    if let Some(content) = msg.get_mut("content") {
                        if let Some(s) = content.as_str() {
                            *content = serde_json::json!(format!("{}{}", s, tools_guide));
                            found_system = true;
                            break;
                        }
                    }
                }
            }

            if !found_system {
                messages.insert(0, serde_json::json!({
                    "role": "system",
                    "content": tools_guide
                }));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ProviderType;

    #[test]
    fn test_format_messages_basic() {
        let msgs = vec![
            ChatMessage::system("You are a helpful assistant."),
            ChatMessage::user("Hello"),
        ];

        let formatted = OpenAiProvider::format_messages(&msgs);
        assert_eq!(formatted.len(), 2);
        assert_eq!(formatted[0]["role"], "system");
        assert_eq!(formatted[0]["content"], "You are a helpful assistant.");
        assert_eq!(formatted[1]["role"], "user");
        assert_eq!(formatted[1]["content"], "Hello");
    }

    #[tokio::test]
    async fn test_ollama_local_chat_stream_if_available() {
        let provider = OpenAiProvider::new();
        let mut config = ModelConfig::new(ProviderType::Ollama, "tinyllama:1.1b");
        config.base_url = Some("http://localhost:11434".to_string());

        let msgs = vec![ChatMessage::user("Say 'OK' and nothing else.")];

        let tools = vec![serde_json::json!({
            "name": "get_weather",
            "description": "Get current weather",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": { "type": "string" }
                }
            }
        })];

        if let Ok(mut rx) = provider.chat_stream(&config, &msgs, &tools).await {
            let mut received_tokens = String::new();
            while let Some(evt) = rx.recv().await {
                match evt {
                    AgentEvent::Token { text } => received_tokens.push_str(&text),
                    AgentEvent::Finished { .. } => break,
                    AgentEvent::Error { message } => {
                        println!("Ollama test notice: {}", message);
                        break;
                    }
                    _ => {}
                }
            }
            println!("Received from Ollama tinyllama:1.1b: {}", received_tokens);
            assert!(!received_tokens.is_empty());
        }
    }
}
