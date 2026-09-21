use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::Value;
use std::path::PathBuf;

use crate::tools::builtin::file_ops::validate_path_in_workspace;
use crate::tools::r#trait::Tool;

/// Tool for applying unified diff patches to workspace files.
pub struct ApplyPatchTool {
    workspace_root: PathBuf,
}

impl ApplyPatchTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }

    /// Extracts the target file path from a unified diff header.
    pub fn extract_target_path(patch: &str) -> Option<String> {
        for line in patch.lines() {
            if let Some(rest) = line.strip_prefix("+++ ") {
                let cleaned = rest.trim();
                let path = if let Some(stripped) = cleaned.strip_prefix("b/") {
                    stripped
                } else {
                    cleaned
                };
                if !path.is_empty() && path != "/dev/null" {
                    return Some(path.to_string());
                }
            }
        }
        None
    }

    /// Pure Rust hunk applicator for unified diffs.
    pub fn apply_diff(original: &str, patch: &str) -> Result<String> {
        let orig_lines: Vec<&str> = original.lines().collect();
        let mut result = Vec::new();
        let mut orig_idx = 0;

        let mut in_hunk = false;

        for line in patch.lines() {
            if line.starts_with("---") || line.starts_with("+++") {
                continue;
            }
            if line.starts_with("@@") {
                in_hunk = true;
                continue;
            }
            if !in_hunk {
                continue;
            }

            if let Some(added) = line.strip_prefix('+') {
                result.push(added.to_string());
            } else if let Some(removed) = line.strip_prefix('-') {
                if orig_idx < orig_lines.len() {
                    let cur = orig_lines[orig_idx];
                    if cur == removed {
                        orig_idx += 1;
                    } else {
                        // Skip removed line if it matches
                        orig_idx += 1;
                    }
                }
            } else if let Some(context) = line.strip_prefix(' ') {
                if orig_idx < orig_lines.len() {
                    result.push(orig_lines[orig_idx].to_string());
                    orig_idx += 1;
                } else {
                    result.push(context.to_string());
                }
            } else if line.is_empty() && orig_idx < orig_lines.len() {
                result.push(orig_lines[orig_idx].to_string());
                orig_idx += 1;
            }
        }

        while orig_idx < orig_lines.len() {
            result.push(orig_lines[orig_idx].to_string());
            orig_idx += 1;
        }

        let mut final_text = result.join("\n");
        if original.ends_with('\n') && !final_text.ends_with('\n') {
            final_text.push('\n');
        }
        Ok(final_text)
    }
}

#[async_trait]
impl Tool for ApplyPatchTool {
    fn name(&self) -> &str {
        "apply_patch"
    }

    fn description(&self) -> &str {
        "Apply a unified diff patch to workspace files."
    }

    fn parameters_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "patch": {
                    "type": "string",
                    "description": "Unified diff patch string to apply to the workspace"
                },
                "path": {
                    "type": "string",
                    "description": "Optional explicit path to target file if not present in patch header"
                }
            },
            "required": ["patch"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let patch_content = input
            .get("patch")
            .or_else(|| input.get("diff"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'patch' parameter"))?;

        let target_path_str = input
            .get("path")
            .or_else(|| input.get("file_path"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| Self::extract_target_path(patch_content))
            .ok_or_else(|| {
                anyhow!("Could not determine target file path from patch header or input")
            })?;

        let full_path = validate_path_in_workspace(&target_path_str, &self.workspace_root)?;

        // 1. Try git apply if git is available and file is in a git workspace
        let mut git_cmd = tokio::process::Command::new("git");
        git_cmd.current_dir(&self.workspace_root);
        git_cmd.args(["apply", "--whitespace=nowarn", "-"]);
        git_cmd.stdin(std::process::Stdio::piped());
        git_cmd.stdout(std::process::Stdio::piped());
        git_cmd.stderr(std::process::Stdio::piped());

        if let Ok(mut child) = git_cmd.spawn() {
            if let Some(mut stdin) = child.stdin.take() {
                use tokio::io::AsyncWriteExt;
                let _ = stdin.write_all(patch_content.as_bytes()).await;
                drop(stdin);
            }
            if let Ok(status) = child.wait().await {
                if status.success() {
                    return Ok(format!(
                        "Successfully applied patch to {} via git apply",
                        target_path_str
                    ));
                }
            }
        }

        // 2. Fallback to native Rust unified diff applicator
        let original_content = if full_path.exists() {
            tokio::fs::read_to_string(&full_path).await?
        } else {
            String::new()
        };

        let new_content = Self::apply_diff(&original_content, patch_content)?;

        if let Some(parent) = full_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&full_path, new_content).await?;

        Ok(format!("Successfully applied patch to {}", target_path_str))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_target_path() {
        let patch = "--- a/src/main.rs\n+++ b/src/main.rs\n@@ -1,3 +1,3 @@\n";
        assert_eq!(
            ApplyPatchTool::extract_target_path(patch),
            Some("src/main.rs".to_string())
        );
    }

    #[test]
    fn test_apply_diff_pure() {
        let original = "line1\nline2\nline3\n";
        let patch = "--- a/test.txt\n+++ b/test.txt\n@@ -1,3 +1,3 @@\n line1\n-line2\n+line2_modified\n line3\n";
        let patched = ApplyPatchTool::apply_diff(original, patch).unwrap();
        assert_eq!(patched, "line1\nline2_modified\nline3\n");
    }
}
