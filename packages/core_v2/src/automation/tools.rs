use std::path::PathBuf;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};

use crate::automation::browser::HeadlessBrowserEngine;
use crate::automation::search::WebSearchEngine;
use crate::tools::builtin::file_ops::validate_path_in_workspace;
use crate::tools::r#trait::Tool;

pub struct BrowserNavigateTool {
    engine: HeadlessBrowserEngine,
}

impl BrowserNavigateTool {
    pub fn new() -> Self {
        Self {
            engine: HeadlessBrowserEngine::new(),
        }
    }
}

impl Default for BrowserNavigateTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for BrowserNavigateTool {
    fn name(&self) -> &str {
        "browser_navigate"
    }

    fn description(&self) -> &str {
        "Navigates to a webpage URL, extracts clean textual content and page title."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "url": { "type": "string", "description": "Target webpage URL (e.g. https://example.com)" }
            },
            "required": ["url"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let url = input["url"].as_str().ok_or_else(|| anyhow!("Missing url parameter"))?;
        let page = self.engine.fetch_page_content(url).await?;
        Ok(format!(
            "Title: {}\nURL: {}\nStatus: {}\n\nContent:\n{}",
            page.title, page.url, page.status, page.content
        ))
    }
}

pub struct BrowserScreenshotTool {
    engine: HeadlessBrowserEngine,
    workspace_root: PathBuf,
}

impl BrowserScreenshotTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            engine: HeadlessBrowserEngine::new(),
            workspace_root,
        }
    }
}

#[async_trait]
impl Tool for BrowserScreenshotTool {
    fn name(&self) -> &str {
        "browser_screenshot"
    }

    fn description(&self) -> &str {
        "Captures a rendered preview artifact of a webpage and saves it to a workspace path."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "url": { "type": "string", "description": "Target webpage URL" },
                "output_path": { "type": "string", "description": "Relative file path to save preview" }
            },
            "required": ["url", "output_path"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let url = input["url"].as_str().ok_or_else(|| anyhow!("Missing url"))?;
        let out_str = input["output_path"].as_str().ok_or_else(|| anyhow!("Missing output_path"))?;
        let safe_out = validate_path_in_workspace(out_str, &self.workspace_root)?;

        let saved = self.engine.capture_page_preview(url, &safe_out).await?;
        Ok(format!("Saved webpage preview to '{}'", saved.display()))
    }
}

pub struct WebSearchTool {
    engine: WebSearchEngine,
}

impl WebSearchTool {
    pub fn new() -> Self {
        Self {
            engine: WebSearchEngine::new(),
        }
    }
}

impl Default for WebSearchTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "Performs a web search for a given query and returns top matching results and summaries."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": { "type": "string", "description": "The search query term" },
                "max_results": { "type": "integer", "description": "Max results to return (default: 5)" }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let query = input["query"].as_str().ok_or_else(|| anyhow!("Missing query parameter"))?;
        let max_results = input["max_results"].as_u64().unwrap_or(5) as usize;

        let results = self.engine.search(query, max_results).await?;
        serde_json::to_string_pretty(&results).map_err(|e| anyhow!("Failed to serialize search results: {}", e))
    }
}
