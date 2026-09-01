use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use base64::Engine;

use crate::memory::ConversationContext;
use crate::mcp::{McpClient, McpToolWrapper};
use crate::providers::ProviderFactory;
use crate::tools::ToolRegistry;
use crate::types::{AgentEvent, ChatMessage, ContentBlock, ModelConfig, Role};

/// Loads an attachment from a file path or data URI into a ContentBlock::Image if it is an image.
pub async fn load_attachment_image_block(path_or_uri: &str) -> Option<ContentBlock> {
    let trimmed = path_or_uri.trim();
    if trimmed.is_empty() {
        return None;
    }

    // 1. Handle base64 data URI directly (e.g. data:image/png;base64,....)
    if trimmed.starts_with("data:image/") {
        if let Some(idx) = trimmed.find(";base64,") {
            let media_type = trimmed[5..idx].to_string();
            let data = trimmed[idx + 8..].to_string();
            return Some(ContentBlock::Image { media_type, data });
        }
    }

    // 2. Handle on-disk file path
    let path = std::path::Path::new(trimmed);
    if path.exists() && path.is_file() {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        let mime_str = mime.to_string();
        if mime_str.starts_with("image/") {
            if let Ok(bytes) = tokio::fs::read(path).await {
                let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
                return Some(ContentBlock::Image {
                    media_type: mime_str,
                    data,
                });
            }
        }
    }

    None
}

/// The core multi-turn agent execution engine.
#[derive(Clone)]
pub struct AgentEngine {
    tools: Arc<ToolRegistry>,
    mcp_client: Option<Arc<Mutex<McpClient>>>,
    max_turns: usize,
}

impl AgentEngine {
    /// Creates a new `AgentEngine` with the given `ToolRegistry`.
    pub fn new(tools: Arc<ToolRegistry>) -> Self {
        Self {
            tools,
            mcp_client: None,
            max_turns: 20,
        }
    }

    /// Creates a new `AgentEngine` with both a `ToolRegistry` and an `McpClient`.
    pub fn with_mcp(
        tools: Arc<ToolRegistry>,
        mcp_client: Arc<Mutex<McpClient>>,
    ) -> Self {
        Self {
            tools,
            mcp_client: Some(mcp_client),
            max_turns: 20,
        }
    }

    /// Customizes the maximum number of turns before stopping the loop.
    pub fn set_max_turns(&mut self, max_turns: usize) {
        self.max_turns = max_turns;
    }

    /// Registers all available tools from the attached MCP client into the tool registry.
    pub async fn sync_mcp_tools(&self, mut registry: ToolRegistry) -> anyhow::Result<ToolRegistry> {
        if let Some(ref mcp) = self.mcp_client {
            let mcp_tools = {
                let mut client = mcp.lock().await;
                client.list_tools().await?
            };

            for tool_info in mcp_tools {
                let wrapper = McpToolWrapper::new(mcp.clone(), tool_info);
                registry.register_arc(Arc::new(wrapper));
            }
        }
        Ok(registry)
    }

    /// Runs the multi-turn agent interaction loop.
    ///
    /// - Sends user prompt + history + tool schemas to LLM provider stream.
    /// - Parses streaming responses (`Token`, `ToolCall`).
    /// - Executes tool calls via `ToolRegistry` or `McpClient`.
    /// - Feeds tool output back to conversation history and loops until LLM produces final answer or stop condition.
    pub async fn run_loop(
        &self,
        config: &ModelConfig,
        system_prompt: &str,
        user_prompt: &str,
    ) -> anyhow::Result<mpsc::Receiver<AgentEvent>> {
        self.run_loop_with_attachments(config, system_prompt, user_prompt, Vec::new()).await
    }

