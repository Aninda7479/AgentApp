use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::storage::settings::{get_legacy_appdata_dirs, get_superagent_dir};
use crate::types::{ChatMessage, Role};

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

/// Extracts the first user text prompt from a raw chat session JSON object.
pub fn extract_first_user_prompt_from_json(val: &serde_json::Value) -> Option<String> {
    // 1. Try messages array
    if let Some(arr) = val.get("messages").and_then(|v| v.as_array()) {
        for m in arr {
            let role = m.get("role").and_then(|r| r.as_str()).unwrap_or("");
            if role == "user" {
                if let Some(s) = m.get("content").and_then(|c| c.as_str()) {
                    if !s.trim().is_empty() {
                        return Some(s.to_string());
                    }
                } else if let Some(blocks) = m.get("content").and_then(|c| c.as_array()) {
                    let texts: Vec<&str> = blocks
                        .iter()
                        .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                        .collect();
                    if !texts.is_empty() {
                        return Some(texts.join(" "));
                    }
                }
            }
        }
    }

    // 2. Try steps array
    if let Some(arr) = val.get("steps").and_then(|v| v.as_array()) {
        for s in arr {
            let typ = s.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if typ == "user" || typ == "user_input" {
                if let Some(text) = s.get("content").and_then(|c| c.as_str()) {
                    if !text.trim().is_empty() {
                        return Some(text.to_string());
                    }
                }
            }
        }
    }

    None
}

