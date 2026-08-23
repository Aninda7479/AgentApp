use std::path::PathBuf;
use anyhow::{anyhow, Result};
use async_trait::async_trait;

use serde_json::{json, Value};
use walkdir::WalkDir;

use crate::tools::builtin::file_ops::validate_path_in_workspace;
use crate::tools::r#trait::Tool;

/// Tool for listing files and directories inside a workspace path.
pub struct ListDirTool {
    workspace_root: PathBuf,
}

impl ListDirTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }
}

#[async_trait]
impl Tool for ListDirTool {
    fn name(&self) -> &str {
        "list_dir"
    }

    fn description(&self) -> &str {
        "Lists files and directories in a given workspace directory. Supports recursive search and depth limit."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory path relative to workspace root (defaults to workspace root)"
                },
                "max_depth": {
                    "type": "integer",
                    "description": "Maximum depth for directory traversal (default: 1)"
                },
                "show_hidden": {
                    "type": "boolean",
                    "description": "Whether to include hidden files (default: false)"
                }
            }
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let path_str = input["path"].as_str().unwrap_or(".");
        let max_depth = input["max_depth"].as_u64().unwrap_or(1) as usize;
        let show_hidden = input["show_hidden"].as_bool().unwrap_or(false);

        let safe_path = validate_path_in_workspace(path_str, &self.workspace_root)?;

        if !safe_path.is_dir() {
            anyhow::bail!("Path '{}' is not a directory", safe_path.display());
        }

        let mut results = Vec::new();
        let walker = WalkDir::new(&safe_path)
            .max_depth(max_depth)
            .into_iter()
            .filter_entry(|e| {
                if !show_hidden {
                    let file_name = e.file_name().to_string_lossy();
                    if file_name.starts_with('.') && file_name != "." {
                        return false;
                    }
                }
                true
            });

        for entry in walker.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path == safe_path {
                continue;
            }

            let rel_path = path
                .strip_prefix(&self.workspace_root)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();

            let is_dir = entry.file_type().is_dir();
            let size = if is_dir {
                0
            } else {
                entry.metadata().map(|m| m.len()).unwrap_or(0)
            };

            results.push(json!({
                "path": rel_path,
                "is_dir": is_dir,
                "size_bytes": size,
            }));
        }

        serde_json::to_string_pretty(&results).map_err(|e| anyhow!("Failed to serialize list: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[tokio::test]
    async fn test_list_dir_tool_basic() {
        let temp_dir = std::env::temp_dir().join(format!("test_listdir_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(temp_dir.join("subdir"));
        fs::write(temp_dir.join("file1.txt"), "hello").unwrap();
        fs::write(temp_dir.join("subdir").join("file2.txt"), "world").unwrap();

        let tool = ListDirTool::new(temp_dir.clone());
        let res = tool
            .execute(json!({
                "path": ".",
                "max_depth": 2
            }))
            .await
            .unwrap();

        let parsed: Value = serde_json::from_str(&res).unwrap();
        assert!(parsed.as_array().unwrap().len() >= 2);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}

