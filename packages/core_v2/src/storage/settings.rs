use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserSettings {
    #[serde(default = "default_provider")]
    pub default_provider: String,
    #[serde(default = "default_model")]
    pub default_model: String,
    #[serde(default = "default_server_port")]
    pub server_port: u16,
    #[serde(default)]
    pub api_keys: HashMap<String, String>,
    #[serde(default)]
    pub enable_auth: Option<bool>,
}

fn default_provider() -> String {
    "openai".to_string()
}

fn default_model() -> String {
    "gpt-4o".to_string()
}

fn default_server_port() -> u16 {
    1469
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            default_provider: default_provider(),
            default_model: default_model(),
            server_port: default_server_port(),
            api_keys: HashMap::new(),
            enable_auth: Some(false),
        }
    }
}

pub fn get_home_dir() -> PathBuf {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Returns the primary SuperAgent user data directory (~/.superagent).
/// Checks environment overrides (SUPERAGENT_USER_DATA_DIR, SUPERAGENT_DATA_DIR)
/// and local workspace directories.
pub fn get_superagent_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("SUPERAGENT_USER_DATA_DIR") {
        let p = PathBuf::from(dir);
        if p.exists() {
            return p;
        }
    }
    if let Ok(dir) = std::env::var("SUPERAGENT_DATA_DIR") {
        let p = PathBuf::from(dir);
        if p.exists() {
            return p;
        }
    }

    let home = get_home_dir();
    let home_superagent = home.join(".superagent");

    // If ~/.superagent exists, use it
    if home_superagent.exists() {
        return home_superagent;
    }

    // Check current working directory or workspace for .superagent
    let cwd_superagent = PathBuf::from(".").join(".superagent");
    if cwd_superagent.exists() {
        return cwd_superagent;
    }

    home_superagent
}

/// Discovers the active settings.json file path across standard candidate locations.
pub fn resolve_settings_file_path(base_dir: Option<&Path>) -> PathBuf {
    let base = match base_dir {
        Some(d) => d.to_path_buf(),
        None => get_superagent_dir(),
    };

    let candidates = [
        base.join("config").join("settings.json"),
        base.join("Config").join("settings.json"),
        base.join("settings.json"),
        get_home_dir().join(".superagent").join("config").join("settings.json"),
        get_home_dir().join(".superagent").join("Config").join("settings.json"),
        get_home_dir().join(".superagent").join("settings.json"),
        PathBuf::from(".").join(".superagent").join("config").join("settings.json"),
        PathBuf::from(".").join(".superagent").join("settings.json"),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return candidate.clone();
        }
    }

    // Default target for new writes: <base>/config/settings.json
    base.join("config").join("settings.json")
}

/// Discovers the models.json file path across candidate locations.
pub fn resolve_models_file_path(base_dir: Option<&Path>) -> Option<PathBuf> {
    let base = match base_dir {
        Some(d) => d.to_path_buf(),
        None => get_superagent_dir(),
    };

    let candidates = [
        base.join("config").join("models.json"),
        base.join("Config").join("models.json"),
        base.join("models.json"),
        get_home_dir().join(".superagent").join("config").join("models.json"),
        get_home_dir().join(".superagent").join("Config").join("models.json"),
        get_home_dir().join(".superagent").join("models.json"),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return Some(candidate.clone());
        }
    }

    None
}

#[derive(Debug, Clone)]
pub struct SettingsStore {
    file_path: PathBuf,
}

impl SettingsStore {
    pub fn new() -> Self {
        Self::with_path(resolve_settings_file_path(None))
    }

    pub fn with_path(file_path: PathBuf) -> Self {
        Self { file_path }
    }

    /// Loads the raw JSON value representing full application settings.
    /// Merges separate models.json if present, perfectly matching @superagent/core.
    pub fn load_raw(&self) -> Result<serde_json::Value> {
        let active_path = &self.file_path;

        let mut settings_val = if active_path.exists() {

            let content = fs::read_to_string(&active_path)?;
            serde_json::from_str::<serde_json::Value>(&content).unwrap_or_else(|_| serde_json::json!({}))
        } else {
            serde_json::json!({
                "general": {
                    "workMode": "coding",
                    "confirmShellCommands": true,
                    "autoReviewPlan": true,
                    "setupState": {
                        "completed": false,
                        "version": 1,
                        "completedSteps": []
                    }
                },
                "providers": [],
                "models": []
            })
        };

        // If settings has no models array or it is empty, check for external models.json
        if let Some(models_path) = resolve_models_file_path(active_path.parent().and_then(|p| p.parent())) {
            if let Ok(models_content) = fs::read_to_string(&models_path) {
                if let Ok(models_json) = serde_json::from_str::<serde_json::Value>(&models_content) {
                    if let Some(map) = settings_val.as_object_mut() {
                        if !map.contains_key("models") || map.get("models").and_then(|m| m.as_array()).map_or(true, |a| a.is_empty()) {
                            if models_json.is_array() {
                                map.insert("models".to_string(), models_json);
                            } else if let Some(m_arr) = models_json.get("models") {
                                map.insert("models".to_string(), m_arr.clone());
                            }
                        }
                    }
                }
            }
        }

        Ok(settings_val)
    }