/// Sanitizes a stored chat title to guarantee that private numerical Telegram Chat or User IDs
/// are never persisted or exposed in the chat list.
pub fn sanitize_stored_chat_title(raw_title: &str, first_prompt: Option<&str>) -> String {
    let trimmed = raw_title.trim();

    // Check if the title exposes a numerical Telegram ID or user placeholder
    let is_telegram_leak = trimmed.starts_with("Telegram Chat")
        || trimmed == "Telegram Conversation"
        || trimmed == "Telegram Assistant"
        || (trimmed.to_lowercase().contains("telegram")
            && trimmed.chars().any(|c| c.is_ascii_digit()))
        || (trimmed.starts_with("User ") && trimmed.chars().skip(5).all(|c| c.is_ascii_digit()))
        || (trimmed.starts_with("Chat ") && trimmed.chars().skip(5).all(|c| c.is_ascii_digit()));

    if is_telegram_leak || trimmed.is_empty() {
        if let Some(prompt) = first_prompt {
            let derived =
                crate::integrations::telegram_bot::generate_telegram_chat_title(prompt, "");
            if derived != "Telegram Conversation" && !derived.is_empty() {
                return derived;
            }
        }
        return "Telegram Conversation".to_string();
    }

    raw_title.to_string()
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
        if self.storage_dir.starts_with(&sa_conv)
            || self.storage_dir.to_string_lossy().contains(".superagent")
        {
            candidates.push(
                get_superagent_dir()
                    .join("conversation")
                    .join("chats")
                    .join(id)
                    .join("chat.json"),
            );
            candidates.push(
                get_superagent_dir()
                    .join("conversation")
                    .join("Chats")
                    .join(id)
                    .join("chat.json"),
            );
            candidates.push(
                get_superagent_dir()
                    .join("chats")
                    .join(format!("session_{}.json", id)),
            );

            for legacy in get_legacy_appdata_dirs() {
                candidates.push(
                    legacy
                        .join("Conversation")
                        .join("Chats")
                        .join(id)
                        .join("chat.json"),
                );
                candidates.push(
                    legacy
                        .join("Conversation")
                        .join("chats")
                        .join(id)
                        .join("chat.json"),
                );
                candidates.push(
                    legacy
                        .join("conversation")
                        .join("chats")
                        .join(id)
                        .join("chat.json"),
                );
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
                    self.storage_dir
                        .join("chats")
                        .join(&proj)
                        .join(id)
                        .join("chat.json"),
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
        let first_prompt = session
            .messages
            .iter()
            .find(|m| m.role == Role::User)
            .map(|m| m.text_content());
        let mut session_to_save = session.clone();
        session_to_save.title = sanitize_stored_chat_title(&session.title, first_prompt.as_deref());

        let file_path = self
            .find_chat_file(&session_to_save.id)
            .unwrap_or_else(|| self.default_write_path(&session_to_save.id));
        if let Some(parent) = file_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }
        let json = serde_json::to_string_pretty(&session_to_save)?;
        fs::write(&file_path, json)?;

        // Also write steps.json so UI step loaders get structured steps with string content
        if let Some(parent) = file_path.parent() {
            let steps: Vec<serde_json::Value> = session_to_save
                .messages
                .iter()
                .map(|m| {
                    let mut obj = serde_json::to_value(m).unwrap_or_default();
                    let text = m.text_content();
                    obj["content"] = serde_json::Value::String(text);
                    obj["type"] = serde_json::to_value(&m.role)
                        .unwrap_or_else(|_| serde_json::json!("assistant"));
                    obj
                })
                .collect();
            let _ = fs::write(
                parent.join("steps.json"),
                serde_json::to_string_pretty(&steps).unwrap_or_default(),
            );
        }

        Ok(())
    }

    pub fn load_session(&self, id: &str) -> Result<ChatSession> {
        let file_path = self
            .find_chat_file(id)
            .ok_or_else(|| anyhow!("Chat session with id '{}' not found", id))?;
        let content = fs::read_to_string(file_path)?;

        // Try parsing primary ChatSession format
        if let Ok(mut session) = serde_json::from_str::<ChatSession>(&content) {
            let first_prompt = session
                .messages
                .iter()
                .find(|m| m.role == Role::User)
                .map(|m| m.text_content());
            session.title = sanitize_stored_chat_title(&session.title, first_prompt.as_deref());
            return Ok(session);
        }

        // Try parsing TypeScript chat.json schema { id, title, createdAt, updatedAt, messages: [...] }
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            let chat_id = val
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or(id)
                .to_string();
            let raw_title = val
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled Chat");
            let first_prompt = extract_first_user_prompt_from_json(&val);
            let title = sanitize_stored_chat_title(raw_title, first_prompt.as_deref());
            let created_at = val.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
            let updated_at = val
                .get("updatedAt")
                .and_then(|v| v.as_i64())
                .unwrap_or(created_at);
            let project = val
                .get("projectName")
                .or_else(|| val.get("project"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let model = val
                .get("model")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

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
        if self.storage_dir.starts_with(&sa_conv)
            || self.storage_dir.to_string_lossy().contains(".superagent")
        {
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
                    } else if path.is_file()
                        && path.extension().and_then(|e| e.to_str()) == Some("json")
                    {
                        Some(path.clone())
                    } else {
                        None
                    };

                    if let Some(target_file) = file_to_read {
                        if let Ok(content) = fs::read_to_string(&target_file) {
                            if let Ok(mut session) = serde_json::from_str::<ChatSession>(&content) {
                                if !seen_ids.contains(&session.id) {
                                    seen_ids.insert(session.id.clone());
                                    let first_prompt = session
                                        .messages
                                        .iter()
                                        .find(|m| m.role == Role::User)
                                        .map(|m| m.text_content());
                                    session.title = sanitize_stored_chat_title(
                                        &session.title,
                                        first_prompt.as_deref(),
                                    );
                                    metadata_list.push(ChatSessionMetadata::from(&session));
                                }
                            } else if let Ok(val) =
                                serde_json::from_str::<serde_json::Value>(&content)
                            {
                                if let Some(id) = val.get("id").and_then(|v| v.as_str()) {
                                    if !seen_ids.contains(id) {
                                        seen_ids.insert(id.to_string());
                                        let raw_title = val
                                            .get("title")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("Untitled Chat");
                                        let first_prompt =
                                            extract_first_user_prompt_from_json(&val);
                                        let title = sanitize_stored_chat_title(
                                            raw_title,
                                            first_prompt.as_deref(),
                                        );
                                        let created_at = val
                                            .get("createdAt")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0);
                                        let updated_at = val
                                            .get("updatedAt")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(created_at);
                                        let project = val
                                            .get("projectName")
                                            .or_else(|| val.get("project"))
                                            .and_then(|v| v.as_str())
                                            .map(|s| s.to_string());
                                        let model = val
                                            .get("model")
                                            .and_then(|v| v.as_str())
                                            .map(|s| s.to_string());
                                        let message_count = val
                                            .get("messages")
                                            .and_then(|v| v.as_array())
                                            .map_or(0, |a| a.len());

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
        let clean_id = id.trim();
        let stripped_id = clean_id
            .trim_start_matches("session_")
            .trim_start_matches("session-")
            .trim_start_matches("chat_")
            .trim_start_matches("chat-");

        let search_dirs = [
            self.storage_dir.join("chats"),
            self.storage_dir.join("Chats"),
            get_superagent_dir().join("conversation").join("chats"),
            get_superagent_dir().join("conversation").join("Chats"),
            get_superagent_dir().join("chats"),
        ];

        for dir in &search_dirs {
            if !dir.exists() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let name = entry.file_name().to_string_lossy().to_string();

                    // Check if folder name matches id
                    let matches_name = name.eq_ignore_ascii_case(clean_id)
                        || name.eq_ignore_ascii_case(stripped_id)
                        || name.eq_ignore_ascii_case(&format!("session_{}", clean_id))
                        || name.eq_ignore_ascii_case(&format!("chat_{}", clean_id));

                    if path.is_dir() {
                        let chat_json = path.join("chat.json");
                        let mut matches_content = false;
                        if chat_json.exists() {
                            if let Ok(content) = fs::read_to_string(&chat_json) {
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content)
                                {
                                    if let Some(chat_id) = val.get("id").and_then(|v| v.as_str()) {
                                        if chat_id.eq_ignore_ascii_case(clean_id)
                                            || chat_id.eq_ignore_ascii_case(stripped_id)
                                        {
                                            matches_content = true;
                                        }
                                    }
                                }
                            }
                        }

                        if matches_name || matches_content {
                            let _ = fs::remove_dir_all(&path);
                        }
                    } else if path.is_file() {
                        if matches_name
                            || name.eq_ignore_ascii_case(&format!("{}.json", clean_id))
                            || name.eq_ignore_ascii_case(&format!("session_{}.json", clean_id))
                            || name.eq_ignore_ascii_case(&format!("{}.json", stripped_id))
                            || name.eq_ignore_ascii_case(&format!("session_{}.json", stripped_id))
                        {
                            let _ = fs::remove_file(&path);
                        }
                    }
                }
            }
        }

        // Also check project directories
        for p_name in &["projects", "Projects"] {
            let p_dir = self.storage_dir.join(p_name);
            if p_dir.exists() {
                if let Ok(entries) = fs::read_dir(&p_dir) {
                    for entry in entries.flatten() {
                        let proj_path = entry.path();
                        if proj_path.is_dir() {
                            let proj_chat = proj_path.join("chats").join(clean_id);
                            if proj_chat.exists() {
                                let _ = fs::remove_dir_all(&proj_chat);
                            }
                            let proj_chat_stripped = proj_path.join("chats").join(stripped_id);
                            if proj_chat_stripped.exists() {
                                let _ = fs::remove_dir_all(&proj_chat_stripped);
                            }
                            let proj_chat_file = proj_path.join(format!("{}.json", clean_id));
                            if proj_chat_file.exists() {
                                let _ = fs::remove_file(&proj_chat_file);
                            }
                        }
                    }
                }
            }
        }

        // Also legacy appdata dirs
        for legacy in get_legacy_appdata_dirs() {
            let legacy_dirs = [
                legacy.join("Conversation").join("Chats"),
                legacy.join("Conversation").join("chats"),
                legacy.join("conversation").join("chats"),
                legacy.join("Conversation"),
                legacy.join("conversation"),
            ];
            for ldir in &legacy_dirs {
                if ldir.exists() {
                    let target_dir = ldir.join(clean_id);
                    if target_dir.exists() {
                        let _ = fs::remove_dir_all(&target_dir);
                    }
                    let target_file = ldir.join(format!("{}.json", clean_id));
                    if target_file.exists() {
                        let _ = fs::remove_file(&target_file);
                    }
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

        let raw_title = chat_val
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled Chat");
        let first_prompt = extract_first_user_prompt_from_json(chat_val);
        let title = sanitize_stored_chat_title(raw_title, first_prompt.as_deref());
        let project = chat_val
            .get("project")
            .or_else(|| chat_val.get("projectName"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let model = chat_val
            .get("model")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let timestamp_str = chat_val
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let created_at = chat_val
            .get("createdAt")
            .and_then(|v| v.as_i64())
            .unwrap_or_else(|| {
                chrono::DateTime::parse_from_rfc3339(timestamp_str)
                    .map(|dt| dt.timestamp_millis())
                    .unwrap_or_else(|_| chrono::Utc::now().timestamp_millis())
            });
        let updated_at = chat_val
            .get("updatedAt")
            .and_then(|v| v.as_i64())
            .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

        let chat_dir = self.storage_dir.join("chats").join(&id);
        let _ = fs::create_dir_all(&chat_dir);

        // Save chat.json metadata
        let mut meta_json = serde_json::json!({
            "id": id,
            "title": title,
            "project": project,
            "model": model,
            "createdAt": created_at,
            "updatedAt": updated_at,
        });

        if let Some(settings) = chat_val.get("settings") {
            meta_json["settings"] = settings.clone();
        }
        if let Some(standalone_config) = chat_val.get("standaloneConfig") {
            meta_json["standaloneConfig"] = standalone_config.clone();
        }
        if let Some(pinned) = chat_val.get("pinned") {
            meta_json["pinned"] = pinned.clone();
        }
        if let Some(unread) = chat_val.get("unread") {
            meta_json["unread"] = unread.clone();
        }

        let _ = fs::write(
            chat_dir.join("chat.json"),
            serde_json::to_string_pretty(&meta_json)?,
        );

        // Save steps.json
        if let Some(steps) = chat_val.get("steps").and_then(|v| v.as_array()) {
            if !steps.is_empty() {
                let _ = fs::write(
                    chat_dir.join("steps.json"),
                    serde_json::to_string_pretty(steps)?,
                );
            }
        }

        Ok(())
    }

    pub fn save_stored_project_from_json(&self, proj_val: &serde_json::Value) -> Result<()> {
        let name = match proj_val
            .get("name")
            .or_else(|| proj_val.get("id"))
            .and_then(|v| v.as_str())
        {
            Some(s) if !s.trim().is_empty() => s.trim().to_string(),
            _ => return Ok(()),
        };

        let proj_dir = self.storage_dir.join("projects").join(&name);
        let _ = fs::create_dir_all(&proj_dir);

        let _ = fs::write(
            proj_dir.join("meta.json"),
            serde_json::to_string_pretty(proj_val)?,
        );
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
                        if let Ok(c) = fs::read_to_string(&meta_file)
                            .or_else(|_| fs::read_to_string(&proj_file))
                        {
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&c) {
                                let name = val
                                    .get("name")
                                    .or_else(|| val.get("id"))
                                    .and_then(|v| v.as_str())
                                    .unwrap_or(&dir_name)
                                    .trim()
                                    .to_string();
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
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content)
                                {
                                    let id = val
                                        .get("id")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or(&id_from_dir)
                                        .trim()
                                        .to_string();
                                    let key = id.to_lowercase();
                                    if !key.is_empty() && !seen.contains(&key) {
                                        seen.insert(key);
                                        let raw_title = val
                                            .get("title")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("Untitled Chat");
                                        let first_prompt =
                                            extract_first_user_prompt_from_json(&val);
                                        let title = sanitize_stored_chat_title(
                                            raw_title,
                                            first_prompt.as_deref(),
                                        );
                                        let project = val
                                            .get("project")
                                            .or_else(|| val.get("projectName"))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let model = val
                                            .get("model")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let created_at = val
                                            .get("createdAt")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or_else(|| {
                                                chrono::Utc::now().timestamp_millis()
                                            });
                                        let updated_at = val
                                            .get("updatedAt")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(created_at);

                                        let iso_ts =
                                            chrono::DateTime::from_timestamp_millis(created_at)
                                                .map(|dt| dt.to_rfc3339())
                                                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

                                        let mut chat_obj = serde_json::json!({
                                            "id": id,
                                            "title": title,
                                            "project": project,
                                            "model": model,
                                            "timestamp": iso_ts,
                                            "createdAt": created_at,
                                            "updatedAt": updated_at,
                                            "steps": [],
                                            "isRunning": false
                                        });

                                        if let Some(settings) = val.get("settings") {
                                            chat_obj["settings"] = settings.clone();
                                        }
                                        if let Some(standalone_config) = val.get("standaloneConfig")
                                        {
                                            chat_obj["standaloneConfig"] =
                                                standalone_config.clone();
                                        }
                                        if let Some(pinned) = val.get("pinned") {
                                            chat_obj["pinned"] = pinned.clone();
                                        }
                                        if let Some(unread) = val.get("unread") {
                                            chat_obj["unread"] = unread.clone();
                                        }

                                        chats.push(chat_obj);
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
            self.storage_dir
                .join("chats")
                .join(clean_id)
                .join("steps.json"),
            self.storage_dir
                .join("Chats")
                .join(clean_id)
                .join("steps.json"),
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

        // Check project folders
        for dir_name in &["projects", "Projects"] {
            let projects_dir = self.storage_dir.join(dir_name);
            if let Ok(entries) = fs::read_dir(&projects_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let p_steps = path.join("chats").join(clean_id).join("steps.json");
                        if p_steps.exists() {
                            if let Ok(content) = fs::read_to_string(&p_steps) {
                                if let Ok(steps) =
                                    serde_json::from_str::<Vec<serde_json::Value>>(&content)
                                {
                                    return steps;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Check chat.json messages fallback
        let meta_candidates = [
            self.storage_dir
                .join("chats")
                .join(clean_id)
                .join("chat.json"),
            self.storage_dir
                .join("Chats")
                .join(clean_id)
                .join("chat.json"),
            self.storage_dir.join(clean_id).join("chat.json"),
        ];

        for c in &meta_candidates {
            if c.exists() {
                if let Ok(content) = fs::read_to_string(c) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(msgs) = val.get("messages").and_then(|v| v.as_array()) {
                            let steps: Vec<serde_json::Value> = msgs
                                .iter()
                                .map(|m| {
                                    let mut step = m.clone();
                                    let text = if let Some(arr) =
                                        m.get("content").and_then(|c| c.as_array())
                                    {
                                        arr.iter()
                                            .filter_map(|b| {
                                                b.get("text")
                                                    .and_then(|t| t.as_str())
                                                    .or_else(|| {
                                                        b.get("content").and_then(|t| t.as_str())
                                                    })
                                                    .map(|s| s.to_string())
                                            })
                                            .collect::<Vec<_>>()
                                            .join("\n")
                                    } else if let Some(s) =
                                        m.get("content").and_then(|c| c.as_str())
                                    {
                                        s.to_string()
                                    } else {
                                        String::new()
                                    };
                                    step["content"] = serde_json::Value::String(text);
                                    if let Some(role) = m.get("role").and_then(|r| r.as_str()) {
                                        step["type"] = serde_json::Value::String(role.to_string());
                                    }
                                    step
                                })
                                .collect();
                            return steps;
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

    #[test]
    fn test_load_chat_steps_normalizes_content_blocks() {
        let test_dir = std::env::temp_dir().join(format!("test_steps_{}", uuid::Uuid::new_v4()));
        let storage = ChatStorage::with_dir(test_dir.clone());

        let session_id = "test-steps-456".to_string();
        let user_msg = ChatMessage::user("Please download this video");
        let asst_msg = ChatMessage::assistant("I have downloaded the video for you.");
        let session = ChatSession {
            id: session_id.clone(),
            title: "Steps Test".to_string(),
            project: None,
            model: Some("gpt-4o".to_string()),
            created_at: 1000,
            updated_at: 2000,
            messages: vec![user_msg, asst_msg],
        };

        // Save session (which also writes steps.json)
        storage.save_session(&session).unwrap();

        // Check load_chat_steps returns steps with string content
        let steps = storage.load_chat_steps(&session_id);
        assert_eq!(steps.len(), 2);
        assert!(steps[0]["content"].is_string());
        assert_eq!(
            steps[0]["content"].as_str().unwrap(),
            "Please download this video"
        );
        assert!(steps[1]["content"].is_string());
        assert_eq!(
            steps[1]["content"].as_str().unwrap(),
            "I have downloaded the video for you."
        );

        // Now delete steps.json and test fallback to chat.json messages
        let steps_file = test_dir.join("chats").join(&session_id).join("steps.json");
        let _ = fs::remove_file(steps_file);

        let fallback_steps = storage.load_chat_steps(&session_id);
        assert_eq!(fallback_steps.len(), 2);
        assert!(fallback_steps[0]["content"].is_string());
        assert_eq!(
            fallback_steps[0]["content"].as_str().unwrap(),
            "Please download this video"
        );
        assert!(fallback_steps[1]["content"].is_string());
        assert_eq!(
            fallback_steps[1]["content"].as_str().unwrap(),
            "I have downloaded the video for you."
        );

        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn test_sanitize_stored_chat_title_and_persistence() {
        // Leaked Telegram numerical IDs must be sanitized
        let title1 =
            sanitize_stored_chat_title("Telegram Chat 5084960883", Some("Summarize this document"));
        assert_eq!(title1, "Summarize this document");
        assert!(!title1.contains("5084960883"));

        let title2 = sanitize_stored_chat_title("Telegram Chat 5084960883", None);
        assert_eq!(title2, "Telegram Conversation");
        assert!(!title2.contains("5084960883"));

        // Custom normal titles should be preserved
        let normal_title = sanitize_stored_chat_title("My Custom Research Project", Some("Hello"));
        assert_eq!(normal_title, "My Custom Research Project");

        // Verify storage save/load cleans up legacy leaked title on disk
        let test_dir = std::env::temp_dir().join(format!("test_leak_{}", uuid::Uuid::new_v4()));
        let storage = ChatStorage::with_dir(test_dir.clone());

        let session = ChatSession {
            id: "telegram-5084960883".to_string(),
            title: "Telegram Chat 5084960883".to_string(),
            project: None,
            model: Some("gpt-4o".to_string()),
            created_at: 1000,
            updated_at: 2000,
            messages: vec![ChatMessage::user("Download youtube short for me")],
        };

        storage.save_session(&session).unwrap();

        let loaded = storage.load_session("telegram-5084960883").unwrap();
        assert!(!loaded.title.contains("5084960883"));
        assert_eq!(loaded.title, "Download youtube short for me");

        let all_chats = storage.load_all_stored_chats();
        assert_eq!(all_chats.len(), 1);
        let chat_title = all_chats[0]["title"].as_str().unwrap();
        assert!(!chat_title.contains("5084960883"));
        assert_eq!(chat_title, "Download youtube short for me");

        let _ = fs::remove_dir_all(test_dir);
    }
}
