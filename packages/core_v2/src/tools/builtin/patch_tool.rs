use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::Value;
use std::path::PathBuf;

use crate::tools::builtin::file_ops::validate_path_in_workspace;
use crate::tools::r#trait::Tool;

/// Tool for generating unified diff patches between file versions.
pub struct PatchTool {
    workspace_root: PathBuf,
}

impl PatchTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }

    /// Computes a unified diff between two text strings.
    pub fn generate_unified_diff(file_path: &str, old_text: &str, new_text: &str) -> String {
        let old_lines: Vec<&str> = old_text.lines().collect();
        let new_lines: Vec<&str> = new_text.lines().collect();

        if old_lines == new_lines {
            return format!(
                "--- a/{}\n+++ b/{}\n# No changes detected\n",
                file_path, file_path
            );
        }

        let lcs = compute_lcs(&old_lines, &new_lines);
        let mut diff_lines = Vec::new();
        let mut old_idx = 0;
        let mut new_idx = 0;

        for &(match_old, match_new) in &lcs {
            while old_idx < match_old {
                diff_lines.push(format!("-{}", old_lines[old_idx]));
                old_idx += 1;
            }
            while new_idx < match_new {
                diff_lines.push(format!("+{}", new_lines[new_idx]));
                new_idx += 1;
            }
            diff_lines.push(format!(" {}", old_lines[old_idx]));
            old_idx += 1;
            new_idx += 1;
        }

        while old_idx < old_lines.len() {
            diff_lines.push(format!("-{}", old_lines[old_idx]));
            old_idx += 1;
        }
        while new_idx < new_lines.len() {
            diff_lines.push(format!("+{}", new_lines[new_idx]));
            new_idx += 1;
        }

        let mut output = String::new();
        output.push_str(&format!("--- a/{}\n", file_path));
        output.push_str(&format!("+++ b/{}\n", file_path));
        output.push_str(&format!(
            "@@ -1,{} +1,{} @@\n",
            old_lines.len().max(1),
            new_lines.len().max(1)
        ));
        for line in diff_lines {
            output.push_str(&line);
            output.push('\n');
        }
        output
    }
}

/// Computes the Longest Common Subsequence indices for line-based diffing.
fn compute_lcs<T: PartialEq>(a: &[T], b: &[T]) -> Vec<(usize, usize)> {
    let m = a.len();
    let n = b.len();
    if m == 0 || n == 0 {
        return Vec::new();
    }

    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for i in 0..m {
        for j in 0..n {
            if a[i] == b[j] {
                dp[i + 1][j + 1] = dp[i][j] + 1;
            } else {
                dp[i + 1][j + 1] = dp[i + 1][j].max(dp[i][j + 1]);
            }
        }
    }

    let mut result = Vec::new();
    let mut i = m;
    let mut j = n;
    while i > 0 && j > 0 {
        if a[i - 1] == b[j - 1] {
            result.push((i - 1, j - 1));
            i -= 1;
            j -= 1;
        } else if dp[i - 1][j] >= dp[i][j - 1] {
            i -= 1;
        } else {
            j -= 1;
        }
    }
    result.reverse();
    result
}

#[async_trait]
impl Tool for PatchTool {
    fn name(&self) -> &str {
        "patch"
    }

    fn description(&self) -> &str {
        "Generate a unified diff patch between the current file and proposed modifications, or inspect git diff."
    }

    fn parameters_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the target file to diff relative to workspace"
                },
                "content": {
                    "type": "string",
                    "description": "Optional proposed new content to compare against the current file. If omitted, runs git diff."
                }
            },
            "required": ["path"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let path_str = input
            .get("path")
            .or_else(|| input.get("file_path"))
            .or_else(|| input.get("filePath"))
            .or_else(|| input.get("TargetFile"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'path' parameter for patch tool"))?;

        let full_path = validate_path_in_workspace(path_str, &self.workspace_root)?;

        if let Some(new_content) = input.get("content").and_then(|c| c.as_str()) {
            let old_content = if full_path.exists() {
                tokio::fs::read_to_string(&full_path)
                    .await
                    .unwrap_or_default()
            } else {
                String::new()
            };
            return Ok(Self::generate_unified_diff(
                path_str,
                &old_content,
                new_content,
            ));
        }

        // Fallback: run git diff on path if git is available
        let rel_path = full_path
            .strip_prefix(&self.workspace_root)
            .unwrap_or(&full_path)
            .to_string_lossy();

        let output = tokio::process::Command::new("git")
            .current_dir(&self.workspace_root)
            .args(["diff", "--", &rel_path])
            .output()
            .await;

        match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                if stdout.trim().is_empty() {
                    Ok(format!(
                        "--- a/{}\n+++ b/{}\n# No uncommitted changes detected\n",
                        rel_path, rel_path
                    ))
                } else {
                    Ok(stdout)
                }
            }
            _ => {
                if full_path.exists() {
                    let content = tokio::fs::read_to_string(&full_path)
                        .await
                        .unwrap_or_default();
                    Ok(Self::generate_unified_diff(path_str, &content, &content))
                } else {
                    Err(anyhow!("File does not exist: {}", path_str))
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unified_diff_generation() {
        let old_text = "fn main() {\n    println!(\"hello\");\n}\n";
        let new_text = "fn main() {\n    println!(\"hello world\");\n}\n";
        let diff = PatchTool::generate_unified_diff("main.rs", old_text, new_text);

        assert!(diff.contains("--- a/main.rs"));
        assert!(diff.contains("+++ b/main.rs"));
        assert!(diff.contains("-    println!(\"hello\");"));
        assert!(diff.contains("+    println!(\"hello world\");"));
    }

    #[test]
    fn test_unified_diff_identical() {
        let text = "alpha\nbeta\n";
        let diff = PatchTool::generate_unified_diff("test.txt", text, text);
        assert!(diff.contains("# No changes detected"));
    }
}
