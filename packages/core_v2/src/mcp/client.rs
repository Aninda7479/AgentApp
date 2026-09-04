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

pub const DEFAULT_MCP_PROTOCOL_VERSION: &str = "2024-11-05";

pub enum McpTransport {
    Stdio {
        _child: Child,
        stdin: ChildStdin,
        reader: BufReader<ChildStdout>,
    },
    Http {
        url: String,
        headers: HashMap<String, String>,
        client: reqwest::Client,
    },
    Sse {
        sse_url: String,
        post_url: String,
        headers: HashMap<String, String>,
        client: reqwest::Client,
    },
}

/// Model Context Protocol (MCP) Client managing Stdio, HTTP, or SSE transport communication.
pub struct McpClient {
    transport: McpTransport,
    request_id: AtomicU64,
}

impl McpClient {
    /// Spawns a new MCP server process using Stdio transport.
    pub fn spawn(
        command: &str,
        args: &[&str],
        envs: Option<HashMap<String, String>>,
    ) -> Result<Self> {
        let mut cmd = Command::new(command);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000);
        cmd.kill_on_drop(true);
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
            transport: McpTransport::Stdio {
                _child: child,
                stdin,
                reader,
            },
            request_id: AtomicU64::new(1),
        })
    }

    /// Connects to a remote MCP server via HTTP JSON-RPC endpoint.
    pub fn connect_http(url: &str, headers: Option<HashMap<String, String>>) -> Self {
        Self {
            transport: McpTransport::Http {
                url: url.to_string(),
                headers: headers.unwrap_or_default(),
                client: reqwest::Client::new(),
            },
            request_id: AtomicU64::new(1),
        }
    }

    /// Connects to a remote MCP server via Server-Sent Events (SSE) transport.
    pub fn connect_sse(
        sse_url: &str,
        post_url: Option<&str>,
        headers: Option<HashMap<String, String>>,
    ) -> Self {
        let post_endpoint = post_url.unwrap_or(sse_url).to_string();
        Self {
            transport: McpTransport::Sse {
                sse_url: sse_url.to_string(),
                post_url: post_endpoint,
                headers: headers.unwrap_or_default(),
                client: reqwest::Client::new(),
            },
            request_id: AtomicU64::new(1),
        }
    }

    /// Sends a JSON-RPC 2.0 request and waits for matching response by ID.
    pub async fn send_request(&mut self, method: &str, params: Option<Value>) -> Result<Value> {
        let id = self.request_id.fetch_add(1, Ordering::SeqCst);
        let req = JsonRpcRequest::new(id, method, params);

        match &mut self.transport {
            McpTransport::Stdio { stdin, reader, .. } => {
                let payload = serde_json::to_string(&req)? + "\n";
                stdin.write_all(payload.as_bytes()).await?;
                stdin.flush().await?;

                let target_id = Value::Number(id.into());
                let mut line = String::new();
                loop {
                    line.clear();
                    let bytes_read = reader.read_line(&mut line).await?;
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
                }
            }
            McpTransport::Http { url, headers, client }
            | McpTransport::Sse { post_url: url, headers, client, .. } => {
                let mut builder = client.post(url.as_str()).json(&req);
                for (k, v) in headers {
                    builder = builder.header(k.as_str(), v.as_str());
                }

                let resp = builder.send().await?;
                if !resp.status().is_success() {
                    anyhow::bail!("MCP HTTP error status: {}", resp.status());
                }

                let rpc_res: JsonRpcResponse = resp.json().await?;
                if let Some(err) = rpc_res.error {
                    anyhow::bail!("MCP JSON-RPC Error [code {}]: {}", err.code, err.message);
                }

                Ok(rpc_res.result.unwrap_or(Value::Null))
            }
        }
    }

    /// Performs the MCP initialization handshake.
    pub async fn initialize(
        &mut self,
        client_name: &str,
        client_version: &str,
    ) -> Result<InitializeResult> {
        let params = json!({
            "protocolVersion": DEFAULT_MCP_PROTOCOL_VERSION,
            "capabilities": {
                "roots": { "listChanged": true },
                "sampling": {}
            },
            "clientInfo": {
                "name": client_name,
                "version": client_version
            }
        });

        let res = self.send_request("initialize", Some(params)).await?;
        let init_result: InitializeResult = serde_json::from_value(res)?;
        Ok(init_result)
    }

    /// Queries the MCP server for its list of available tools.
    pub async fn list_tools(&mut self) -> Result<Vec<McpTool>> {
        let res = self.send_request("tools/list", None).await?;
        let tools_list: ListToolsResult = serde_json::from_value(res)?;
        Ok(tools_list.tools)
    }

    /// Invokes a specific tool on the MCP server.
    pub async fn call_tool(
        &mut self,
        name: &str,
        arguments: Option<HashMap<String, Value>>,
    ) -> Result<CallToolResult> {
        let params = json!({
            "name": name,
            "arguments": arguments.unwrap_or_default()
        });

        let res = self.send_request("tools/call", Some(params)).await?;
        let call_result: CallToolResult = serde_json::from_value(res)?;
        Ok(call_result)
    }
}

/// Dynamic wrapper bridging remote MCP tools into SuperAgent's internal `Tool` trait.
pub struct McpToolWrapper {
    client: Arc<Mutex<McpClient>>,
    info: McpTool,
}

impl McpToolWrapper {
    pub fn new(client: Arc<Mutex<McpClient>>, info: McpTool) -> Self {
        Self { client, info }
    }
}

#[async_trait]
impl Tool for McpToolWrapper {
    fn name(&self) -> &str {
        &self.info.name
    }

    fn description(&self) -> &str {
        self.info.description.as_deref().unwrap_or("MCP external tool")
    }

    fn parameters_schema(&self) -> Value {
        self.info.input_schema.clone()
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let args = if let Value::Object(map) = input {
            Some(map.into_iter().collect())
        } else {
            None
        };

        let result = {
            let mut client = self.client.lock().await;
            client.call_tool(&self.info.name, args).await?
        };

        let mut output = String::new();
        for content in result.content {
            if let Some(text) = content.text {
                output.push_str(&text);
                output.push('\n');
            } else if let Some(mime) = content.mime_type {
                output.push_str(&format!("[Media: {}]\n", mime));
            } else {
                output.push_str(&format!("[Content: {}]\n", content.r#type));
            }
        }

        if result.is_error.unwrap_or(false) {
            anyhow::bail!("MCP tool '{}' returned error: {}", self.info.name, output.trim());
        }

        Ok(output.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_client_creation_http_and_sse() {
        let http_client = McpClient::connect_http("http://localhost:8080/mcp", None);
        assert_eq!(http_client.request_id.load(Ordering::SeqCst), 1);

        let mut headers = HashMap::new();
        headers.insert("Authorization".to_string(), "Bearer token".to_string());
        let sse_client = McpClient::connect_sse("http://localhost:8080/sse", None, Some(headers));
        assert_eq!(sse_client.request_id.load(Ordering::SeqCst), 1);
    }
}
