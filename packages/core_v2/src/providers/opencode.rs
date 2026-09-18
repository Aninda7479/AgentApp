use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::json;
use tokio::sync::mpsc::{channel, Receiver};

use rand::Rng;

use crate::providers::LlmProvider;
use crate::types::{AgentEvent, ChatMessage, ContentBlock, ModelConfig, Role};

/// OpenCode Zen default base URL
pub const DEFAULT_OPENCODE_BASE_URL: &str = "https://opencode.ai/zen/v1";

/// Verified live-working free models hosted on OpenCode Zen
pub const OPENCODE_FREE_MODELS: &[&str] = &[
    "big-pickle",
    "mimo-v2.5-free",
    "nemotron-3-ultra-free",
    "nemotron-3.5-lightning-free",
    "ling-3.0-flash-fin-free",
];

const BASE62_CHARS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/// Generate a canonical OpenCode session ID: `ses_` + 12 lowercase hex + 14 Base62 chars (total 30 chars)
pub fn generate_opencode_session_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let hex_part = format!("{:012x}", timestamp_ms & 0xffff_ffff_ffff);
    let mut rng = rand::thread_rng();
    let mut base62_part = String::with_capacity(14);
    for _ in 0..14 {
        let idx = rng.gen_range(0..62);
        base62_part.push(BASE62_CHARS[idx] as char);
    }
    format!("ses_{}{}", hex_part, base62_part)
}

