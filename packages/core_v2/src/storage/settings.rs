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
            enable_auth: Some(true),
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
        base.join("config").join("models.json.bak"),
        get_home_dir().join(".superagent").join("config").join("models.json"),
        get_home_dir().join(".superagent").join("Config").join("models.json"),
        get_home_dir().join(".superagent").join("models.json"),
        get_home_dir().join(".superagent").join("config").join("models.json.bak"),
        PathBuf::from(".").join(".superagent").join("config").join("models.json"),
        PathBuf::from(".").join(".superagent").join("models.json"),
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
    /// Recovers from settings.json.bak and models.json.bak if primary is empty or lacks providers.
    pub fn load_raw(&self) -> Result<serde_json::Value> {
        let active_path = &self.file_path;

        let mut settings_val = if active_path.exists() {
            let content = fs::read_to_string(active_path).unwrap_or_default();
            serde_json::from_str::<serde_json::Value>(&content).unwrap_or_else(|_| serde_json::json!({}))
        } else {
            serde_json::json!({})
        };

        // Check if primary settings has configured providers
        let has_providers = settings_val
            .get("providers")
            .and_then(|p| p.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);

        let is_empty = settings_val.as_object().map(|m| m.is_empty()).unwrap_or(true);

        // Fallback to backup settings.json.bak if primary is empty or missing providers
        if is_empty || !has_providers {
            let mut backup_candidates = vec![
                active_path.with_extension("json.bak"),
            ];
            if let Some(parent) = active_path.parent() {
                backup_candidates.push(parent.join("settings.json.bak"));
            }

            let sa_dir = get_superagent_dir();
            if active_path.starts_with(&sa_dir) || active_path.to_string_lossy().contains(".superagent") {
                backup_candidates.push(sa_dir.join("config").join("settings.json.bak"));
                backup_candidates.push(sa_dir.join("Config").join("settings.json.bak"));
                backup_candidates.push(sa_dir.join("settings.json.bak"));
                backup_candidates.push(get_home_dir().join(".superagent").join("config").join("settings.json.bak"));
                backup_candidates.push(get_home_dir().join(".superagent").join("Config").join("settings.json.bak"));
                backup_candidates.push(get_home_dir().join(".superagent").join("settings.json.bak"));
                backup_candidates.push(PathBuf::from(".").join(".superagent").join("config").join("settings.json.bak"));
            }

            for bak in &backup_candidates {
                if bak.exists() {
                    if let Ok(c) = fs::read_to_string(bak) {
                        if let Ok(bak_val) = serde_json::from_str::<serde_json::Value>(&c) {
                            if let Some(bak_map) = bak_val.as_object() {
                                if !bak_map.is_empty() {
                                    if is_empty {
                                        settings_val = bak_val.clone();
                                    } else if !has_providers {
                                        if let Some(bak_providers) = bak_val.get("providers") {
                                            if let Some(settings_map) = settings_val.as_object_mut() {
                                                settings_map.insert("providers".to_string(), bak_providers.clone());
                                            }
                                        }
                                        if settings_val.get("general").is_none() && bak_val.get("general").is_some() {
                                            if let Some(settings_map) = settings_val.as_object_mut() {
                                                settings_map.insert("general".to_string(), bak_val["general"].clone());
                                            }
                                        }
                                        if settings_val.get("lastUsedModel").is_none() && bak_val.get("lastUsedModel").is_some() {
                                            if let Some(settings_map) = settings_val.as_object_mut() {
                                                settings_map.insert("lastUsedModel".to_string(), bak_val["lastUsedModel"].clone());
                                            }
                                        }
                                        if settings_val.get("theme").is_none() && bak_val.get("theme").is_some() {
                                            if let Some(settings_map) = settings_val.as_object_mut() {
                                                settings_map.insert("theme".to_string(), bak_val["theme"].clone());
                                            }
                                        }
                                        if settings_val.get("telegram").is_none() && bak_val.get("telegram").is_some() {
                                            if let Some(settings_map) = settings_val.as_object_mut() {
                                                settings_map.insert("telegram".to_string(), bak_val["telegram"].clone());
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        // If settings is still completely empty, initialize safe default structure
        if settings_val.as_object().map(|m| m.is_empty()).unwrap_or(true) {
            settings_val = serde_json::json!({
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
            });
        }

        // Discover and merge separate models.json / models.json.bak if present
        let config_dir = active_path.parent();
        let mut models_candidates = vec![
            config_dir.map(|p| p.join("models.json")),
            config_dir.map(|p| p.join("models.json.bak")),
        ];

        let sa_dir = get_superagent_dir();
        if active_path.starts_with(&sa_dir) || active_path.to_string_lossy().contains(".superagent") {
            models_candidates.push(Some(sa_dir.join("config").join("models.json")));
            models_candidates.push(Some(sa_dir.join("config").join("models.json.bak")));
            models_candidates.push(Some(get_home_dir().join(".superagent").join("config").join("models.json")));
            models_candidates.push(Some(get_home_dir().join(".superagent").join("config").join("models.json.bak")));
            models_candidates.push(Some(PathBuf::from(".").join(".superagent").join("config").join("models.json")));
        }

        let mut models_val: Option<serde_json::Value> = None;
        for opt_p in &models_candidates {
            if let Some(p) = opt_p {
                if p.exists() {
                    if let Ok(c) = fs::read_to_string(p) {
                        if let Ok(m_json) = serde_json::from_str::<serde_json::Value>(&c) {
                            if m_json.is_array() && !m_json.as_array().unwrap().is_empty() {
                                models_val = Some(m_json);
                                break;
                            } else if let Some(m_arr) = m_json.get("models") {
                                if m_arr.is_array() && !m_arr.as_array().unwrap().is_empty() {
                                    models_val = Some(m_arr.clone());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(m_val) = models_val {
            if let Some(map) = settings_val.as_object_mut() {
                if !map.contains_key("models") || map.get("models").and_then(|m| m.as_array()).map_or(true, |a| a.is_empty()) {
                    map.insert("models".to_string(), m_val);
                }
            }
        }

        // Ensure setupState.completed is true whenever providers array is configured
        if let Some(providers_arr) = settings_val.get("providers").and_then(|p| p.as_array()) {
            if !providers_arr.is_empty() {
                if let Some(map) = settings_val.as_object_mut() {
                    let general = map.entry("general".to_string()).or_insert_with(|| serde_json::json!({}));
                    if let Some(gen_map) = general.as_object_mut() {
                        let setup_state = gen_map.entry("setupState".to_string()).or_insert_with(|| serde_json::json!({}));
                        if let Some(ss_map) = setup_state.as_object_mut() {
                            ss_map.insert("completed".to_string(), serde_json::Value::Bool(true));
                        }
                    }
                }
            }
        }

        Ok(settings_val)
    }

    /// Persists raw JSON value preserving all fields and schema formatting.
    /// Automatically handles backup files and separate models.json storage.
    pub fn save_raw(&self, val: &serde_json::Value) -> Result<()> {
        let target_path = &self.file_path;

        if let Some(parent) = target_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }

        let mut settings_to_write = val.clone();

        // Extract models if present and save separately to models.json / models.json.bak
        if let Some(map) = settings_to_write.as_object_mut() {
            if let Some(models) = map.remove("models") {
                if let Some(config_dir) = target_path.parent() {
                    let models_path = config_dir.join("models.json");
                    let models_bak_path = config_dir.join("models.json.bak");
                    if let Ok(models_str) = serde_json::to_string_pretty(&models) {
                        if models_path.exists() {
                            let _ = fs::copy(&models_path, &models_bak_path);
                        }
                        let _ = fs::write(&models_path, &models_str);
                    }
                }
            }
        }

        let json = serde_json::to_string_pretty(&settings_to_write)?;

        // Create a backup copy before overwriting
        let bak_path = target_path.with_extension("json.bak");
        if target_path.exists() {
            let _ = fs::copy(target_path, &bak_path);
        }

        fs::write(target_path, json)?;
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

    #[test]
    fn test_backup_recovery_and_setup_completed() {
        let test_dir = std::env::temp_dir().join(format!("test_settings_bak_{}", uuid::Uuid::new_v4()));
        let config_dir = test_dir.join("config");
        fs::create_dir_all(&config_dir).unwrap();

        let file_path = config_dir.join("settings.json");
        let bak_path = config_dir.join("settings.json.bak");

        // Create empty settings.json (the issue user had)
        fs::write(&file_path, "{}").unwrap();

        // Create full backup file with providers and ownerName
        let bak_content = serde_json::json!({
            "providers": [
                {
                    "id": "ollama",
                    "name": "Ollama",
                    "type": "local"
                },
                {
                    "id": "groq",
                    "name": "Groq",
                    "apiKey": "gsk_test_key"
                }
            ],
            "lastUsedModel": {
                "provider": "groq",
                "model": "llama-3.3-70b-versatile"
            },
            "ownerName": "Aninda"
        });
        fs::write(&bak_path, serde_json::to_string_pretty(&bak_content).unwrap()).unwrap();

        let store = SettingsStore::with_path(file_path);
        let raw = store.load_raw().unwrap();

        // Check that providers were recovered from .bak
        let providers = raw["providers"].as_array().unwrap();
        assert_eq!(providers.len(), 2);
        assert_eq!(providers[0]["id"], "ollama");
        assert_eq!(providers[1]["id"], "groq");

        // Check that setupState.completed was automatically set to true
        assert_eq!(raw["general"]["setupState"]["completed"], true);

        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn test_models_separation_and_merge() {
        let test_dir = std::env::temp_dir().join(format!("test_settings_models_{}", uuid::Uuid::new_v4()));
        let config_dir = test_dir.join("config");
        fs::create_dir_all(&config_dir).unwrap();

        let file_path = config_dir.join("settings.json");
        let models_path = config_dir.join("models.json");

        // Write models.json directly
        let models_data = serde_json::json!([
            { "id": "m1", "name": "Model 1", "provider": "openai" },
            { "id": "m2", "name": "Model 2", "provider": "anthropic" }
        ]);
        fs::write(&models_path, serde_json::to_string_pretty(&models_data).unwrap()).unwrap();

        // Write settings without models
        fs::write(&file_path, serde_json::json!({ "providers": [{ "id": "openai" }] }).to_string()).unwrap();

        let store = SettingsStore::with_path(file_path.clone());
        let raw = store.load_raw().unwrap();

        // Verify models were merged into raw
        assert_eq!(raw["models"].as_array().unwrap().len(), 2);

        // Save raw (with models included) and verify models.json is updated separately
        store.save_raw(&raw).unwrap();
        assert!(models_path.exists());
        assert!(config_dir.join("models.json.bak").exists());

        let _ = fs::remove_dir_all(test_dir);
    }
}

