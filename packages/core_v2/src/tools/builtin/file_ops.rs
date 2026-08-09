use std::path::{Path, PathBuf};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};

use crate::tools::r#trait::Tool;

/// Helper function to validate that a target path is safely within the workspace root.
pub fn validate_path_in_workspace(path_str: &str, workspace_root: &Path) -> Result<PathBuf> {
    let target = Path::new(path_str);
    let full_path = if target.is_absolute() {
        target.to_path_buf()
    } else {
        workspace_root.join(target)
    };

    let canonical_root = workspace_root
        .canonicalize()
        .unwrap_or_else(|_| workspace_root.to_path_buf());

    // Resolve path components safely
    let canonical_target = if full_path.exists() {
        full_path.canonicalize()?
    } else {
        let parent = full_path
            .parent()
            .ok_or_else(|| anyhow!("Path has no parent directory: '{}'", path_str))?;

        if parent.exists() {
            let canonical_parent = parent.canonicalize()?;
            let file_name = full_path
                .file_name()
                .ok_or_else(|| anyhow!("Invalid file name in path: '{}'", path_str))?;
            canonical_parent.join(file_name)
        } else {
            // Normalize path manually without canonicalization
            let mut normalized = PathBuf::new();
            for comp in full_path.components() {
                match comp {
                    std::path::Component::ParentDir => {
                        normalized.pop();
                    }
                    std::path::Component::CurDir => {}
                    c => normalized.push(c),
                }
            }
            normalized
        }
    };

    if !canonical_target.starts_with(&canonical_root) {
        anyhow::bail!(
            "Security Error: Access to path '{}' outside workspace root '{}' is forbidden",
            path_str,
            workspace_root.display()
        );
    }

    Ok(canonical_target)
}

/// Tool for reading file contents safely within the workspace.
pub struct ReadFileTool {
    workspace_root: PathBuf,
}

impl ReadFileTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }
}

#[async_trait]
impl Tool for ReadFileTool {
    fn name(&self) -> &str {
        "read_file"
    }

    fn description(&self) -> &str {
        "Reads file contents from the workspace. Supports optional line range filtering."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to read (relative to workspace root or absolute within workspace)"
                },
                "start_line": {
                    "type": "integer",
                    "description": "1-based starting line number (optional)"
                },
                "end_line": {
                    "type": "integer",
                    "description": "1-based ending line number (optional)"
                }
            },
            "required": ["path"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let path_str = input["path"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required string parameter 'path'"))?;

        let safe_path = validate_path_in_workspace(path_str, &self.workspace_root)?;

        let content = tokio::fs::read_to_string(&safe_path)
            .await
            .map_err(|e| anyhow!("Failed to read file '{}': {}", safe_path.display(), e))?;

        let start_line = input["start_line"].as_u64().map(|n| n as usize);
        let end_line = input["end_line"].as_u64().map(|n| n as usize);

        if start_line.is_some() || end_line.is_some() {
            let lines: Vec<&str> = content.lines().collect();
            let start = start_line.unwrap_or(1).saturating_sub(1);
            let end = end_line.unwrap_or(lines.len()).min(lines.len());

            if start >= lines.len() || start >= end {
                return Ok(String::new());
            }

            let sliced = lines[start..end].join("\n");
            Ok(sliced)
        } else {
            Ok(content)
        }
    }
}

/// Tool for writing content to files safely within the workspace.
pub struct WriteFileTool {
    workspace_root: PathBuf,
}

impl WriteFileTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }
}

#[async_trait]
impl Tool for WriteFileTool {
    fn name(&self) -> &str {
        "write_file"
    }

    fn description(&self) -> &str {
        "Writes content to a file safely within the workspace. Creates parent directories automatically if needed."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to write (relative to workspace root or absolute within workspace)"
                },
                "content": {
                    "type": "string",
                    "description": "Content string to write to the file"
                },
                "create_dirs": {
                    "type": "boolean",
                    "description": "Whether to automatically create parent directories (default: true)"
                }
            },
            "required": ["path", "content"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let path_str = input["path"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required string parameter 'path'"))?;

        let content = input["content"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required string parameter 'content'"))?;

        let create_dirs = input["create_dirs"].as_bool().unwrap_or(true);

        let safe_path = validate_path_in_workspace(path_str, &self.workspace_root)?;

        if create_dirs {
            if let Some(parent) = safe_path.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| anyhow!("Failed to create parent directory '{}': {}", parent.display(), e))?;
            }
        }

        tokio::fs::write(&safe_path, content)
            .await
            .map_err(|e| anyhow!("Failed to write to file '{}': {}", safe_path.display(), e))?;

        Ok(format!(
            "Successfully wrote {} bytes to file '{}'",
            content.len(),
            safe_path.display()
        ))
    }
}
