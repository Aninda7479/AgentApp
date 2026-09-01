use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::storage::settings::{get_legacy_appdata_dirs, get_superagent_dir};
use crate::types::ChatMessage;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChatSessionMetadata {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub message_count: usize,
}

impl From<&ChatSession> for ChatSessionMetadata {
    fn from(session: &ChatSession) -> Self {
        Self {
            id: session.id.clone(),
            title: session.title.clone(),
            project: session.project.clone(),
            model: session.model.clone(),
            created_at: session.created_at,
            updated_at: session.updated_at,
            message_count: session.messages.len(),
        }
    }
}

pub fn resolve_conversation_dir(base_dir: Option<&PathBuf>) -> PathBuf {
    let base = match base_dir {
        Some(d) => d.clone(),
        None => get_superagent_dir(),
    };

    let candidates = [
        base.join("conversation"),
        base.join("conversations"),
        base.join("chats"),
        PathBuf::from(".").join(".superagent").join("conversation"),
        PathBuf::from(".").join(".superagent").join("chats"),
    ];

    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }

    base.join("conversation")
}

#[derive(Debug, Clone)]
pub struct ChatStorage {
    storage_dir: PathBuf,
}

impl ChatStorage {
    pub fn new() -> Self {
        Self::with_dir(resolve_conversation_dir(None))
    }

    pub fn with_dir(storage_dir: PathBuf) -> Self {
        Self { storage_dir }
    }

    fn list_projects(&self) -> Result<Vec<String>> {
        let projects_dir = self.storage_dir.join("projects");
        let mut projects = Vec::new();
        if projects_dir.exists() {
            for entry in fs::read_dir(projects_dir)? {
                let entry = entry?;
                if entry.path().is_dir() {
                    if let Some(name) = entry.file_name().to_str() {
                        projects.push(name.to_string());
                    }
                }
            }
        }
        Ok(projects)
    }

    fn find_chat_file(&self, id: &str) -> Option<PathBuf> {
        let mut candidates = vec![
            self.storage_dir.join("chats").join(id).join("chat.json"),
            self.storage_dir.join(id).join("chat.json"),
            self.storage_dir.join(format!("session_{}.json", id)),
            self.storage_dir.join(format!("{}.json", id)),
        ];

        let sa_conv = get_superagent_dir().join("conversation");
        if self.storage_dir.starts_with(&sa_conv) || self.storage_dir.to_string_lossy().contains(".superagent") {
            candidates.push(get_superagent_dir().join("conversation").join("chats").join(id).join("chat.json"));
            candidates.push(get_superagent_dir().join("conversation").join("Chats").join(id).join("chat.json"));
            candidates.push(get_superagent_dir().join("chats").join(format!("session_{}.json", id)));

            for legacy in get_legacy_appdata_dirs() {
                candidates.push(legacy.join("Conversation").join("Chats").join(id).join("chat.json"));
                candidates.push(legacy.join("Conversation").join("chats").join(id).join("chat.json"));
                candidates.push(legacy.join("conversation").join("chats").join(id).join("chat.json"));
                candidates.push(legacy.join("Conversation").join(id).join("chat.json"));
                candidates.push(legacy.join("conversation").join(id).join("chat.json"));
            }
        }

        for c in &candidates {
            if c.exists() {
                return Some(c.clone());
            }
        }

        // Also check if any project folder contains this chat
        if let Ok(projects) = self.list_projects() {
            for proj in projects {
                let proj_chat_candidates = [
                    self.storage_dir.join("chats").join(&proj).join(id).join("chat.json"),
                    self.storage_dir.join(&proj).join(id).join("chat.json"),
                ];
                for chat_in_proj in proj_chat_candidates {
                    if chat_in_proj.exists() {
                        return Some(chat_in_proj);
                    }
                }
            }
        }

        None
    }

    fn default_write_path(&self, id: &str) -> PathBuf {
        self.storage_dir.join("chats").join(id).join("chat.json")
    }

