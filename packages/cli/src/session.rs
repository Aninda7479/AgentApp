use std::fs;
use std::path::PathBuf;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use superagent_core_v2::storage::get_superagent_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatStep {
    pub id: String,
    #[serde(rename = "type")]
    pub step_type: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSessionData {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub project: String,
    pub timestamp: String,
    #[serde(default)]
    pub steps: Vec<ChatStep>,
    #[serde(default)]
    pub messages: Vec<SavedMessage>,
}

pub fn generate_session_id() -> String {
    let u = uuid::Uuid::new_v4();
    let bytes = u.as_bytes();
    format!(
        "{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5], bytes[6], bytes[7]
    )
}

pub fn chats_dir() -> PathBuf {
    let base = get_superagent_dir().join("conversation").join("chats");
    let _ = fs::create_dir_all(&base);
    base
}

pub fn session_path(id: &str) -> PathBuf {
    let safe_id: String = id
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let dir = chats_dir().join(safe_id);
    let _ = fs::create_dir_all(&dir);
    dir.join("chat.json")
}

pub fn save_session(id: &str, title: &str, messages: &[SavedMessage]) {
    if id.is_empty() {
        return;
    }
    let p = session_path(id);
    let steps: Vec<ChatStep> = messages
        .iter()
        .enumerate()
        .map(|(idx, m)| ChatStep {
            id: format!("msg-{}", idx),
            step_type: m.role.clone(),
            content: m.content.clone(),
            timestamp: Utc::now().to_rfc3339(),
        })
        .collect();

    let data = ChatSessionData {
        id: id.to_string(),
        title: title.to_string(),
        project: String::new(),
        timestamp: Utc::now().to_rfc3339(),
        steps,
        messages: messages.to_vec(),
    };

    if let Ok(json) = serde_json::to_string_pretty(&data) {
        let _ = fs::write(p, json);
    }
}

pub fn load_session(id: &str) -> Option<Vec<SavedMessage>> {
    if id.is_empty() {
        return None;
    }
    let p = session_path(id);
    let content = fs::read_to_string(p).ok()?;
    let parsed: ChatSessionData = serde_json::from_str(&content).ok()?;

    if !parsed.messages.is_empty() {
        Some(parsed.messages)
    } else if !parsed.steps.is_empty() {
        Some(
            parsed
                .steps
                .into_iter()
                .map(|s| SavedMessage {
                    role: s.step_type,
                    content: s.content,
                })
                .collect(),
        )
    } else {
        None
    }
}
