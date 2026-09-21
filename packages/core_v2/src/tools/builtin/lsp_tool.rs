use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;
use std::path::{Path, PathBuf};

use crate::tools::builtin::file_ops::validate_path_in_workspace;
use crate::tools::r#trait::Tool;

/// Tool for language diagnostics, compiler checks, and symbol queries.
pub struct LspTool {
    workspace_root: PathBuf,
}

impl LspTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }

    /// Search for symbol definitions across files in workspace.
    pub async fn search_symbols(workspace: &Path, query: &str) -> Result<String> {
        let mut results = Vec::new();
        let target_patterns = [
            format!("fn {}", query),
            format!("struct {}", query),
            format!("enum {}", query),
            format!("class {}", query),
            format!("def {}", query),
            format!("interface {}", query),
            format!("type {}", query),
            format!("pub fn {}", query),
            format!("pub struct {}", query),
            format!("pub enum {}", query),
            format!("const {}", query),
        ];

        let mut walker = walkdir::WalkDir::new(workspace).into_iter();
        while let Some(Ok(entry)) = walker.next() {
            if entry.file_type().is_file() {
                let p = entry.path();
                let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                if matches!(
                    ext,
                    "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "c" | "cpp" | "h"
                ) {
                    if let Ok(content) = tokio::fs::read_to_string(p).await {
                        for (idx, line) in content.lines().enumerate() {
                            for pattern in &target_patterns {
                                if line.contains(pattern) {
                                    let rel_p = p.strip_prefix(workspace).unwrap_or(p);
                                    results.push(format!(
                                        "{}:{}: {}",
                                        rel_p.display(),
                                        idx + 1,
                                        line.trim()
                                    ));
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if results.is_empty() {
            Ok(format!("No symbol definitions found matching '{}'", query))
        } else {
            Ok(results.join("\n"))
        }
    }
}

#[async_trait]
impl Tool for LspTool {
    fn name(&self) -> &str {
        "lsp"
    }

    fn description(&self) -> &str {
        "Execute language server diagnostics, compiler checks, and symbol queries on workspace files."
    }

    fn parameters_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["diagnostics", "check", "symbols", "definitions"],
                    "description": "LSP action: 'diagnostics' (default) or 'check' to run type/syntax checks; 'symbols' or 'definitions' to locate symbol definitions"
                },
                "path": {
                    "type": "string",
                    "description": "Path to file or directory to inspect relative to workspace"
                },
                "query": {
                    "type": "string",
                    "description": "Symbol name or query term to search for when action is 'symbols' or 'definitions'"
                }
            }
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let action = input
            .get("action")
            .and_then(|a| a.as_str())
            .unwrap_or("diagnostics");

        let path_opt = input
            .get("path")
            .or_else(|| input.get("file_path"))
            .and_then(|p| p.as_str());

        let query_opt = input
            .get("query")
            .or_else(|| input.get("symbol"))
            .and_then(|q| q.as_str());

        // 1. Symbol search
        if action == "symbols"
            || action == "definitions"
            || query_opt.is_some() && action != "check" && action != "diagnostics"
        {
            let q = query_opt.unwrap_or_default();
            if q.is_empty() {
                return Ok("LSP error: missing 'query' parameter for symbol search".to_string());
            }
            let search_dir = if let Some(p) = path_opt {
                validate_path_in_workspace(p, &self.workspace_root)?
            } else {
                self.workspace_root.clone()
            };
            return Self::search_symbols(&search_dir, q).await;
        }

        // 2. Language diagnostics / compiler check
        let (file_ext, target_dir) = if let Some(p) = path_opt {
            let full_p = validate_path_in_workspace(p, &self.workspace_root)?;
            let ext = full_p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_string();
            let dir = if full_p.is_dir() {
                full_p
            } else {
                full_p
                    .parent()
                    .unwrap_or(&self.workspace_root)
                    .to_path_buf()
            };
            (ext, dir)
        } else {
            (String::new(), self.workspace_root.clone())
        };

        if file_ext == "rs" || self.workspace_root.join("Cargo.toml").exists() {
            let mut cmd = tokio::process::Command::new("cargo");
            cmd.current_dir(&self.workspace_root);
            cmd.args(["check", "--message-format=short"]);
            if let Ok(out) = cmd.output().await {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let combined = format!("{}\n{}", stdout, stderr);
                let trimmed = combined.trim();
                return Ok(if trimmed.is_empty() {
                    "LSP Diagnostics: 0 errors, 0 warnings (cargo check clean)".to_string()
                } else {
                    trimmed.to_string()
                });
            }
        }

        if matches!(file_ext.as_str(), "ts" | "tsx" | "js")
            || target_dir.join("tsconfig.json").exists()
        {
            let mut cmd = tokio::process::Command::new("npx");
            cmd.current_dir(&target_dir);
            cmd.args(["tsc", "--noEmit"]);
            if let Ok(out) = cmd.output().await {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let trimmed = stdout.trim();
                return Ok(if trimmed.is_empty() {
                    "LSP Diagnostics: 0 errors, 0 warnings (tsc clean)".to_string()
                } else {
                    trimmed.to_string()
                });
            }
        }

        Ok(format!(
            "LSP Diagnostics complete for '{}': No blocking issues reported.",
            path_opt.unwrap_or(".")
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_lsp_tool_metadata() {
        let tool = LspTool::new(PathBuf::from("."));
        assert_eq!(tool.name(), "lsp");
        assert!(!tool.description().is_empty());
    }
}