    /// Runs the multi-turn agent interaction loop with optional image/file attachments.
    pub async fn run_loop_with_attachments(
        &self,
        config: &ModelConfig,
        system_prompt: &str,
        user_prompt: &str,
        attachments: Vec<String>,
    ) -> anyhow::Result<mpsc::Receiver<AgentEvent>> {
        let (tx, rx) = mpsc::channel::<AgentEvent>(200);

        let config = config.clone();
        let system_prompt = system_prompt.to_string();
        let user_prompt = user_prompt.to_string();
        let tools = Arc::clone(&self.tools);
        let max_turns = self.max_turns;

        tokio::spawn(async move {
            let provider = ProviderFactory::create(&config.provider);
            let mut context = ConversationContext::default();
            if !system_prompt.is_empty() {
                context.set_system_prompt(system_prompt);
            }

            let mut user_blocks = vec![ContentBlock::Text { text: user_prompt }];
            for att in &attachments {
                if let Some(img_block) = load_attachment_image_block(att).await {
                    user_blocks.push(img_block);
                }
            }
            context.add_message(ChatMessage::user_blocks(user_blocks));

            for _turn in 0..max_turns {
                let schemas = tools.list_schemas();
                let mut turn_text = String::new();
                let mut turn_tool_calls = Vec::new();
                let mut turn_succeeded = false;
                let mut last_error_msg = String::new();

                const MAX_RETRIES: usize = 3;
                const RETRY_DELAY_SECS: u64 = 3;

                for attempt in 1..=MAX_RETRIES {
                    let stream_res = provider
                        .chat_stream(&config, &context.all_messages(), &schemas)
                        .await;

                    let mut stream_rx = match stream_res {
                        Ok(rx) => rx,
                        Err(err) => {
                            last_error_msg = err.to_string();
                            if attempt < MAX_RETRIES {
                                tracing::warn!(
                                    "LLM stream request failed (attempt {}/{}): {}. Retrying in {}s...",
                                    attempt,
                                    MAX_RETRIES,
                                    last_error_msg,
                                    RETRY_DELAY_SECS
                                );
                                tokio::time::sleep(tokio::time::Duration::from_secs(RETRY_DELAY_SECS)).await;
                                continue;
                            } else {
                                let _ = tx
                                    .send(AgentEvent::Error {
                                        message: format!("Failed after {} attempts: {}", MAX_RETRIES, last_error_msg),
                                    })
                                    .await;
                                return;
                            }
                        }
                    };

                    turn_text.clear();
                    turn_tool_calls.clear();
                    let mut stream_error = None;

                    while let Some(event) = stream_rx.recv().await {
                        match &event {
                            AgentEvent::Token { text } => {
                                turn_text.push_str(text);
                                let _ = tx.send(event).await;
                            }
                            AgentEvent::ToolCall { id, name, input } => {
                                turn_tool_calls.push((id.clone(), name.clone(), input.clone()));
                                let _ = tx.send(event).await;
                            }
                            AgentEvent::Error { message } => {
                                stream_error = Some(message.clone());
                            }
                            AgentEvent::ToolOutput { .. } => {
                                let _ = tx.send(event).await;
                            }
                            AgentEvent::Finished { .. } => {
                                // Suppress per-turn provider finish events until outer loop turn ends
                            }
                            AgentEvent::AgentHandover { .. }
                            | AgentEvent::SubagentStart { .. }
                            | AgentEvent::SubagentFinish { .. }
                            | AgentEvent::WorkflowProgress { .. } => {
                                let _ = tx.send(event).await;
                            }
                        }
                    }

                    if let Some(err) = stream_error {
                        last_error_msg = err;
                        if attempt < MAX_RETRIES {
                            tracing::warn!(
                                "LLM stream error (attempt {}/{}): {}. Retrying in {}s...",
                                attempt,
                                MAX_RETRIES,
                                last_error_msg,
                                RETRY_DELAY_SECS
                            );
                            tokio::time::sleep(tokio::time::Duration::from_secs(RETRY_DELAY_SECS)).await;
                            continue;
                        } else {
                            let _ = tx
                                .send(AgentEvent::Error {
                                    message: format!("Stream error after {} attempts: {}", MAX_RETRIES, last_error_msg),
                                })
                                .await;
                            return;
                        }
                    }

                    // Check if the model returned nothing at all (empty text and no tool calls)
                    if turn_text.trim().is_empty() && turn_tool_calls.is_empty() {
                        if attempt < MAX_RETRIES {
                            tracing::warn!(
                                "LLM returned empty completion (attempt {}/{}). Retrying in {}s...",
                                attempt,
                                MAX_RETRIES,
                                RETRY_DELAY_SECS
                            );
                            tokio::time::sleep(tokio::time::Duration::from_secs(RETRY_DELAY_SECS)).await;
                            continue;
                        }
                    }

                    turn_succeeded = true;
                    break;
                }

                if !turn_succeeded {
                    let err_detail = if last_error_msg.is_empty() {
                        "Model failed to produce a valid response after 3 retries.".to_string()
                    } else {
                        format!("Model failed after 3 retries: {}", last_error_msg)
                    };
                    let _ = tx
                        .send(AgentEvent::Error {
                            message: err_detail,
                        })
                        .await;
                    return;
                }

                if turn_tool_calls.is_empty() && !turn_text.is_empty() {
                    let valid_names: Vec<String> = schemas
                        .iter()
                        .filter_map(|s| s.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()))
                        .collect();
                    if let Some((name, input)) = try_recover_text_tool_call(&turn_text, &valid_names) {
                        let call_id = format!("call_{}", uuid::Uuid::new_v4().simple());
                        let _ = tx
                            .send(AgentEvent::ToolCall {
                                id: call_id.clone(),
                                name: name.clone(),
                                input: input.clone(),
                            })
                            .await;
                        turn_tool_calls.push((call_id, name, input));
                        turn_text.clear();
                    }
                }

                if !turn_tool_calls.is_empty() {
                    let mut content_blocks = Vec::new();
                    if !turn_text.is_empty() {
                        content_blocks.push(ContentBlock::Text {
                            text: turn_text.clone(),
                        });
                    }
                    for (id, name, input) in &turn_tool_calls {
                        content_blocks.push(ContentBlock::ToolUse {
                            id: id.clone(),
                            name: name.clone(),
                            input: input.clone(),
                        });
                    }
                    context.add_message(ChatMessage::new(Role::Assistant, content_blocks));

                    for (id, name, input) in turn_tool_calls {
                        let (output, is_error) = match tools.execute_tool(&name, input).await {
                            Ok(out) => (out, false),
                            Err(err) => (err.to_string(), true),
                        };

                        let _ = tx
                            .send(AgentEvent::ToolOutput {
                                tool_use_id: id.clone(),
                                output: output.clone(),
                                is_error,
                            })
                            .await;

                        context.add_tool_result(id, output, is_error);
                    }
                } else {
                    if !turn_text.is_empty() {
                        context.add_assistant_message(turn_text);
                    }
                    let _ = tx
                        .send(AgentEvent::Finished {
                            stop_reason: "end_turn".to_string(),
                        })
                        .await;
                    return;
                }
            }

            let _ = tx
                .send(AgentEvent::Finished {
                    stop_reason: "max_turns_exceeded".to_string(),
                })
                .await;
        });

