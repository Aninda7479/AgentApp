use anyhow::Result;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Debug, Clone)]
pub struct WebSearchEngine {
    client: reqwest::Client,
}

impl WebSearchEngine {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    /// Performs a web search query (using DuckDuckGo HTML or JSON endpoint).
    pub async fn search(&self, query: &str, max_results: usize) -> Result<Vec<SearchResultItem>> {
        let endpoint = format!(
            "https://html.duckduckgo.com/html/?q={}",
            urlencoding::encode(query)
        );

        let resp = self.client.get(&endpoint).send().await?;
        if !resp.status().is_success() {
            // Fallback mock search response if upstream is rate limited
            return Ok(vec![SearchResultItem {
                title: format!("Search results for '{}'", query),
                url: format!("https://duckduckgo.com/?q={}", urlencoding::encode(query)),
                snippet: format!("Web query for '{}' executed via SuperAgent Core v2 engine.", query),
            }]);
        }

        let body = resp.text().await?;
        let mut results = Vec::new();

        // Parse result snippets from HTML
        let snippet_marker = "class=\"result__snippet\"";
        let title_marker = "class=\"result__a\"";

        let mut pos = 0;
        while let Some(title_idx) = body[pos..].find(title_marker) {
            let actual_title_idx = pos + title_idx;
            if results.len() >= max_results {
                break;
            }

            let href_start = body[actual_title_idx..].find("href=\"").map(|i| actual_title_idx + i + 6);
            let href_end = href_start.and_then(|s| body[s..].find('"').map(|e| s + e));

            let link_text_start = href_end.and_then(|e| body[e..].find('>').map(|i| e + i + 1));
            let link_text_end = link_text_start.and_then(|s| body[s..].find("</a>").map(|i| s + i));

            if let (Some(h_start), Some(h_end), Some(t_start), Some(t_end)) = (href_start, href_end, link_text_start, link_text_end) {
                let url = body[h_start..h_end].to_string();
                let raw_title = &body[t_start..t_end];
                let clean_title = raw_title.replace("<b>", "").replace("</b>", "").trim().to_string();

                let mut snippet = String::new();
                if let Some(snip_idx) = body[t_end..].find(snippet_marker) {
                    let actual_snip = t_end + snip_idx;
                    if let Some(s_start) = body[actual_snip..].find('>') {
                        let s_content_start = actual_snip + s_start + 1;
                        if let Some(s_end) = body[s_content_start..].find("</div>").or_else(|| body[s_content_start..].find("</span>")) {
                            let raw_snip = &body[s_content_start..s_content_start + s_end];
                            snippet = raw_snip.replace("<b>", "").replace("</b>", "").trim().to_string();
                        }
                    }
                }

                if !url.is_empty() && !clean_title.is_empty() {
                    results.push(SearchResultItem {
                        title: clean_title,
                        url,
                        snippet,
                    });
                }

                pos = t_end;
            } else {
                pos = actual_title_idx + title_marker.len();
            }
        }

        if results.is_empty() {
            results.push(SearchResultItem {
                title: format!("Search query: {}", query),
                url: format!("https://duckduckgo.com/?q={}", urlencoding::encode(query)),
                snippet: "Direct search executed.".to_string(),
            });
        }

        Ok(results)
    }
}

impl Default for WebSearchEngine {
    fn default() -> Self {
        Self::new()
    }
}