/// Generate a canonical OpenCode request ID: `msg_` + 12 lowercase hex + 14 Base62 chars (total 30 chars)
pub fn generate_opencode_request_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let hex_part = format!("{:012x}", timestamp_ms & 0xffff_ffff_ffff);
    let mut rng = rand::thread_rng();
    let mut base62_part = String::with_capacity(14);
    for _ in 0..14 {
        let idx = rng.gen_range(0..62);
        base62_part.push(BASE62_CHARS[idx] as char);
    }
    format!("msg_{}{}", hex_part, base62_part)
}

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

    /// Ensures that the local `opencode serve` daemon is running and reachable.
    /// If not responding, automatically spawns it on port 4096.
    pub async fn ensure_opencode_server(client: &Client) -> anyhow::Result<String> {
        let port = std::env::var("OPENCODE_PORT").unwrap_or_else(|_| "4096".to_string());
        let base_url = format!("http://127.0.0.1:{}", port);
        let check_url = format!("{}/session", base_url);

        // Quick check if already responding
        if let Ok(res) = client
            .get(&check_url)
            .timeout(std::time::Duration::from_millis(800))
            .send()
            .await
        {
            if res.status().is_success() {
                return Ok(base_url);
            }
        }

        // Spawn opencode serve
        tracing::info!(
            "OpenCode server not responding on port {}. Spawning opencode serve...",
            port
        );
        let exe_name = if cfg!(target_os = "windows") {
            "opencode.exe"
        } else {
            "opencode"
        };

        let mut spawn_cmd = None;
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let candidate1 = std::path::PathBuf::from(&userprofile)
                .join(".superagent")
                .join(exe_name);
            let candidate2 = std::path::PathBuf::from(&userprofile)
                .join("AppData\\Local\\Microsoft\\WindowsApps")
                .join(exe_name);
            if candidate1.exists() {
                spawn_cmd = Some(candidate1);
            } else if candidate2.exists() {
                spawn_cmd = Some(candidate2);
            }
        }

        let mut child = if let Some(path) = spawn_cmd {
            std::process::Command::new(path)
        } else {
            std::process::Command::new(exe_name)
        };

        child.args(["serve", "--port", &port, "--hostname", "127.0.0.1"]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            child.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        match child.spawn() {
            Ok(_) => {
                // Wait up to 5s for server to initialize
                for _ in 0..25 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                    if let Ok(res) = client.get(&check_url).send().await {
                        if res.status().is_success() {
                            tracing::info!("OpenCode server successfully booted on {}", base_url);
                            return Ok(base_url);
                        }
                    }
                }
                anyhow::bail!(
                    "OpenCode server was spawned on port {} but did not become ready within 5 seconds. Check if port {} is occupied or start 'opencode serve' manually.",
                    port, port
                );
            }
            Err(e) => {
                anyhow::bail!(
                    "OpenCode CLI ('opencode') is not installed or failed to start: {}. \
                     To use OpenCode models (such as big-pickle), please install opencode ('npm i -g opencode' or see https://opencode.ai) \
                     or select another provider (such as Gemini, OpenAI, Anthropic, Ollama, Groq, DeepSeek) in Settings.",
                    e
                );
            }
        }
    }

    #[allow(dead_code)]
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
        // Route through local opencode serve daemon to ensure valid Zen credentials and avoid 403 errors
        let server_base = Self::ensure_opencode_server(&self.client).await?;

        // Create a dedicated session for this execution
        let session_create_url = format!("{}/session", server_base);
        let s_res = self
            .client
            .post(&session_create_url)
            .json(&json!({ "title": "SuperAgent Execution" }))
            .send()
            .await;

        let session_id = if let Ok(resp) = s_res {
            if let Ok(v) = resp.json::<serde_json::Value>().await {
                v.get("id")
                    .and_then(|id| id.as_str())
                    .unwrap_or("")
                    .to_string()
            } else {
                generate_opencode_session_id()
            }
        } else {
            generate_opencode_session_id()
        };

        // Construct system prompt and tools guide
        let mut system_text = String::new();
        let mut prompt_lines = Vec::new();

        for msg in messages {
            match msg.role {
                Role::System => {
                    if !system_text.is_empty() {
                        system_text.push('\n');
                    }
                    system_text.push_str(&msg.text_content());
                }
                Role::User => {
                    prompt_lines.push(msg.text_content());
                }
                Role::Assistant => {
                    prompt_lines.push(format!("[Assistant]: {}", msg.text_content()));
                }
                Role::Tool => {
                    for block in &msg.content {
                        if let ContentBlock::ToolResult {
                            tool_use_id,
                            content,
                            ..
                        } = block
                        {
                            prompt_lines
                                .push(format!("[Tool Result for {}]: {}", tool_use_id, content));
                        }
                    }
                }
            }
        }

        if !tools.is_empty() {
            let mut tools_guide =
                String::from("\n\nYou have access to the following execution tools:\n");
            for t in tools {
                let name = t
                    .get("name")
                    .or_else(|| t.get("function").and_then(|f| f.get("name")))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let desc = t
                    .get("description")
                    .or_else(|| t.get("function").and_then(|f| f.get("description")))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let params = t
                    .get("parameters")
                    .or_else(|| t.get("function").and_then(|f| f.get("parameters")))
                    .map(|p| p.to_string())
                    .unwrap_or_default();
                tools_guide.push_str(&format!("- {}({}): {}\n", name, params, desc));
            }
            tools_guide.push_str(
                "\nWhen you need to execute a tool, respond with a tool call in format:\n<｜DSML｜tool_calls>\n<｜DSML｜invoke name=\"tool_name\">\n<｜DSML｜parameter name=\"param_name\">value</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜tool_calls>\n"
            );
            system_text.push_str(&tools_guide);
        }

        let user_prompt = if prompt_lines.len() == 1 {
            prompt_lines.remove(0)
        } else {
            prompt_lines.join("\n\n")
        };

        let (tx, rx) = channel(100);

        let event_url = format!("{}/event", server_base);
        let msg_url = format!("{}/session/{}/message", server_base, session_id);
        let client_clone = self.client.clone();
        let target_session_id = session_id.clone();
        let model_id = config.model_id.clone();

        tokio::spawn(async move {
            use std::sync::atomic::{AtomicBool, Ordering};
            use std::sync::Arc;

            let streamed_any = Arc::new(AtomicBool::new(false));
            let streamed_any_clone = streamed_any.clone();
            let is_idle = Arc::new(AtomicBool::new(false));
            let is_idle_clone = is_idle.clone();

            // Subscribe to SSE events for live token streaming
            let sse_tx = tx.clone();
            let sse_sess_id = target_session_id.clone();
            let sse_client = client_clone.clone();

            let sse_task = tokio::spawn(async move {
                if let Ok(res) = sse_client.get(&event_url).send().await {
                    let mut stream = res.bytes_stream();
                    let mut buffer = String::new();
                    while let Some(item) = stream.next().await {
                        let bytes = match item {
                            Ok(b) => b,
                            Err(_) => break,
                        };
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        while let Some(pos) = buffer.find('\n') {
                            let line = buffer[..pos].trim_end_matches('\r').trim().to_string();
                            buffer.drain(..=pos);
                            if let Some(data_str) = line.strip_prefix("data: ") {
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(data_str)
                                {
                                    let msg_type =
                                        val.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                    let props = val.get("properties");
                                    let sid = props
                                        .and_then(|p| p.get("sessionID"))
                                        .and_then(|s| s.as_str())
                                        .unwrap_or("");

                                    if sid == sse_sess_id {
                                        if msg_type == "session.idle" {
                                            is_idle_clone.store(true, Ordering::Relaxed);
                                            return;
                                        }

                                        if msg_type == "message.part.delta" {
                                            if let Some(props) = props {
                                                let field = props
                                                    .get("field")
                                                    .and_then(|f| f.as_str())
                                                    .unwrap_or("");
                                                if field == "text" || field == "reasoning" {
                                                    if let Some(delta) =
                                                        props.get("delta").and_then(|d| d.as_str())
                                                    {
                                                        streamed_any_clone
                                                            .store(true, Ordering::Relaxed);
                                                        if sse_tx
                                                            .send(AgentEvent::Token {
                                                                text: delta.to_string(),
                                                            })
                                                            .await
                                                            .is_err()
                                                        {
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
                    }
                }
            });

            // Post the message to opencode serve
            let payload = json!({
                "model": {
                    "providerID": "opencode",
                    "modelID": model_id
                },
                "system": system_text,
                "parts": [
                    { "type": "text", "text": user_prompt }
                ]
            });

            let post_res = client_clone.post(&msg_url).json(&payload).send().await;
            match post_res {
                Ok(resp) if resp.status().is_success() => {}
                Ok(resp) => {
                    let err_text = resp.text().await.unwrap_or_default();
                    let _ = tx
                        .send(AgentEvent::Error {
                            message: format!("OpenCode server rejected message: {}", err_text),
                        })
                        .await;
                    let _ = tx
                        .send(AgentEvent::Finished {
                            stop_reason: "error".to_string(),
                        })
                        .await;
                    return;
                }
                Err(err) => {
                    let _ = tx
                        .send(AgentEvent::Error {
                            message: format!("Failed to send message to OpenCode server: {}", err),
                        })
                        .await;
                    let _ = tx
                        .send(AgentEvent::Finished {
                            stop_reason: "error".to_string(),
                        })
                        .await;
                    return;
                }
            }

            // Wait for session to finish or timeout (up to 90s for multi-step agent actions)
            let mut wait_count = 0;
            while !is_idle.load(Ordering::Relaxed) && wait_count < 180 {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                wait_count += 1;
            }
            sse_task.abort();

            // Fetch final messages to guarantee complete output
            let history_url = format!("{}/session/{}/message", server_base, target_session_id);
            if let Ok(hist_res) = client_clone.get(&history_url).send().await {
                if let Ok(messages_val) = hist_res.json::<Vec<serde_json::Value>>().await {
                    let mut final_text = String::new();
                    for m in &messages_val {
                        if m.get("info")
                            .and_then(|i| i.get("role"))
                            .and_then(|r| r.as_str())
                            == Some("assistant")
                        {
                            if let Some(parts) = m.get("parts").and_then(|p| p.as_array()) {
                                for p in parts {
                                    if p.get("type").and_then(|t| t.as_str()) == Some("text") {
                                        if let Some(t) = p.get("text").and_then(|txt| txt.as_str())
                                        {
                                            if !t.is_empty() {
                                                final_text = t.to_string();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if !streamed_any.load(Ordering::Relaxed) && !final_text.is_empty() {
                        let _ = tx.send(AgentEvent::Token { text: final_text }).await;
                    }
                }
            }

            if !streamed_any.load(Ordering::Relaxed) && wait_count >= 180 {
                let _ = tx
                    .send(AgentEvent::Error {
                        message: "OpenCode request timed out after 90 seconds without receiving any response.".to_string(),
                    })
                    .await;
            }

            let _ = tx
                .send(AgentEvent::Finished {
                    stop_reason: "stop".to_string(),
                })
                .await;
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
        assert!(OPENCODE_FREE_MODELS.contains(&"mimo-v2.5-free"));
        assert!(OPENCODE_FREE_MODELS.contains(&"nemotron-3-ultra-free"));
    }

    #[test]
    fn test_canonical_session_generation() {
        let session = generate_opencode_session_id();
        assert!(session.starts_with("ses_"));
        assert_eq!(session.len(), 30);

        let request = generate_opencode_request_id();
        assert!(request.starts_with("msg_"));
        assert_eq!(request.len(), 30);
    }

    #[tokio::test]
    async fn test_opencode_server_missing_error() {
        // When opencode CLI is not installed and port is not listening, ensure_opencode_server must return an Err
        let client = reqwest::Client::new();
        std::env::set_var("OPENCODE_PORT", "59999");
        let result = OpenCodeProvider::ensure_opencode_server(&client).await;
        // Port 59999 is not running, and opencode CLI is not installed on test runner
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("OpenCode"));
    }
}