        Ok(rx)
    }

    /// Runs the multi-turn agent interaction loop with prior conversation history.
    ///
    /// Pre-populates the conversation context with `initial_history` messages
    /// before adding the new `user_prompt`, enabling multi-turn memory.
    /// Returns a tuple of (event receiver, collected new messages for this run).
    pub async fn run_loop_with_history(
        &self,
        config: &ModelConfig,
        system_prompt: &str,
        user_prompt: &str,
        initial_history: Vec<ChatMessage>,
    ) -> anyhow::Result<(mpsc::Receiver<AgentEvent>, mpsc::Receiver<Vec<ChatMessage>>)> {
        self.run_loop_with_history_and_attachments(
            config,
            system_prompt,
            user_prompt,
            initial_history,
            Vec::new(),
        )
        .await
    }

    /// Runs the multi-turn agent interaction loop with prior conversation history and image/file attachments.
    pub async fn run_loop_with_history_and_attachments(
        &self,
        config: &ModelConfig,
        system_prompt: &str,
        user_prompt: &str,
        initial_history: Vec<ChatMessage>,
        attachments: Vec<String>,
    ) -> anyhow::Result<(mpsc::Receiver<AgentEvent>, mpsc::Receiver<Vec<ChatMessage>>)> {
        let (tx, rx) = mpsc::channel::<AgentEvent>(200);
        let (history_tx, history_rx) = mpsc::channel::<Vec<ChatMessage>>(1);

        let config = config.clone();
        let system_prompt = system_prompt.to_string();
        let user_prompt = user_prompt.to_string();
        let tools = Arc::clone(&self.tools);
        let max_turns = self.max_turns;

        tokio::spawn(async move {
            let provider = ProviderFactory::create(&config.provider);
            let mut context = ConversationContext::default();
            if !system_prompt.is_empty() {
                context.set_system_prompt(system_prompt);
            }

            // Restore prior conversation history
            for msg in &initial_history {
                context.add_message(msg.clone());
            }

            // Track new messages generated in this run
            let mut new_messages: Vec<ChatMessage> = Vec::new();

            // Add the new user message (with attachments if any)
            let mut user_blocks = vec![ContentBlock::Text { text: user_prompt.clone() }];
            for att in &attachments {
                if let Some(img_block) = load_attachment_image_block(att).await {
                    user_blocks.push(img_block);
                }
            }
            let user_msg = ChatMessage::user_blocks(user_blocks);
            context.add_message(user_msg.clone());
            new_messages.push(user_msg);

            for _turn in 0..max_turns {
                let schemas = tools.list_schemas();
                let mut turn_text = String::new();
                let mut turn_tool_calls = Vec::new();
                let mut turn_succeeded = false;
                let mut last_error_msg = String::new();

                const MAX_RETRIES: usize = 3;
                const RETRY_DELAY_SECS: u64 = 3;

                for attempt in 1..=MAX_RETRIES {
                    let stream_res = provider
                        .chat_stream(&config, &context.all_messages(), &schemas)
                        .await;

                    let mut stream_rx = match stream_res {
                        Ok(rx) => rx,
                        Err(err) => {
                            last_error_msg = err.to_string();
                            if attempt < MAX_RETRIES {
                                tokio::time::sleep(tokio::time::Duration::from_secs(RETRY_DELAY_SECS)).await;
                                continue;
                            } else {
                                let _ = tx
                                    .send(AgentEvent::Error {
                                        message: format!("Failed after {} attempts: {}", MAX_RETRIES, last_error_msg),
                                    })
                                    .await;
                                let _ = history_tx.send(new_messages).await;
                                return;
                            }
                        }
                    };

                    turn_text.clear();
                    turn_tool_calls.clear();
                    let mut stream_error = None;

                    while let Some(event) = stream_rx.recv().await {
                        match &event {
                            AgentEvent::Token { text } => {
                                turn_text.push_str(text);
                                let _ = tx.send(event).await;
                            }
                            AgentEvent::ToolCall { id, name, input } => {
                                turn_tool_calls.push((id.clone(), name.clone(), input.clone()));
                                let _ = tx.send(event).await;
                            }
                            AgentEvent::Error { message } => {
                                stream_error = Some(message.clone());
                            }
                            AgentEvent::ToolOutput { .. } => {
                                let _ = tx.send(event).await;
                            }
                            AgentEvent::Finished { .. } => {}
                            _ => {
                                let _ = tx.send(event).await;
                            }
                        }
                    }

                    if let Some(err) = stream_error {
                        last_error_msg = err;
                        if attempt < MAX_RETRIES {
                            tokio::time::sleep(tokio::time::Duration::from_secs(RETRY_DELAY_SECS)).await;
                            continue;
                        } else {
                            let _ = tx
                                .send(AgentEvent::Error {
                                    message: format!("Stream error after {} attempts: {}", MAX_RETRIES, last_error_msg),
                                })
                                .await;
                            let _ = history_tx.send(new_messages).await;
                            return;
                        }
                    }

                    if turn_text.trim().is_empty() && turn_tool_calls.is_empty() {
                        if attempt < MAX_RETRIES {
                            tokio::time::sleep(tokio::time::Duration::from_secs(RETRY_DELAY_SECS)).await;
                            continue;
                        }
                    }

                    turn_succeeded = true;
                    break;
                }

                if !turn_succeeded {
                    let err_detail = if last_error_msg.is_empty() {
                        "Model failed to produce a valid response after 3 retries.".to_string()
                    } else {
                        format!("Model failed after 3 retries: {}", last_error_msg)
                    };
                    let _ = tx
                        .send(AgentEvent::Error {
                            message: err_detail,
                        })
                        .await;
                    let _ = history_tx.send(new_messages).await;
                    return;
                }

                if turn_tool_calls.is_empty() && !turn_text.is_empty() {
                    let valid_names: Vec<String> = schemas
                        .iter()
                        .filter_map(|s| s.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()))
                        .collect();
                    if let Some((name, input)) = try_recover_text_tool_call(&turn_text, &valid_names) {
                        let call_id = format!("call_{}", uuid::Uuid::new_v4().simple());
                        let _ = tx
                            .send(AgentEvent::ToolCall {
                                id: call_id.clone(),
                                name: name.clone(),
                                input: input.clone(),
                            })
                            .await;
                        turn_tool_calls.push((call_id, name, input));
                        turn_text.clear();
                    }
                }

                if !turn_tool_calls.is_empty() {
                    let mut content_blocks = Vec::new();
                    if !turn_text.is_empty() {
                        content_blocks.push(ContentBlock::Text {
                            text: turn_text.clone(),
                        });
                    }
                    for (id, name, input) in &turn_tool_calls {
                        content_blocks.push(ContentBlock::ToolUse {
                            id: id.clone(),
                            name: name.clone(),
                            input: input.clone(),
                        });
                    }
                    let assistant_msg = ChatMessage::new(Role::Assistant, content_blocks);
                    context.add_message(assistant_msg.clone());
                    new_messages.push(assistant_msg);

                    for (id, name, input) in turn_tool_calls {
                        let (output, is_error) = match tools.execute_tool(&name, input).await {
                            Ok(out) => (out, false),
                            Err(err) => (err.to_string(), true),
                        };

                        let _ = tx
                            .send(AgentEvent::ToolOutput {
                                tool_use_id: id.clone(),
                                output: output.clone(),
                                is_error,
                            })
                            .await;

                        let tool_msg = ChatMessage::tool_result(&id, &output, is_error);
                        context.add_message(tool_msg.clone());
                        new_messages.push(tool_msg);
                    }
                } else {
                    if !turn_text.is_empty() {
                        let assistant_msg = ChatMessage::assistant(&turn_text);
                        context.add_message(assistant_msg.clone());
                        new_messages.push(assistant_msg);
                    }
                    let _ = tx
                        .send(AgentEvent::Finished {
                            stop_reason: "end_turn".to_string(),
                        })
                        .await;
                    let _ = history_tx.send(new_messages).await;
                    return;
                }
            }

            let _ = tx
                .send(AgentEvent::Finished {
                    stop_reason: "max_turns_exceeded".to_string(),
                })
                .await;
            let _ = history_tx.send(new_messages).await;
        });

        Ok((rx, history_rx))
    }
}

