use std::path::{Path, PathBuf};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};

use crate::tools::r#trait::Tool;

/// Strips extended-length Windows UNC prefix (`\\?\`) if present.
fn strip_unc_prefix(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

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

    let clean_root = strip_unc_prefix(&canonical_root);
    let clean_target = strip_unc_prefix(&canonical_target);

    if !clean_target.starts_with(&clean_root) {
        anyhow::bail!(
            "Security Error: Access to path '{}' outside workspace root '{}' is forbidden",
            path_str,
            workspace_root.display()
        );
    }

    Ok(clean_target)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_strip_unc_prefix() {
        let p = PathBuf::from(r"\\?\C:\Users\test\workspace");
        let stripped = strip_unc_prefix(&p);
        assert_eq!(stripped, PathBuf::from(r"C:\Users\test\workspace"));

        let normal = PathBuf::from(r"C:\Users\test\workspace");
        assert_eq!(strip_unc_prefix(&normal), normal);
    }

    #[test]
    fn test_validate_path_inside_workspace() {
        let temp_dir = std::env::temp_dir().join(format!("sa_test_ws_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let canonical_ws = strip_unc_prefix(&temp_dir.canonicalize().unwrap());

        // Safe relative path to non-existing file
        let res = validate_path_in_workspace("hello.txt", &canonical_ws);
        assert!(res.is_ok(), "Expected safe relative path to succeed: {:?}", res);
        let p = res.unwrap();
        assert!(p.starts_with(&canonical_ws));
        assert_eq!(p.file_name().unwrap(), "hello.txt");

        // Safe relative path in subdirectory
        let sub = canonical_ws.join("subdir");
        fs::create_dir_all(&sub).unwrap();
        let res = validate_path_in_workspace("subdir/nested.txt", &canonical_ws);
        assert!(res.is_ok(), "Expected nested relative path to succeed: {:?}", res);
        assert!(res.unwrap().starts_with(&canonical_ws));

        // Safe existing file
        let existing = canonical_ws.join("existing.txt");
        fs::write(&existing, "hello").unwrap();
        let res = validate_path_in_workspace("existing.txt", &canonical_ws);
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), strip_unc_prefix(&existing.canonicalize().unwrap()));

        // Safe with current dir dot
        let res = validate_path_in_workspace("./subdir/nested.txt", &canonical_ws);
        assert!(res.is_ok());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_validate_path_traversal_prevention() {
        let temp_dir = std::env::temp_dir().join(format!("sa_test_ws_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let canonical_ws = temp_dir.canonicalize().unwrap();

        // Traversal escaping root: ../outside.txt
        let res = validate_path_in_workspace("../outside.txt", &canonical_ws);
        assert!(res.is_err(), "Expected ../outside.txt to be rejected");
        let err = res.unwrap_err().to_string();
        assert!(err.contains("Security Error") || err.contains("outside workspace root"));

        // Deep traversal escaping root: ../../etc/passwd
        let res = validate_path_in_workspace("../../etc/passwd", &canonical_ws);
        assert!(res.is_err(), "Expected ../../etc/passwd to be rejected");

        // Subdir traversal escaping root: subdir/../../secret
        let res = validate_path_in_workspace("subdir/../../secret.txt", &canonical_ws);
        assert!(res.is_err(), "Expected subdir/../../secret.txt to be rejected");

        // Absolute path outside workspace
        let other_temp = std::env::temp_dir();
        if other_temp != canonical_ws {
            let outside_abs = other_temp.join("evil.txt");
            let res = validate_path_in_workspace(outside_abs.to_str().unwrap(), &canonical_ws);
            assert!(res.is_err(), "Expected outside absolute path to be rejected");
        }

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_reject_traversal_outside_workspace() {
        let temp_dir = std::env::temp_dir().join("superagent_test_ws_trav");
        let _ = std::fs::create_dir_all(&temp_dir);

        let invalid = validate_path_in_workspace("../../etc/shadow", &temp_dir);
        assert!(invalid.is_err());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

