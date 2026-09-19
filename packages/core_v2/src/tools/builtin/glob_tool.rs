use std::path::PathBuf;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use walkdir::WalkDir;

use crate::tools::builtin::file_ops::validate_path_in_workspace;
use crate::tools::r#trait::Tool;

/// Tool for finding files matching a glob pattern or wildcard across the workspace.
#[derive(Clone)]
pub struct GlobTool {
    workspace_root: PathBuf,
}

impl GlobTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }
}

#[async_trait]
impl Tool for GlobTool {
    fn name(&self) -> &str {
        "glob"
    }

    fn description(&self) -> &str {
        "Finds files and directories matching a glob pattern or filename wildcard across the workspace."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to search for (e.g. '**/*.rs', 'src/**/*.tsx', '*.json')"
                },
                "Pattern": {
                    "type": "string",
                    "description": "Alternative key for glob pattern"
                },
                "path": {
                    "type": "string",
                    "description": "Subdirectory to search within (optional, defaults to workspace root)"
                },
                "SearchDirectory": {
                    "type": "string",
                    "description": "Alternative key for search directory"
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of file matches to return (default: 100)"
                }
            },
            "required": ["pattern"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let pattern_raw = input
            .get("pattern")
            .or_else(|| input.get("Pattern"))
            .or_else(|| input.get("glob"))
            .or_else(|| input.get("query"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required string parameter 'pattern'"))?;

        let search_path_raw = input
            .get("path")
            .or_else(|| input.get("SearchDirectory"))
            .or_else(|| input.get("dir"))
            .and_then(|v| v.as_str())
            .unwrap_or(".");

        let max_results = input
            .get("max_results")
            .and_then(|v| v.as_u64())
            .unwrap_or(100) as usize;

        let safe_base = validate_path_in_workspace(search_path_raw, &self.workspace_root)?;
        let clean_pattern = pattern_raw.trim();

        // Convert simple glob pattern to regex
        let regex = glob_to_regex(clean_pattern)?;

        let mut matches = Vec::new();
        let ws_root = self.workspace_root.clone();

        for entry in WalkDir::new(&safe_base)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                // Prune massive dependency / cache folders unless explicitly asked
                if e.file_type().is_dir() {
                    if name == ".git" || name == "target" || name == "node_modules" {
                        return clean_pattern.contains(name.as_ref());
                    }
                }
                true
            })
            .filter_map(|e| e.ok())
        {
            if matches.len() >= max_results {
                break;
            }

            let path = entry.path();
            let rel_path = path.strip_prefix(&ws_root).unwrap_or(path);
            let rel_str = rel_path.to_string_lossy().replace('\\', "/");
            let file_name = path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default();

            if regex.is_match(&rel_str) || regex.is_match(&file_name) {
                matches.push(rel_str);
            }
        }

        if matches.is_empty() {
            Ok(format!("No files found matching pattern '{}' in '{}'", clean_pattern, search_path_raw))
        } else {
            let count = matches.len();
            let mut out = format!("Found {} file(s) matching '{}':\n\n", count, clean_pattern);
            for m in matches {
                out.push_str(&format!("- `{}`\n", m));
            }
            if count >= max_results {
                out.push_str(&format!("\n*(Results capped at {} matches)*", max_results));
            }
            Ok(out)
        }
    }
}

fn glob_to_regex(glob: &str) -> Result<regex::Regex> {
    let mut regex_str = String::from("^");
    let chars: Vec<char> = glob.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        match chars[i] {
            '*' => {
                if i + 1 < chars.len() && chars[i + 1] == '*' {
                    // Match `**` (recursive directories)
                    if i + 2 < chars.len() && (chars[i + 2] == '/' || chars[i + 2] == '\\') {
                        regex_str.push_str("(?:.*/)?");
                        i += 3;
                        continue;
                    } else {
                        regex_str.push_str(".*");
                        i += 2;
                        continue;
                    }
                } else {
                    // Single wildcard `*`
                    regex_str.push_str("[^/]*");
                    i += 1;
                    continue;
                }
            }
            '?' => {
                regex_str.push_str("[^/]");
            }
            '.' | '(' | ')' | '+' | '|' | '^' | '$' | '@' | '%' => {
                regex_str.push('\\');
                regex_str.push(chars[i]);
            }
            '\\' | '/' => {
                regex_str.push('/');
            }
            c => {
                regex_str.push(c);
            }
        }
        i += 1;
    }

    regex_str.push('$');
    regex::RegexBuilder::new(&regex_str)
        .case_insensitive(true)
        .build()
        .map_err(|e| anyhow!("Invalid glob expression '{}': {}", glob, e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_glob_tool_matching() {
        let temp_dir = std::env::temp_dir().join(format!("test_glob_{}", rand::random::<u32>()));
        let sub_dir = temp_dir.join("src").join("models");
        tokio::fs::create_dir_all(&sub_dir).await.unwrap();

        tokio::fs::write(temp_dir.join("Cargo.toml"), "[package]").await.unwrap();
        tokio::fs::write(sub_dir.join("user.rs"), "struct User;").await.unwrap();
        tokio::fs::write(sub_dir.join("post.rs"), "struct Post;").await.unwrap();
        tokio::fs::write(sub_dir.join("readme.md"), "# Readme").await.unwrap();

        let tool = GlobTool::new(temp_dir.clone());

        // Match *.rs
        let rs_res = tool.execute(json!({ "pattern": "**/*.rs" })).await.unwrap();
        assert!(rs_res.contains("src/models/user.rs") || rs_res.contains("src\\models\\user.rs"));
        assert!(rs_res.contains("src/models/post.rs") || rs_res.contains("src\\models\\post.rs"));
        assert!(!rs_res.contains("readme.md"));

        // Clean up
        let _ = tokio::fs::remove_dir_all(temp_dir).await;
    }
}
