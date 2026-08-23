use std::path::PathBuf;
use anyhow::{anyhow, Result};
use async_trait::async_trait;

use serde_json::{json, Value};

use crate::tools::builtin::file_ops::validate_path_in_workspace;
use crate::tools::r#trait::Tool;

/// Tool for replacing specific blocks or lines within an existing file.
pub struct EditFileTool {
    workspace_root: PathBuf,
}

impl EditFileTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }
}

#[async_trait]
impl Tool for EditFileTool {
    fn name(&self) -> &str {
        "edit_file"
    }

    fn description(&self) -> &str {
        "Replaces exact target content with replacement content in an existing file."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to edit (relative to workspace root or absolute within workspace)"
                },
                "target_content": {
                    "type": "string",
                    "description": "Exact text substring to be replaced"
                },
                "replacement_content": {
                    "type": "string",
                    "description": "New text to substitute in place of target_content"
                },
                "allow_multiple": {
                    "type": "boolean",
                    "description": "Whether to replace multiple occurrences if found (default: false)"
                }
            },
            "required": ["path", "target_content", "replacement_content"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let path_str = input["path"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required string parameter 'path'"))?;

        let target_content = input["target_content"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required string parameter 'target_content'"))?;

        let replacement_content = input["replacement_content"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required string parameter 'replacement_content'"))?;

        let allow_multiple = input["allow_multiple"].as_bool().unwrap_or(false);

        let safe_path = validate_path_in_workspace(path_str, &self.workspace_root)?;

        if !safe_path.exists() {
            anyhow::bail!("File does not exist: '{}'", safe_path.display());
        }

        let content = tokio::fs::read_to_string(&safe_path)
            .await
            .map_err(|e| anyhow!("Failed to read file '{}': {}", safe_path.display(), e))?;

        let count = content.matches(target_content).count();
        if count == 0 {
            anyhow::bail!(
                "Target content was not found in '{}'. Please make sure whitespace and characters match exactly.",
                safe_path.display()
            );
        }

        if count > 1 && !allow_multiple {
            anyhow::bail!(
                "Target content was found {} times in '{}'. Set 'allow_multiple: true' or provide more surrounding context to disambiguate.",
                count,
                safe_path.display()
            );
        }

        let new_content = if allow_multiple {
            content.replace(target_content, replacement_content)
        } else {
            content.replacen(target_content, replacement_content, 1)
        };

        tokio::fs::write(&safe_path, new_content)
            .await
            .map_err(|e| anyhow!("Failed to write updated file '{}': {}", safe_path.display(), e))?;

        Ok(format!(
            "Successfully replaced {} occurrence(s) in '{}'",
            if allow_multiple { count } else { 1 },
            safe_path.display()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[tokio::test]
    async fn test_edit_file_tool_basic() {
        let temp_dir = std::env::temp_dir().join(format!("test_edit_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);
        let file_path = temp_dir.join("sample.txt");
        fs::write(&file_path, "Line 1: Hello World\nLine 2: Target Text\nLine 3: Goodbye").unwrap();

        let tool = EditFileTool::new(temp_dir.clone());
        let res = tool
            .execute(json!({
                "path": "sample.txt",
                "target_content": "Target Text",
                "replacement_content": "Replaced Text"
            }))
            .await
            .unwrap();

        assert!(res.contains("Successfully replaced 1 occurrence"));
        let updated = fs::read_to_string(&file_path).unwrap();
        assert_eq!(updated, "Line 1: Hello World\nLine 2: Replaced Text\nLine 3: Goodbye");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}

