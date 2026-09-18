use anyhow::{anyhow, Result};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

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

    /// Normalizes tool names and resolves common tool aliases (e.g. `telegram_telegram` -> `telegram`, `bash` -> `run_command`).
    pub fn normalize_tool_name(name: &str) -> &str {
        match name {
            "telegram_telegram" => "telegram",
            "bash" => "run_command",
            _ => name,
        }
    }

    /// Retrieves a registered tool by name, with fallback to normalized aliases.
    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool + Send + Sync>> {
        self.tools
            .get(name)
            .or_else(|| self.tools.get(Self::normalize_tool_name(name)))
            .cloned()
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

    /// Executes a tool registered under `name` (or its alias) with the provided `input` JSON value.
    pub async fn execute_tool(&self, name: &str, input: Value) -> Result<String> {
        let tool = self
            .get(name)
            .ok_or_else(|| anyhow!("Tool '{}' not found in registry", name))?;
        tool.execute(input).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;

    struct DummyTool {
        name: String,
    }

    #[async_trait]
    impl Tool for DummyTool {
        fn name(&self) -> &str {
            &self.name
        }
        fn description(&self) -> &str {
            "dummy"
        }
        fn parameters_schema(&self) -> Value {
            serde_json::json!({})
        }
        async fn execute(&self, _input: Value) -> Result<String> {
            Ok(format!("executed:{}", self.name))
        }
    }

    #[tokio::test]
    async fn test_tool_registry_alias_resolution() {
        let mut registry = ToolRegistry::new();
        registry.register(DummyTool {
            name: "telegram".to_string(),
        });
        registry.register(DummyTool {
            name: "run_command".to_string(),
        });

        // Direct lookup
        assert!(registry.get("telegram").is_some());
        assert!(registry.get("run_command").is_some());

        // Alias lookup
        assert!(registry.get("telegram_telegram").is_some());
        assert!(registry.get("bash").is_some());

        // Execution via alias
        let tg_res = registry
            .execute_tool("telegram_telegram", serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(tg_res, "executed:telegram");

        let bash_res = registry
            .execute_tool("bash", serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(bash_res, "executed:run_command");
    }
}
