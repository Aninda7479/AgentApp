use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use regex::{Regex, RegexBuilder};
use serde_json::{json, Value};
use walkdir::WalkDir;

use crate::tools::builtin::file_ops::validate_path_in_workspace;
use crate::tools::r#trait::Tool;

/// Tool for searching text patterns in files using regex and directory walking.
pub struct GrepSearchTool {
    workspace_root: PathBuf,
}

impl GrepSearchTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }
}

#[async_trait]
impl Tool for GrepSearchTool {
    fn name(&self) -> &str {
        "grep_search"
    }

    fn description(&self) -> &str {
        "Searches for a text pattern or regex query across files in the workspace."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Text pattern or regular expression to search for"
                },
                "path": {
                    "type": "string",
                    "description": "Subdirectory or file path within workspace to search (defaults to workspace root)"
                },
                "is_regex": {
                    "type": "boolean",
                    "description": "Whether query should be parsed as a regular expression (default: false)"
                },
                "case_insensitive": {
                    "type": "boolean",
                    "description": "Perform case-insensitive match (default: false)"
                },
                "includes": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "File extensions to include, e.g. [\"rs\", \"ts\", \"json\"]"
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of matching lines to return (default: 100)"
                }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let query_str = input["query"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required string parameter 'query'"))?;

        let search_path_str = input["path"].as_str().unwrap_or(".");
        let is_regex = input["is_regex"].as_bool().unwrap_or(false);
        let case_insensitive = input["case_insensitive"].as_bool().unwrap_or(false);
        let max_results = input["max_results"].as_u64().unwrap_or(100) as usize;

        let includes: Option<Vec<String>> = input["includes"].as_array().map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.trim_start_matches('.').to_lowercase()))
                .collect()
        });

        let target_dir = validate_path_in_workspace(search_path_str, &self.workspace_root)?;
        let workspace_root = self.workspace_root.clone();
        let query_pattern = if is_regex {
            query_str.to_string()
        } else {
            regex::escape(query_str)
        };

        // Offload directory walking and regex matching to a blocking task
        tokio::task::spawn_blocking(move || {
            let re: Regex = RegexBuilder::new(&query_pattern)
                .case_insensitive(case_insensitive)
                .build()
                .map_err(|e| anyhow!("Invalid regex pattern '{}': {}", query_pattern, e))?;

            let mut results = Vec::new();
            let mut total_matches = 0;

            for entry in WalkDir::new(&target_dir)
                .into_iter()
                .filter_entry(|e| {
                    let file_name = e.file_name().to_string_lossy();
                    // Skip hidden dirs/files and common heavy directories
                    if file_name.starts_with('.') || file_name == "node_modules" || file_name == "target" || file_name == "vendor" {
                        return false;
                    }
                    true
                })
                .filter_map(|e| e.ok())
            {
                if total_matches >= max_results {
                    break;
                }

                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                // Check file extension includes
                if let Some(ref exts) = includes {
                    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                        if !exts.contains(&ext.to_lowercase()) {
                            continue;
                        }
                    } else {
                        continue;
                    }
                }

                let display_path = path
                    .strip_prefix(&workspace_root)
                    .unwrap_or(path)
                    .display()
                    .to_string();

                if let Ok(file) = File::open(path) {
                    let reader = BufReader::new(file);
                    for (line_num, line_res) in reader.lines().enumerate() {
                        if total_matches >= max_results {
                            break;
                        }
                        if let Ok(line) = line_res {
                            if re.is_match(&line) {
                                total_matches += 1;
                                results.push(format!("{}:{}: {}", display_path, line_num + 1, line));
                            }
                        }
                    }
                }
            }

            if results.is_empty() {
                Ok("No matches found.".to_string())
            } else {
                Ok(results.join("\n"))
            }
        })
        .await
        .map_err(|e| anyhow!("Grep search task panicked: {}", e))?
    }
}
