use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

use crate::memory::ConversationContext;
use crate::mcp::{McpClient, McpToolWrapper};
use crate::providers::ProviderFactory;
use crate::tools::ToolRegistry;
use crate::types::{AgentEvent, ChatMessage, ContentBlock, ModelConfig, Role};

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
            context.add_user_message(user_prompt);

            for _turn in 0..max_turns {
                let schemas = tools.list_schemas();
                let stream_res = provider
                    .chat_stream(&config, &context.all_messages(), &schemas)
                    .await;

                let mut stream_rx = match stream_res {
                    Ok(rx) => rx,
                    Err(err) => {
                        let _ = tx
                            .send(AgentEvent::Error {
                                message: err.to_string(),
                            })
                            .await;
                        return;
                    }
                };

                let mut turn_text = String::new();
                let mut turn_tool_calls = Vec::new();
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
                            let _ = tx.send(event).await;
                        }
                        AgentEvent::ToolOutput { .. } => {
                            let _ = tx.send(event).await;
                        }
                        AgentEvent::Finished { .. } => {
                            // Suppress per-turn provider finish events until outer loop turn ends
                        }
                    }
                }

                if let Some(_err) = stream_error {
                    return;
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
}
