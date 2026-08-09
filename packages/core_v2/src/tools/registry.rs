use std::collections::HashMap;
use std::sync::Arc;
use anyhow::{anyhow, Result};
use serde_json::Value;

use crate::tools::r#trait::Tool;

/// Registry managing all available tools.
#[derive(Default, Clone)]
pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn Tool + Send + Sync>>,
}

impl ToolRegistry {
    /// Creates a new empty `ToolRegistry`.
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    /// Registers a new tool instance into the registry.
    pub fn register<T: Tool + 'static>(&mut self, tool: T) {
        self.tools.insert(tool.name().to_string(), Arc::new(tool));
    }

    /// Registers a reference-counted tool into the registry.
    pub fn register_arc(&mut self, tool: Arc<dyn Tool + Send + Sync>) {
        self.tools.insert(tool.name().to_string(), tool);
    }

    /// Retrieves a registered tool by name.
    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool + Send + Sync>> {
        self.tools.get(name).cloned()
    }

    /// Lists parameter schemas for all registered tools formatted as JSON objects.
    pub fn list_schemas(&self) -> Vec<Value> {
        self.tools
            .values()
            .map(|t| {
                serde_json::json!({
                    "name": t.name(),
                    "description": t.description(),
                    "parameters": t.parameters_schema(),
                })
            })
            .collect()
    }

    /// Executes a tool registered under `name` with the provided `input` JSON value.
    pub async fn execute_tool(&self, name: &str, input: Value) -> Result<String> {
        let tool = self
            .get(name)
            .ok_or_else(|| anyhow!("Tool '{}' not found in registry", name))?;
        tool.execute(input).await
    }
}
