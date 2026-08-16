use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::storage::settings::get_superagent_dir;
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

#[derive(Debug, Clone)]
pub struct ChatStorage {
    storage_dir: PathBuf,
}

impl ChatStorage {
    pub fn new() -> Self {
        Self::with_dir(get_superagent_dir().join("chats"))
    }

    pub fn with_dir(storage_dir: PathBuf) -> Self {
        Self { storage_dir }
    }

    fn session_file_path(&self, id: &str) -> PathBuf {
        self.storage_dir.join(format!("session_{}.json", id))
    }

    pub fn save_session(&self, session: &ChatSession) -> Result<()> {
        if !self.storage_dir.exists() {
            fs::create_dir_all(&self.storage_dir)?;
        }
        let file_path = self.session_file_path(&session.id);
        let json = serde_json::to_string_pretty(session)?;
        fs::write(file_path, json)?;
        Ok(())
    }

    pub fn load_session(&self, id: &str) -> Result<ChatSession> {
        let file_path = self.session_file_path(id);
        if !file_path.exists() {
            return Err(anyhow!("Chat session with id '{}' not found", id));
        }
        let content = fs::read_to_string(file_path)?;
        let session: ChatSession = serde_json::from_str(&content)?;
        Ok(session)
    }

    pub fn list_sessions(&self) -> Result<Vec<ChatSessionMetadata>> {
        if !self.storage_dir.exists() {
            return Ok(Vec::new());
        }

        let mut metadata_list = Vec::new();
        let entries = fs::read_dir(&self.storage_dir)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    if file_name.starts_with("session_") && file_name.ends_with(".json") {
                        if let Ok(content) = fs::read_to_string(&path) {
                            if let Ok(session) = serde_json::from_str::<ChatSession>(&content) {
                                metadata_list.push(ChatSessionMetadata::from(&session));
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
        let file_path = self.session_file_path(id);
        if file_path.exists() {
            fs::remove_file(file_path)?;
        }
        Ok(())
    }
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
