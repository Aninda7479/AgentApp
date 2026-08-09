use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

use crate::mcp::protocol::*;
use crate::tools::r#trait::Tool;

/// Model Context Protocol (MCP) Client managing stdio connection and JSON-RPC 2.0 communication.
pub struct McpClient {
    _child: Child,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
    request_id: AtomicU64,
}

impl McpClient {
    /// Spawns a new MCP server process using stdio transport.
    pub fn spawn(
        command: &str,
        args: &[&str],
        envs: Option<HashMap<String, String>>,
    ) -> Result<Self> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        if let Some(environment) = envs {
            cmd.envs(environment);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn MCP server process '{}': {}", command, e))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| anyhow!("Failed to capture stdin for MCP server process"))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow!("Failed to capture stdout for MCP server process"))?;

        let reader = BufReader::new(stdout);

        Ok(Self {
            _child: child,
            stdin,
            reader,
            request_id: AtomicU64::new(1),
        })
    }

    /// Sends a JSON-RPC 2.0 request and waits for matching response by ID.
    pub async fn send_request(&mut self, method: &str, params: Option<Value>) -> Result<Value> {
        let id = self.request_id.fetch_add(1, Ordering::SeqCst);
        let req = JsonRpcRequest::new(id, method, params);
        let payload = serde_json::to_string(&req)? + "\n";

        self.stdin.write_all(payload.as_bytes()).await?;
        self.stdin.flush().await?;

        let target_id = Value::Number(id.into());

        let mut line = String::new();
        loop {
            line.clear();
            let bytes_read = self.reader.read_line(&mut line).await?;
            if bytes_read == 0 {
                anyhow::bail!("MCP server process closed connection unexpectedly");
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(response) = serde_json::from_str::<JsonRpcResponse>(trimmed) {
                if response.id == target_id {
                    if let Some(err) = response.error {
                        anyhow::bail!("MCP JSON-RPC Error [code {}]: {}", err.code, err.message);
                    }
                    return Ok(response.result.unwrap_or(Value::Null));
                }
            }
            // Skip notifications or unrelated responses
        }
    }

    /// Sends a JSON-RPC 2.0 notification.
    pub async fn send_notification(&mut self, method: &str, params: Option<Value>) -> Result<()> {
        let notif = JsonRpcNotification::new(method, params);
        let payload = serde_json::to_string(&notif)? + "\n";

        self.stdin.write_all(payload.as_bytes()).await?;
        self.stdin.flush().await?;
        Ok(())
    }

    /// Performs MCP handshake initialization.
    pub async fn initialize(&mut self) -> Result<InitializeResult> {
        let init_params = json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "superagent-core-v2",
                "version": "0.1.0"
            }
        });

        let res_val = self.send_request("initialize", Some(init_params)).await?;
        let init_result: InitializeResult = serde_json::from_value(res_val)?;

        // Send notifications/initialized as required by MCP spec
        self.send_notification("notifications/initialized", None).await?;

        Ok(init_result)
    }

    /// Queries the MCP server for available tools (`tools/list`).
    pub async fn list_tools(&mut self) -> Result<Vec<McpTool>> {
        let res_val = self.send_request("tools/list", None).await?;
        let list_result: ListToolsResult = serde_json::from_value(res_val)?;
        Ok(list_result.tools)
    }

    /// Executes a tool on the MCP server (`tools/call`).
    pub async fn call_tool(&mut self, name: &str, arguments: Option<Value>) -> Result<CallToolResult> {
        let params = json!({
            "name": name,
            "arguments": arguments.unwrap_or(json!({}))
        });

        let res_val = self.send_request("tools/call", Some(params)).await?;
        let call_result: CallToolResult = serde_json::from_value(res_val)?;
        Ok(call_result)
    }
}

/// Adapter wrapping an MCP Tool to implement the agent's core `Tool` trait.
pub struct McpToolWrapper {
    client: Arc<Mutex<McpClient>>,
    tool_info: McpTool,
}

impl McpToolWrapper {
    pub fn new(client: Arc<Mutex<McpClient>>, tool_info: McpTool) -> Self {
        Self { client, tool_info }
    }
}

#[async_trait]
impl Tool for McpToolWrapper {
    fn name(&self) -> &str {
        &self.tool_info.name
    }

    fn description(&self) -> &str {
        self.tool_info
            .description
            .as_deref()
            .unwrap_or("No description provided by MCP server.")
    }

    fn parameters_schema(&self) -> Value {
        self.tool_info.input_schema.clone()
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let mut client = self.client.lock().await;
        let result = client.call_tool(&self.tool_info.name, Some(input)).await?;

        if result.is_error.unwrap_or(false) {
            let error_text = result
                .content
                .iter()
                .filter_map(|c| c.text.as_deref())
                .collect::<Vec<&str>>()
                .join("\n");
            anyhow::bail!("MCP tool execution failed: {}", error_text);
        }

        let output = result
            .content
            .iter()
            .filter_map(|c| c.text.as_deref())
            .collect::<Vec<&str>>()
            .join("\n");

        Ok(output)
    }
}