    /// Persists raw JSON value preserving all fields and schema formatting.
    pub fn save_raw(&self, val: &serde_json::Value) -> Result<()> {
        let target_path = &self.file_path;

        if let Some(parent) = target_path.parent() {

            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }

        let json = serde_json::to_string_pretty(val)?;
        fs::write(&target_path, json)?;
        Ok(())
    }

    /// Loads typed UserSettings while extracting keys from providers array if present.
    pub fn load(&self) -> Result<UserSettings> {
        let raw = self.load_raw()?;
        let mut settings = UserSettings::default();

        if let Some(dp) = raw.get("default_provider").and_then(|v| v.as_str()) {
            settings.default_provider = dp.to_string();
        } else if let Some(last_used) = raw.get("lastUsedModel").and_then(|v| v.get("provider")).and_then(|v| v.as_str()) {
            settings.default_provider = last_used.to_string();
        }

        if let Some(dm) = raw.get("default_model").and_then(|v| v.as_str()) {
            settings.default_model = dm.to_string();
        } else if let Some(last_used) = raw.get("lastUsedModel").and_then(|v| v.get("model")).and_then(|v| v.as_str()) {
            settings.default_model = last_used.to_string();
        }

        if let Some(port) = raw.get("server_port").and_then(|v| v.as_u64()) {
            settings.server_port = port as u16;
        } else if let Some(port) = raw.get("webApp").and_then(|v| v.get("port")).and_then(|v| v.as_u64()) {
            settings.server_port = port as u16;
        }

        if let Some(enable_auth) = raw.get("enable_auth").and_then(|v| v.as_bool()) {
            settings.enable_auth = Some(enable_auth);
        }

        // Extract API keys from both root api_keys map and providers array
        if let Some(api_keys) = raw.get("api_keys").and_then(|v| v.as_object()) {
            for (k, v) in api_keys {
                if let Some(s) = v.as_str() {
                    settings.api_keys.insert(k.clone(), s.to_string());
                }
            }
        }
        if let Some(providers) = raw.get("providers").and_then(|v| v.as_array()) {
            for p in providers {
                if let (Some(id), Some(key)) = (p.get("id").and_then(|v| v.as_str()), p.get("apiKey").and_then(|v| v.as_str())) {
                    if !key.is_empty() {
                        settings.api_keys.insert(id.to_string(), key.to_string());
                    }
                }
            }
        }

        Ok(settings)
    }

    /// Saves typed UserSettings by merging them into existing raw settings to avoid dropping metadata.
    pub fn save(&self, settings: &UserSettings) -> Result<()> {
        let mut raw = self.load_raw().unwrap_or_else(|_| serde_json::json!({}));
        if let Some(map) = raw.as_object_mut() {
            map.insert("default_provider".to_string(), serde_json::Value::String(settings.default_provider.clone()));
            map.insert("default_model".to_string(), serde_json::Value::String(settings.default_model.clone()));
            map.insert("server_port".to_string(), serde_json::json!(settings.server_port));
            map.insert("api_keys".to_string(), serde_json::json!(settings.api_keys));
            if let Some(enable_auth) = settings.enable_auth {
                map.insert("enable_auth".to_string(), serde_json::Value::Bool(enable_auth));
            }
        }
        self.save_raw(&raw)
    }

    pub fn get_api_key(&self, provider: &str) -> Result<Option<String>> {
        let settings = self.load()?;
        Ok(settings.api_keys.get(provider).cloned())
    }

    pub fn set_api_key(&self, provider: &str, key: &str) -> Result<()> {
        let mut raw = self.load_raw().unwrap_or_else(|_| serde_json::json!({}));
        
        // Update both root api_keys and providers array
        if let Some(map) = raw.as_object_mut() {
            let api_keys_entry = map.entry("api_keys".to_string()).or_insert_with(|| serde_json::json!({}));
            if let Some(keys_map) = api_keys_entry.as_object_mut() {
                keys_map.insert(provider.to_string(), serde_json::Value::String(key.to_string()));
            }

            if let Some(providers) = map.get_mut("providers").and_then(|v| v.as_array_mut()) {
                let mut found = false;
                for p in providers.iter_mut() {
                    if p.get("id").and_then(|v| v.as_str()) == Some(provider) {
                        if let Some(p_obj) = p.as_object_mut() {
                            p_obj.insert("apiKey".to_string(), serde_json::Value::String(key.to_string()));
                            found = true;
                            break;
                        }
                    }
                }
                if !found {
                    providers.push(serde_json::json!({
                        "id": provider,
                        "name": provider,
                        "type": "key",
                        "apiKey": key,
                        "baseUrl": ""
                    }));
                }
            }
        }

        self.save_raw(&raw)
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
        assert_eq!(settings.server_port, 1469);
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