/// Attempts to parse and recover a tool call emitted as raw JSON, XML tags, or markdown text
/// by smaller models (e.g. Llama 3.2 3B, Gemma 2 9B, Ollama local models).
fn try_recover_text_tool_call(text: &str, valid_tool_names: &[String]) -> Option<(String, serde_json::Value)> {
    let trimmed = text.trim();

    // 1. Check for XML <artifact id="...">...</artifact> tags
    if valid_tool_names.iter().any(|v| v == "create_artifact") {
        if let (Some(start_tag), Some(end_tag)) = (trimmed.find("<artifact"), trimmed.rfind("</artifact>")) {
            let tag_content = &trimmed[start_tag..=end_tag + 10];
            let id = if let Some(id_start) = tag_content.find("id=\"") {
                let rest = &tag_content[id_start + 4..];
                rest.find('"').map(|end| rest[..end].to_string()).unwrap_or_else(|| "app".to_string())
            } else {
                "app".to_string()
            };

            let inner = if let Some(tag_end) = tag_content.find('>') {
                let rest = &tag_content[tag_end + 1..];
                if let Some(close_idx) = rest.rfind("</artifact>") {
                    rest[..close_idx].trim()
                } else {
                    rest.trim()
                }
            } else {
                ""
            };

            if !inner.is_empty() {
                return Some((
                    "create_artifact".to_string(),
                    serde_json::json!({
                        "id": id,
                        "name": "Interactive App",
                        "type": "web",
                        "entry": "index.html",
                        "files": {
                            "index.html": inner
                        }
                    }),
                ));
            }
        }
    }

    // 2. Check for Hermes/XML <tool_call>...</tool_call> or <function=...>{...}</function>
    if let (Some(start), Some(end)) = (trimmed.find("<tool_call>"), trimmed.rfind("</tool_call>")) {
        let inside = &trimmed[start + 11..end].trim();
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(inside) {
            if let Some(name) = val.get("name").and_then(|n| n.as_str()) {
                if valid_tool_names.iter().any(|v| v == name) {
                    let params = val.get("parameters")
                        .or_else(|| val.get("arguments"))
                        .or_else(|| val.get("input"))
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!({}));
                    return Some((name.to_string(), params));
                }
            }
        }
    }

    // 3. Try stripping markdown code fences if wrapped in ```json ... ```
    let candidate = if let Some(code_block) = trimmed.strip_prefix("```json").or_else(|| trimmed.strip_prefix("```")) {
        if let Some(end) = code_block.rfind("```") {
            code_block[..end].trim()
        } else {
            code_block.trim()
        }
    } else {
        trimmed
    };

    // 4. Look for JSON object enclosed in { ... }
    if let (Some(start), Some(end)) = (candidate.find('{'), candidate.rfind('}')) {
        if start <= end {
            let json_slice = &candidate[start..=end];
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_slice) {
                // Shape A: { "name": "...", "parameters": { ... } } or { "name": "...", "arguments": { ... } }
                if let Some(name) = val.get("name").and_then(|n| n.as_str()) {
                    if valid_tool_names.iter().any(|v| v == name) {
                        let params = val.get("parameters")
                            .or_else(|| val.get("arguments"))
                            .or_else(|| val.get("input"))
                            .cloned()
                            .unwrap_or_else(|| serde_json::json!({}));
                        return Some((name.to_string(), params));
                    }
                }
                // Shape B: { "tool": "...", "input": { ... } } or { "tool_name": "...", "tool_args": { ... } }
                if let Some(name) = val.get("tool").or_else(|| val.get("tool_name")).and_then(|n| n.as_str()) {
                    if valid_tool_names.iter().any(|v| v == name) {
                        let params = val.get("input")
                            .or_else(|| val.get("tool_args"))
                            .or_else(|| val.get("parameters"))
                            .cloned()
                            .unwrap_or_else(|| serde_json::json!({}));
                        return Some((name.to_string(), params));
                    }
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_load_data_uri_image() {
        let uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        let block = load_attachment_image_block(uri).await;
        assert!(block.is_some());
        if let Some(ContentBlock::Image { media_type, data }) = block {
            assert_eq!(media_type, "image/png");
            assert!(data.starts_with("iVBORw0KGgoAAA"));
        } else {
            panic!("Expected ContentBlock::Image");
        }
    }

    #[tokio::test]
    async fn test_load_disk_image_file() {
        let temp_dir = std::env::temp_dir().join(format!("test_img_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let file_path = temp_dir.join("sample.png");
        let fake_bytes = b"fake_png_binary_data";
        std::fs::write(&file_path, fake_bytes).unwrap();

        let block = load_attachment_image_block(&file_path.to_string_lossy()).await;
        assert!(block.is_some());
        if let Some(ContentBlock::Image { media_type, data }) = block {
            assert_eq!(media_type, "image/png");
            assert_eq!(data, base64::engine::general_purpose::STANDARD.encode(fake_bytes));
        } else {
            panic!("Expected ContentBlock::Image");
        }

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_load_non_image_file_ignored() {
        let temp_dir = std::env::temp_dir().join(format!("test_txt_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let file_path = temp_dir.join("sample.txt");
        std::fs::write(&file_path, b"hello world").unwrap();

        let block = load_attachment_image_block(&file_path.to_string_lossy()).await;
        assert!(block.is_none());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

