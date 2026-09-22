use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::server::ipc::memory::load_global_memory;
use crate::storage::chat_storage::ChatStorage;
use crate::tools::r#trait::Tool;

/// Tool for recalling prior conversation history, compacted turns, and persistent global facts on demand.
pub struct RecallMemoryTool {
    chat_storage: Option<Arc<ChatStorage>>,
    current_session_id: Option<String>,
}

impl RecallMemoryTool {
    pub fn new() -> Self {
        Self {
            chat_storage: None,
            current_session_id: None,
        }
    }

    pub fn with_storage(
        chat_storage: Arc<ChatStorage>,
        current_session_id: Option<String>,
    ) -> Self {
        Self {
            chat_storage: Some(chat_storage),
            current_session_id,
        }
    }
}

impl Default for RecallMemoryTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for RecallMemoryTool {
    fn name(&self) -> &str {
        "recall_memory"
    }

    fn description(&self) -> &str {
        "Recalls previous conversation messages, compacted history, earlier links/files, and persistent user profile preferences/facts. Use whenever the user refers to past discussions, previous URLs, earlier tasks, or when context was compacted due to time gaps."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keywords, topic, or search term to look for in past messages and memory (e.g. 'youtube link', 'python script', 'preferences', 'yesterday'). Leave empty to retrieve the most recent prior messages."
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of past messages or memory entries to return (default: 5, max: 20)."
                },
                "scope": {
                    "type": "string",
                    "enum": ["all", "current_chat", "all_chats", "global_facts"],
                    "description": "Search scope. 'current_chat' searches only this conversation, 'all_chats' searches across sessions, 'global_facts' searches persistent profile/learned facts, 'all' searches everything."
                }
            }
        })
    }

    async fn execute(&self, arguments: Value) -> Result<String> {
        let query = arguments
            .get("query")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_lowercase();

        let limit = arguments
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(5)
            .clamp(1, 20) as usize;

        let scope = arguments
            .get("scope")
            .and_then(|v| v.as_str())
            .unwrap_or("all")
            .to_lowercase();

        let mut output_sections = Vec::new();

        // 1. Search Global Persistent Memory (User Profile & Learned Insights)
        if scope == "all" || scope == "global_facts" {
            let global_mem = load_global_memory();
            let mut facts = Vec::new();

            if let Some(profile) = global_mem.get("userProfile").and_then(|v| v.as_array()) {
                for item in profile {
                    let key = item.get("key").and_then(|v| v.as_str()).unwrap_or("");
                    let val = item.get("value").and_then(|v| v.as_str()).unwrap_or("");
                    if query.is_empty()
                        || key.to_lowercase().contains(&query)
                        || val.to_lowercase().contains(&query)
                    {
                        facts.push(format!("• {}: {}", key, val));
                    }
                }
            }

            if let Some(insights) = global_mem.get("learnedInsights").and_then(|v| v.as_array()) {
                for item in insights {
                    let topic = item.get("topic").and_then(|v| v.as_str()).unwrap_or("");
                    let val = item.get("insight").and_then(|v| v.as_str()).unwrap_or("");
                    if query.is_empty()
                        || topic.to_lowercase().contains(&query)
                        || val.to_lowercase().contains(&query)
                    {
                        facts.push(format!("• [Insight] {}: {}", topic, val));
                    }
                }
            }

            if !facts.is_empty() {
                output_sections.push(format!(
                    "### 🧠 Persistent Profile & Facts\n{}",
                    facts.into_iter().take(limit).collect::<Vec<_>>().join("\n")
                ));
            }
        }

        // 2. Search Chat Storage History
        if scope == "all" || scope == "current_chat" || scope == "all_chats" {
            if let Some(ref storage) = self.chat_storage {
                let mut matched_messages = Vec::new();

                // Collect target sessions
                let mut sessions_to_check = Vec::new();
                if scope == "current_chat" {
                    if let Some(ref cur_id) = self.current_session_id {
                        if let Ok(sess) = storage.load_session(cur_id) {
                            sessions_to_check.push(sess);
                        }
                    }
                } else if let Some(ref cur_id) = self.current_session_id {
                    // Primary is current session, followed by other sessions
                    if let Ok(sess) = storage.load_session(cur_id) {
                        sessions_to_check.push(sess);
                    }
                    if let Ok(summaries) = storage.list_sessions() {
                        for summary in summaries.into_iter().take(10) {
                            if summary.id != *cur_id {
                                if let Ok(sess) = storage.load_session(&summary.id) {
                                    sessions_to_check.push(sess);
                                }
                            }
                        }
                    }
                } else if let Ok(summaries) = storage.list_sessions() {
                    for summary in summaries.into_iter().take(10) {
                        if let Ok(sess) = storage.load_session(&summary.id) {
                            sessions_to_check.push(sess);
                        }
                    }
                }

                for sess in &sessions_to_check {
                    for msg in sess.messages.iter().rev() {
                        let content = msg.text_content();
                        let trimmed = content.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        let matches = if query.is_empty() {
                            true
                        } else {
                            trimmed.to_lowercase().contains(&query)
                        };

                        if matches {
                            let role_name = match msg.role {
                                crate::types::Role::User => "User",
                                crate::types::Role::Assistant => "SuperAgent",
                                crate::types::Role::System => "System",
                                crate::types::Role::Tool => "Tool",
                            };

                            // Clean up excerpt
                            let excerpt: String = trimmed.chars().take(300).collect();
                            let suffix = if trimmed.chars().count() > 300 {
                                "..."
                            } else {
                                ""
                            };
                            matched_messages.push(format!(
                                "**{}** (in chat `{}`):\n> {}{}",
                                role_name, sess.title, excerpt, suffix
                            ));

                            if matched_messages.len() >= limit {
                                break;
                            }
                        }
                    }

                    if matched_messages.len() >= limit {
                        break;
                    }
                }

                if !matched_messages.is_empty() {
                    output_sections.push(format!(
                        "### 💬 Previous Conversation History\n{}",
                        matched_messages.join("\n\n")
                    ));
                }
            }
        }

        if output_sections.is_empty() {
            if query.is_empty() {
                Ok("No previous conversation history or saved facts found.".to_string())
            } else {
                Ok(format!(
                    "No previous conversation history or saved facts matched your query '{}'. Try using broader keywords or checking another topic.",
                    query
                ))
            }
        } else {
            Ok(output_sections.join("\n\n"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_recall_memory_tool_schema() {
        let tool = RecallMemoryTool::new();
        assert_eq!(tool.name(), "recall_memory");
        let schema = tool.parameters_schema();
        assert!(schema.get("properties").is_some());
    }

    #[tokio::test]
    async fn test_recall_memory_empty_query() {
        let tool = RecallMemoryTool::new();
        let res = tool.execute(json!({})).await.unwrap();
        assert!(!res.is_empty());
    }
}
