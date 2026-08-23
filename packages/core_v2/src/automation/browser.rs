use std::path::{Path, PathBuf};
use anyhow::Result;


use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageContentResult {
    pub url: String,
    pub title: String,
    pub status: u16,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct HeadlessBrowserEngine {
    client: reqwest::Client,
}

impl HeadlessBrowserEngine {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
                .timeout(std::time::Duration::from_secs(20))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    /// Navigates to a URL and extracts cleaned readable text content.
    pub async fn fetch_page_content(&self, url: &str) -> Result<PageContentResult> {
        let resp = self.client.get(url).send().await?;
        let status = resp.status().as_u16();
        let final_url = resp.url().to_string();
        let body = resp.text().await?;

        // Extract title
        let title = if let Some(start) = body.find("<title>") {
            if let Some(end) = body[start + 7..].find("</title>") {
                body[start + 7..start + 7 + end].trim().to_string()
            } else {
                "Untitled".to_string()
            }
        } else {
            "Untitled".to_string()
        };

        // Simple readable text extraction (strip scripts, styles, and tags)
        let cleaned = strip_html_tags(&body);

        Ok(PageContentResult {
            url: final_url,
            title,
            status,
            content: cleaned,
        })
    }

    /// Captures a mock / rendered visual screenshot artifact of the URL.
    pub async fn capture_page_preview(
        &self,
        url: &str,
        output_path: &Path,
    ) -> Result<PathBuf> {
        let page = self.fetch_page_content(url).await?;

        let preview_html = format!(
            "<!DOCTYPE html><html><head><title>Preview - {}</title><style>body{{font-family:sans-serif;padding:24px;background:#f8fafc;}}h1{{color:#0f172a;}}.url{{color:#64748b;font-size:14px;}}.content{{white-space:pre-wrap;background:white;padding:16px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);}}</style></head><body><h1>{}</h1><div class=\"url\">{}</div><hr><div class=\"content\">{}</div></body></html>",
            page.title, page.title, page.url, page.content
        );

        if let Some(parent) = output_path.parent() {
            if !parent.exists() {
                tokio::fs::create_dir_all(parent).await?;
            }
        }

        tokio::fs::write(output_path, preview_html).await?;
        Ok(output_path.to_path_buf())
    }
}

impl Default for HeadlessBrowserEngine {
    fn default() -> Self {
        Self::new()
    }
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    let mut in_script = false;
    let mut in_style = false;

    let lower = html.to_lowercase();
    let mut chars = html.chars().peekable();
    let mut idx = 0;

    while let Some(ch) = chars.next() {
        if ch == '<' {
            in_tag = true;
            if lower[idx..].starts_with("<script") {
                in_script = true;
            } else if lower[idx..].starts_with("<style") {
                in_style = true;
            } else if lower[idx..].starts_with("</script>") {
                in_script = false;
            } else if lower[idx..].starts_with("</style>") {
                in_style = false;
            }
        } else if ch == '>' {
            in_tag = false;
            if !in_script && !in_style {
                result.push(' ');
            }
        } else if !in_tag && !in_script && !in_style {
            result.push(ch);
        }
        idx += ch.len_utf8();
    }

    // Collapse whitespace
    let words: Vec<&str> = result.split_whitespace().collect();
    words.join(" ")
}
