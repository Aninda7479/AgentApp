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

    /// Normalizes tool names and resolves common tool aliases across OpenCode, Antigravity, and SuperAgent.
    pub fn normalize_tool_name(name: &str) -> &str {
        match name {
            "telegram_telegram" => "telegram",
            "bash" | "terminal" | "shell" => "run_command",
            "read" | "view_file" | "fetch_file" => "read_file",
            "write" | "write_to_file" => "write_file",
            "edit" | "replace_file_content" => "edit_file",
            "find_by_name" | "find_files" => "glob",
            "grep" => "grep_search",
            "websearch" | "search_web" => "web_search",
            "webfetch" | "read_url_content" => "browser_navigate",
            "task" | "invoke_subagent" => "run_subagent",
            "peek_tasks" | "manage_task" => "peek_task",
            "load_skill" | "list_skills" => "skill",
            "todowrite" | "checklist" => "todo",
            "plan_tool" | "roadmap" => "plan",
            "ask_question" => "question",
            "diff" | "git_diff" => "patch",
            "git_apply" => "apply_patch",
            "diagnostics" | "typecheck" => "lsp",
            "create_artifact" => "create_artifact_app",
            _ => name,
        }
    }

    /// Retrieves a registered tool by name, with fallback to normalized aliases.
    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool + Send + Sync>> {
        self.tools
            .get(name)
            .or_else(|| self.tools.get(Self::normalize_tool_name(name)))
            .or_else(|| {
                // Secondary fallbacks if specialized tools are not registered
                if name == "glob" || name == "find_by_name" {
                    self.tools.get("list_dir")
                } else {
                    None
                }
            })
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

        registry.register(DummyTool {
            name: "read_file".to_string(),
        });
        registry.register(DummyTool {
            name: "write_file".to_string(),
        });
        registry.register(DummyTool {
            name: "edit_file".to_string(),
        });
        registry.register(DummyTool {
            name: "web_search".to_string(),
        });
        registry.register(DummyTool {
            name: "run_subagent".to_string(),
        });
        registry.register(DummyTool {
            name: "skill".to_string(),
        });
        registry.register(DummyTool {
            name: "plan".to_string(),
        });
        registry.register(DummyTool {
            name: "todo".to_string(),
        });
        registry.register(DummyTool {
            name: "question".to_string(),
        });

        // Direct lookup
        assert!(registry.get("telegram").is_some());
        assert!(registry.get("run_command").is_some());
        assert!(registry.get("read_file").is_some());
        assert!(registry.get("question").is_some());

        // Alias lookup
        assert!(registry.get("telegram_telegram").is_some());
        assert!(registry.get("bash").is_some());
        assert!(registry.get("read").is_some());
        assert!(registry.get("view_file").is_some());
        assert!(registry.get("write").is_some());
        assert!(registry.get("write_to_file").is_some());
        assert!(registry.get("edit").is_some());
        assert!(registry.get("replace_file_content").is_some());
        assert!(registry.get("websearch").is_some());
        assert!(registry.get("search_web").is_some());
        assert!(registry.get("task").is_some());
        assert!(registry.get("invoke_subagent").is_some());
        assert!(registry.get("load_skill").is_some());
        assert!(registry.get("todowrite").is_some());
        assert!(registry.get("ask_question").is_some());

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

        let read_res = registry
            .execute_tool("read", serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(read_res, "executed:read_file");

        let view_res = registry
            .execute_tool("view_file", serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(view_res, "executed:read_file");
    }
}
