use std::collections::HashMap;
use std::sync::Arc;
use anyhow::{anyhow, Result};
use tokio::sync::Mutex;

use crate::mcp::McpClient;
use crate::tools::ToolRegistry;

pub const DEFAULT_COMPOSIO_MCP_URL: &str = "https://backend.composio.dev/v1/mcp";

pub struct ComposioBridge {
    api_key: String,
    endpoint_url: String,
    mcp_client: Option<Arc<Mutex<McpClient>>>,
}

impl ComposioBridge {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            endpoint_url: DEFAULT_COMPOSIO_MCP_URL.to_string(),
            mcp_client: None,
        }
    }

    pub fn with_endpoint(mut self, url: impl Into<String>) -> Self {
        self.endpoint_url = url.into();
        self
    }

    /// Initializes connection to Composio MCP endpoint with authenticated API key headers.
    pub async fn connect(&mut self) -> Result<()> {
        if self.api_key.is_empty() {
            return Err(anyhow!("Composio API key cannot be empty"));
        }

        let mut headers = HashMap::new();
        headers.insert("x-api-key".to_string(), self.api_key.clone());
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        let client = McpClient::connect_http(&self.endpoint_url, Some(headers));
        self.mcp_client = Some(Arc::new(Mutex::new(client)));
        Ok(())
    }

    /// Pulls all available authenticated SaaS tools from Composio and registers them into the ToolRegistry.
    pub async fn register_tools_into(&self, registry: &mut ToolRegistry) -> Result<usize> {
        let client_mutex = self
            .mcp_client
            .as_ref()
            .ok_or_else(|| anyhow!("Composio bridge is not connected. Call connect() first."))?;

        let tools = {
            let mut client = client_mutex.lock().await;
            client.list_tools().await?
        };

        let count = tools.len();
        for tool_info in tools {
            let wrapper = crate::mcp::McpToolWrapper::new(client_mutex.clone(), tool_info);
            registry.register_arc(Arc::new(wrapper));
        }

        Ok(count)
    }
}