    pub fn save_session(&self, session: &ChatSession) -> Result<()> {
        let file_path = self.find_chat_file(&session.id).unwrap_or_else(|| self.default_write_path(&session.id));
        if let Some(parent) = file_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }
        let json = serde_json::to_string_pretty(session)?;
        fs::write(file_path, json)?;
        Ok(())
    }

    pub fn load_session(&self, id: &str) -> Result<ChatSession> {
        let file_path = self.find_chat_file(id)
            .ok_or_else(|| anyhow!("Chat session with id '{}' not found", id))?;
        let content = fs::read_to_string(file_path)?;
        
        // Try parsing primary ChatSession format
        if let Ok(session) = serde_json::from_str::<ChatSession>(&content) {
            return Ok(session);
        }

        // Try parsing TypeScript chat.json schema { id, title, createdAt, updatedAt, messages: [...] }
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            let chat_id = val.get("id").and_then(|v| v.as_str()).unwrap_or(id).to_string();
            let title = val.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled Chat").to_string();
            let created_at = val.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
            let updated_at = val.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(created_at);
            let project = val.get("projectName").or_else(|| val.get("project")).and_then(|v| v.as_str()).map(|s| s.to_string());
            let model = val.get("model").and_then(|v| v.as_str()).map(|s| s.to_string());

            let mut messages = Vec::new();
            if let Some(msg_arr) = val.get("messages").and_then(|v| v.as_array()) {
                for m in msg_arr {
                    if let Ok(chat_msg) = serde_json::from_value::<ChatMessage>(m.clone()) {
                        messages.push(chat_msg);
                    }
                }
            }

            return Ok(ChatSession {
                id: chat_id,
                title,
                project,
                model,
                created_at,
                updated_at,
                messages,
            });
        }

        Err(anyhow!("Failed to parse chat session JSON for id '{}'", id))
    }

    pub fn list_sessions(&self) -> Result<Vec<ChatSessionMetadata>> {
        let mut metadata_list = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        let mut search_dirs = vec![
            self.storage_dir.join("chats"),
            self.storage_dir.join("Chats"),
            self.storage_dir.clone(),
        ];

        let sa_conv = get_superagent_dir().join("conversation");
        if self.storage_dir.starts_with(&sa_conv) || self.storage_dir.to_string_lossy().contains(".superagent") {
            search_dirs.push(get_superagent_dir().join("conversation").join("chats"));
            search_dirs.push(get_superagent_dir().join("conversation").join("Chats"));
            search_dirs.push(get_superagent_dir().join("chats"));
            search_dirs.push(get_superagent_dir().join("Chats"));

            for legacy in get_legacy_appdata_dirs() {
                search_dirs.push(legacy.join("Conversation").join("Chats"));
                search_dirs.push(legacy.join("Conversation").join("chats"));
                search_dirs.push(legacy.join("conversation").join("chats"));
                search_dirs.push(legacy.join("conversation").join("Chats"));
                search_dirs.push(legacy.join("Chats"));
                search_dirs.push(legacy.join("chats"));
            }
        }

        for dir in &search_dirs {
            if !dir.exists() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let file_to_read = if path.is_dir() && path.join("chat.json").exists() {
                        Some(path.join("chat.json"))
                    } else if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
                        Some(path.clone())
                    } else {
                        None
                    };

                    if let Some(target_file) = file_to_read {
                        if let Ok(content) = fs::read_to_string(&target_file) {
                            if let Ok(session) = serde_json::from_str::<ChatSession>(&content) {
                                if !seen_ids.contains(&session.id) {
                                    seen_ids.insert(session.id.clone());
                                    metadata_list.push(ChatSessionMetadata::from(&session));
                                }
                            } else if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                                if let Some(id) = val.get("id").and_then(|v| v.as_str()) {
                                    if !seen_ids.contains(id) {
                                        seen_ids.insert(id.to_string());
                                        let title = val.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled Chat").to_string();
                                        let created_at = val.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
                                        let updated_at = val.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(created_at);
                                        let project = val.get("projectName").or_else(|| val.get("project")).and_then(|v| v.as_str()).map(|s| s.to_string());
                                        let model = val.get("model").and_then(|v| v.as_str()).map(|s| s.to_string());
                                        let message_count = val.get("messages").and_then(|v| v.as_array()).map_or(0, |a| a.len());

                                        metadata_list.push(ChatSessionMetadata {
                                            id: id.to_string(),
                                            title,
                                            project,
                                            model,
                                            created_at,
                                            updated_at,
                                            message_count,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Sort by updated_at descending (newest first)
        metadata_list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(metadata_list)
    }

    pub fn delete_session(&self, id: &str) -> Result<()> {
        if let Some(file_path) = self.find_chat_file(id) {
            let _ = fs::remove_file(&file_path);
            if let Some(parent) = file_path.parent() {
                if parent.file_name().and_then(|n| n.to_str()) == Some(id) {
                    let _ = fs::remove_dir_all(parent);
                }
            }
        }
        Ok(())
    }

    pub fn storage_dir(&self) -> &PathBuf {
        &self.storage_dir
    }

    pub fn save_stored_chat_from_json(&self, chat_val: &serde_json::Value) -> Result<()> {
        let id = match chat_val.get("id").and_then(|v| v.as_str()) {
            Some(s) if !s.trim().is_empty() => s.trim().to_string(),
            _ => return Ok(()),
        };

        let title = chat_val.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled Chat").to_string();
        let project = chat_val.get("project").or_else(|| chat_val.get("projectName")).and_then(|v| v.as_str()).map(|s| s.to_string());
        let model = chat_val.get("model").and_then(|v| v.as_str()).map(|s| s.to_string());
        let timestamp_str = chat_val.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");
        let created_at = chat_val.get("createdAt").and_then(|v| v.as_i64()).unwrap_or_else(|| {
            chrono::DateTime::parse_from_rfc3339(timestamp_str)
                .map(|dt| dt.timestamp_millis())
                .unwrap_or_else(|_| chrono::Utc::now().timestamp_millis())
        });
        let updated_at = chat_val.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

        let chat_dir = self.storage_dir.join("chats").join(&id);
        let _ = fs::create_dir_all(&chat_dir);

        // Save chat.json metadata
        let meta_json = serde_json::json!({
            "id": id,
            "title": title,
            "project": project,
            "model": model,
            "createdAt": created_at,
            "updatedAt": updated_at,
        });
        let _ = fs::write(chat_dir.join("chat.json"), serde_json::to_string_pretty(&meta_json)?);

        // Save steps.json
        if let Some(steps) = chat_val.get("steps").and_then(|v| v.as_array()) {
            if !steps.is_empty() {
                let _ = fs::write(chat_dir.join("steps.json"), serde_json::to_string_pretty(steps)?);
            }
        }

        Ok(())
    }

    pub fn save_stored_project_from_json(&self, proj_val: &serde_json::Value) -> Result<()> {
        let name = match proj_val.get("name").or_else(|| proj_val.get("id")).and_then(|v| v.as_str()) {
            Some(s) if !s.trim().is_empty() => s.trim().to_string(),
            _ => return Ok(()),
        };

        let proj_dir = self.storage_dir.join("projects").join(&name);
        let _ = fs::create_dir_all(&proj_dir);

        let _ = fs::write(proj_dir.join("meta.json"), serde_json::to_string_pretty(proj_val)?);
        Ok(())
    }

    pub fn load_all_stored_projects(&self) -> Vec<serde_json::Value> {
        let mut projects = Vec::new();
        let mut seen = std::collections::HashSet::new();

        let search_dirs = [
            self.storage_dir.join("projects"),
            self.storage_dir.join("Projects"),
        ];

        for p_dir in &search_dirs {
            if !p_dir.exists() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(p_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let dir_name = entry.file_name().to_string_lossy().trim().to_string();
                        let meta_file = path.join("meta.json");
                        let proj_file = path.join("project.json");
                        if let Ok(c) = fs::read_to_string(&meta_file).or_else(|_| fs::read_to_string(&proj_file)) {
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&c) {
                                let name = val.get("name").or_else(|| val.get("id")).and_then(|v| v.as_str()).unwrap_or(&dir_name).trim().to_string();
                                let key = name.to_lowercase();
                                if !key.is_empty() && !seen.contains(&key) {
                                    seen.insert(key);
                                    projects.push(val);
                                }
                            }
                        } else if !dir_name.is_empty() {
                            let key = dir_name.to_lowercase();
                            if !seen.contains(&key) {
                                seen.insert(key);
                                projects.push(serde_json::json!({
                                    "id": dir_name,
                                    "name": dir_name,
                                    "folders": []
                                }));
                            }
                        }
                    }
                }
            }
        }

        projects
    }

    pub fn load_all_stored_chats(&self) -> Vec<serde_json::Value> {
        let mut chats = Vec::new();
        let mut seen = std::collections::HashSet::new();

        let search_dirs = [
            self.storage_dir.join("chats"),
            self.storage_dir.join("Chats"),
        ];

        for dir in &search_dirs {
            if !dir.exists() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let chat_json = path.join("chat.json");
                        let id_from_dir = entry.file_name().to_string_lossy().trim().to_string();

                        if chat_json.exists() {
                            if let Ok(content) = fs::read_to_string(&chat_json) {
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                                    let id = val.get("id").and_then(|v| v.as_str()).unwrap_or(&id_from_dir).trim().to_string();
                                    let key = id.to_lowercase();
                                    if !key.is_empty() && !seen.contains(&key) {
                                        seen.insert(key);
                                        let title = val.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled Chat").to_string();
                                        let project = val.get("project").or_else(|| val.get("projectName")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                                        let model = val.get("model").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                        let created_at = val.get("createdAt").and_then(|v| v.as_i64()).unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
                                        let updated_at = val.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(created_at);

                                        let iso_ts = chrono::DateTime::from_timestamp_millis(created_at)
                                            .map(|dt| dt.to_rfc3339())
                                            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

                                        chats.push(serde_json::json!({
                                            "id": id,
                                            "title": title,
                                            "project": project,
                                            "model": model,
                                            "timestamp": iso_ts,
                                            "createdAt": created_at,
                                            "updatedAt": updated_at,
                                            "steps": [],
                                            "isRunning": false
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Sort newest updated first
        chats.sort_by(|a, b| {
            let b_up = b.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0);
            let a_up = a.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0);
            b_up.cmp(&a_up)
        });

        chats
    }

    pub fn load_chat_steps(&self, chat_id: &str) -> Vec<serde_json::Value> {
        let clean_id = chat_id.trim().trim_start_matches("session-");

        let candidates = [
            self.storage_dir.join("chats").join(clean_id).join("steps.json"),
            self.storage_dir.join("Chats").join(clean_id).join("steps.json"),
            self.storage_dir.join(clean_id).join("steps.json"),
        ];

        for c in &candidates {
            if c.exists() {
                if let Ok(content) = fs::read_to_string(c) {
                    if let Ok(steps) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                        return steps;
                    }
                }
            }
        }

        // Check chat.json messages fallback
        let meta_candidates = [
            self.storage_dir.join("chats").join(clean_id).join("chat.json"),
            self.storage_dir.join("Chats").join(clean_id).join("chat.json"),
            self.storage_dir.join(clean_id).join("chat.json"),
        ];

        for c in &meta_candidates {
            if c.exists() {
                if let Ok(content) = fs::read_to_string(c) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(msgs) = val.get("messages").and_then(|v| v.as_array()) {
                            return msgs.clone();
                        }
                    }
                }
            }
        }

        Vec::new()
    }
}

pub fn save_stored_chat_from_json(chat_val: &serde_json::Value) -> Result<()> {
    ChatStorage::new().save_stored_chat_from_json(chat_val)
}

pub fn save_stored_project_from_json(proj_val: &serde_json::Value) -> Result<()> {
    ChatStorage::new().save_stored_project_from_json(proj_val)
}

pub fn load_all_stored_projects() -> Vec<serde_json::Value> {
    ChatStorage::new().load_all_stored_projects()
}

pub fn load_all_stored_chats() -> Vec<serde_json::Value> {
    ChatStorage::new().load_all_stored_chats()
}

pub fn load_chat_steps(chat_id: &str) -> Vec<serde_json::Value> {
    ChatStorage::new().load_chat_steps(chat_id)
}

impl Default for ChatStorage {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ChatMessage;

    #[test]
    fn test_chat_storage_save_load_delete() {
        let test_dir = std::env::temp_dir().join(format!("test_chats_{}", uuid::Uuid::new_v4()));
        let storage = ChatStorage::with_dir(test_dir.clone());

        let session_id = "test-session-123".to_string();
        let msg = ChatMessage::user("Hello agent");
        let session = ChatSession {
            id: session_id.clone(),
            title: "Test Chat".to_string(),
            project: Some("Test Project".to_string()),
            model: Some("gpt-4o".to_string()),
            created_at: 1000,
            updated_at: 2000,
            messages: vec![msg.clone()],
        };

        // Save session
        storage.save_session(&session).unwrap();

        // Load session
        let loaded = storage.load_session(&session_id).unwrap();
        assert_eq!(loaded, session);

        // List sessions
        let list = storage.list_sessions().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, session_id);
        assert_eq!(list[0].title, "Test Chat");
        assert_eq!(list[0].message_count, 1);

        // Delete session
        storage.delete_session(&session_id).unwrap();

        // Verify session is deleted
        assert!(storage.load_session(&session_id).is_err());
        let list_after = storage.list_sessions().unwrap();
        assert!(list_after.is_empty());

        let _ = fs::remove_dir_all(test_dir);
    }
}
