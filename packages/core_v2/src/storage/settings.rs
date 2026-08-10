use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserSettings {
    pub default_provider: String,
    pub default_model: String,
    pub server_port: u16,
    pub api_keys: HashMap<String, String>,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            default_provider: "openai".to_string(),
            default_model: "gpt-4o".to_string(),
            server_port: 8080,
            api_keys: HashMap::new(),
        }
    }
}

pub fn get_home_dir() -> PathBuf {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn get_superagent_dir() -> PathBuf {
    get_home_dir().join(".superagent")
}

#[derive(Debug, Clone)]
pub struct SettingsStore {
    file_path: PathBuf,
}

impl SettingsStore {
    pub fn new() -> Self {
        Self::with_path(get_superagent_dir().join("settings.json"))
    }

    pub fn with_path(file_path: PathBuf) -> Self {
        Self { file_path }
    }

    pub fn load(&self) -> Result<UserSettings> {
        if !self.file_path.exists() {
            return Ok(UserSettings::default());
        }
        let content = fs::read_to_string(&self.file_path)?;
        let settings: UserSettings = serde_json::from_str(&content)?;
        Ok(settings)
    }

    pub fn save(&self, settings: &UserSettings) -> Result<()> {
        if let Some(parent) = self.file_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }
        let json = serde_json::to_string_pretty(settings)?;
        fs::write(&self.file_path, json)?;
        Ok(())
    }

    pub fn get_api_key(&self, provider: &str) -> Result<Option<String>> {
        let settings = self.load()?;
        Ok(settings.api_keys.get(provider).cloned())
    }

    pub fn set_api_key(&self, provider: &str, key: &str) -> Result<()> {
        let mut settings = self.load()?;
        settings.api_keys.insert(provider.to_string(), key.to_string());
        self.save(&settings)
    }
}

impl Default for SettingsStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_load_default() {
        let test_dir = std::env::temp_dir().join(format!("test_settings_{}", uuid::Uuid::new_v4()));
        let file_path = test_dir.join("settings.json");
        let store = SettingsStore::with_path(file_path);

        let settings = store.load().unwrap();
        assert_eq!(settings.default_provider, "openai");
        assert_eq!(settings.default_model, "gpt-4o");
        assert_eq!(settings.server_port, 8080);
        assert!(settings.api_keys.is_empty());
    }

    #[test]
    fn test_settings_save_and_load() {
        let test_dir = std::env::temp_dir().join(format!("test_settings_{}", uuid::Uuid::new_v4()));
        let file_path = test_dir.join("settings.json");
        let store = SettingsStore::with_path(file_path);

        let mut settings = UserSettings::default();
        settings.default_provider = "anthropic".to_string();
        settings.default_model = "claude-3-5-sonnet-20241022".to_string();
        settings.server_port = 3000;
        settings.api_keys.insert("anthropic".to_string(), "sk-ant-test".to_string());

        store.save(&settings).unwrap();

        let loaded = store.load().unwrap();
        assert_eq!(loaded, settings);

        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn test_api_key_get_and_set() {
        let test_dir = std::env::temp_dir().join(format!("test_settings_{}", uuid::Uuid::new_v4()));
        let file_path = test_dir.join("settings.json");
        let store = SettingsStore::with_path(file_path);

        assert_eq!(store.get_api_key("openai").unwrap(), None);

        store.set_api_key("openai", "sk-openai-key").unwrap();
        assert_eq!(store.get_api_key("openai").unwrap(), Some("sk-openai-key".to_string()));

        let _ = fs::remove_dir_all(test_dir);
    }
}
