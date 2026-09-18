use serde_json::Value;
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelItem {
    pub provider: String,
    pub model_id: String,
    pub display_name: String,
    pub context_window: String,
    pub capabilities: Vec<String>,
    pub is_custom: bool,
    pub is_local: bool,
}

#[derive(Debug, Clone)]
pub struct ModelPickerState {
    pub models: Vec<ModelItem>,
    pub selected_index: usize,
}

impl Default for ModelPickerState {
    fn default() -> Self {
        Self::new()
    }
}

impl ModelPickerState {
    pub fn new() -> Self {
        let models = load_models_catalog();
        Self {
            models,
            selected_index: 0,
        }
    }

    pub fn next(&mut self) {
        if !self.models.is_empty() {
            self.selected_index = (self.selected_index + 1) % self.models.len();
        }
    }

    pub fn previous(&mut self) {
        if !self.models.is_empty() {
            self.selected_index = if self.selected_index == 0 {
                self.models.len() - 1
            } else {
                self.selected_index - 1
            };
        }
    }

    pub fn selected(&self) -> Option<&ModelItem> {
        self.models.get(self.selected_index)
    }
}

/// Checks whether a given provider has an active API key or runner available.
pub fn is_provider_connected(provider: &str, raw_settings: &Value) -> bool {
    let p_lower = provider.to_lowercase();
    match p_lower.as_str() {
        "opencode" => true,
        "ollama" => {
            superagent_core_v2::server::routes::system::check_ollama_port_listening()
                || superagent_core_v2::server::routes::system::get_ollama_models_dir().is_some()
        }
        "openai" => {
            std::env::var("OPENAI_API_KEY")
                .map(|k| !k.trim().is_empty())
                .unwrap_or(false)
                || has_setting_key(raw_settings, "openai")
        }
        "anthropic" => {
            std::env::var("ANTHROPIC_API_KEY")
                .map(|k| !k.trim().is_empty())
                .unwrap_or(false)
                || has_setting_key(raw_settings, "anthropic")
        }
        "gemini" | "google" => {
            std::env::var("GEMINI_API_KEY")
                .map(|k| !k.trim().is_empty())
                .unwrap_or(false)
                || std::env::var("GOOGLE_API_KEY")
                    .map(|k| !k.trim().is_empty())
                    .unwrap_or(false)
                || has_setting_key(raw_settings, "gemini")
                || has_setting_key(raw_settings, "google")
        }
        "deepseek" => {
            std::env::var("DEEPSEEK_API_KEY")
                .map(|k| !k.trim().is_empty())
                .unwrap_or(false)
                || has_setting_key(raw_settings, "deepseek")
        }
        "groq" => {
            std::env::var("GROQ_API_KEY")
                .map(|k| !k.trim().is_empty())
                .unwrap_or(false)
                || has_setting_key(raw_settings, "groq")
        }
        "openrouter" => {
            std::env::var("OPENROUTER_API_KEY")
                .map(|k| !k.trim().is_empty())
                .unwrap_or(false)
                || has_setting_key(raw_settings, "openrouter")
        }
        other => has_setting_key(raw_settings, other),
    }
}

fn has_setting_key(settings: &Value, provider_id: &str) -> bool {
    if let Some(api_keys) = settings.get("api_keys").and_then(|v| v.as_object()) {
        if let Some(k) = api_keys.get(provider_id).and_then(|v| v.as_str()) {
            if !k.trim().is_empty() {
                return true;
            }
        }
    }
    if let Some(providers) = settings.get("providers").and_then(|v| v.as_array()) {
        for p in providers {
            let pid = p.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if pid.eq_ignore_ascii_case(provider_id) {
                if let Some(key) = p.get("apiKey").and_then(|v| v.as_str()) {
                    if !key.trim().is_empty() {
                        return true;
                    }
                }
            }
        }
    }
    false
}

/// Dynamically loads the model catalog by:
/// 1. Reading user-configured models from settings.json / models.json
/// 2. Scanning local Ollama models on disk
/// 3. Populating curated default models for supported providers
/// 4. Deduplicating by (provider, model_id)
pub fn load_models_catalog() -> Vec<ModelItem> {
    let mut catalog: Vec<ModelItem> = Vec::new();
    let mut seen: HashSet<(String, String)> = HashSet::new();

    let settings = superagent_core_v2::storage::SettingsStore::new()
        .load_raw()
        .unwrap_or_default();

    // 1. Load user-configured models from settings.json or models.json
    if let Some(models_arr) = settings.get("models").and_then(|m| m.as_array()) {
        for m in models_arr {
            let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
            let provider = m
                .get("providerId")
                .or_else(|| m.get("provider"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if id.is_empty() || provider.is_empty() {
                continue;
            }
            let name = m.get("name").and_then(|v| v.as_str()).unwrap_or(id).trim();
            let ctx = m
                .get("contextLimit")
                .or_else(|| m.get("context_window"))
                .and_then(|v| v.as_str())
                .unwrap_or("128k");
            let mut caps = Vec::new();
            if let Some(caps_arr) = m
                .get("capabilities")
                .or_else(|| m.get("inputModalities"))
                .and_then(|v| v.as_array())
            {
                for c in caps_arr {
                    if let Some(cs) = c.as_str() {
                        caps.push(cs.to_string());
                    }
                }
            }
            if caps.is_empty() {
                caps.push("tools".to_string());
            }

            let provider_norm = match provider.to_lowercase().as_str() {
                "google" => "gemini".to_string(),
                "claude" => "anthropic".to_string(),
                "chatgpt" => "openai".to_string(),
                other => other.to_string(),
            };

            let key = (provider_norm.clone(), id.to_lowercase());
            if !seen.contains(&key) {
                seen.insert(key);
                catalog.push(ModelItem {
                    provider: provider_norm.clone(),
                    model_id: id.to_string(),
                    display_name: name.to_string(),
                    context_window: format!("{} ctx", ctx),
                    capabilities: caps,
                    is_custom: true,
                    is_local: provider_norm == "ollama",
                });
            }
        }
    }

    // 2. Scan local Ollama models on disk
    let local_ollama = superagent_core_v2::server::routes::system::scan_ollama_models_from_disk();
    let mut found_local_ollama = false;
    for o_model in local_ollama {
        if let Some(name) = o_model.get("name").and_then(|v| v.as_str()) {
            let name_clean = name.trim();
            if name_clean.is_empty() {
                continue;
            }
            let size_bytes = o_model
                .get("sizeBytes")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let ctx_str = if size_bytes > 0 {
                format!("{} on disk", crate::attachments::format_bytes(size_bytes))
            } else {
                "Local model".to_string()
            };

            let key = ("ollama".to_string(), name_clean.to_lowercase());
            if !seen.contains(&key) {
                seen.insert(key);
                found_local_ollama = true;
                catalog.push(ModelItem {
                    provider: "ollama".to_string(),
                    model_id: name_clean.to_string(),
                    display_name: format!("{} (Local)", name_clean),
                    context_window: ctx_str,
                    capabilities: vec!["local".to_string(), "offline".to_string()],
                    is_custom: false,
                    is_local: true,
                });
            }
        }
    }

    // 3. Curated built-in defaults
    let defaults = get_curated_default_models(found_local_ollama);
    for item in defaults {
        let key = (item.provider.to_lowercase(), item.model_id.to_lowercase());
        if !seen.contains(&key) {
            seen.insert(key);
            catalog.push(item);
        }
    }

    catalog
}

fn get_curated_default_models(skip_ollama_defaults: bool) -> Vec<ModelItem> {
    let mut models = vec![
        // OpenAI
        ModelItem {
            provider: "openai".to_string(),
            model_id: "gpt-4o".to_string(),
            display_name: "GPT-4o (Omni)".to_string(),
            context_window: "128k ctx".to_string(),
            capabilities: vec![
                "vision".to_string(),
                "tools".to_string(),
                "fast".to_string(),
            ],
            is_custom: false,
            is_local: false,
        },
        ModelItem {
            provider: "openai".to_string(),
            model_id: "gpt-4o-mini".to_string(),
            display_name: "GPT-4o Mini".to_string(),
            context_window: "128k ctx".to_string(),
            capabilities: vec!["fast".to_string(), "cheap".to_string(), "tools".to_string()],
            is_custom: false,
            is_local: false,
        },
        ModelItem {
            provider: "openai".to_string(),
            model_id: "o1".to_string(),
            display_name: "o1 (Deep Reasoning)".to_string(),
            context_window: "200k ctx".to_string(),
            capabilities: vec![
                "reasoning".to_string(),
                "math".to_string(),
                "coding".to_string(),
            ],
            is_custom: false,
            is_local: false,
        },
        ModelItem {
            provider: "openai".to_string(),
            model_id: "o3-mini".to_string(),
            display_name: "o3-mini (Reasoning)".to_string(),
            context_window: "200k ctx".to_string(),
            capabilities: vec![
                "reasoning".to_string(),
                "tools".to_string(),
                "math".to_string(),
            ],
            is_custom: false,
            is_local: false,
        },
        // Anthropic
        ModelItem {
            provider: "anthropic".to_string(),
            model_id: "claude-3-7-sonnet".to_string(),
            display_name: "Claude 3.7 Sonnet (Hybrid)".to_string(),
            context_window: "200k ctx".to_string(),
            capabilities: vec![
                "coding".to_string(),
                "reasoning".to_string(),
                "tools".to_string(),
            ],
            is_custom: false,
            is_local: false,
        },
        ModelItem {
            provider: "anthropic".to_string(),
            model_id: "claude-3-5-sonnet-20241022".to_string(),
            display_name: "Claude 3.5 Sonnet".to_string(),
            context_window: "200k ctx".to_string(),
            capabilities: vec![
                "coding".to_string(),
                "vision".to_string(),
                "tools".to_string(),
            ],
            is_custom: false,
            is_local: false,
        },
        ModelItem {
            provider: "anthropic".to_string(),
            model_id: "claude-3-5-haiku-20241022".to_string(),
            display_name: "Claude 3.5 Haiku".to_string(),
            context_window: "200k ctx".to_string(),
            capabilities: vec!["fast".to_string(), "tools".to_string()],
            is_custom: false,
            is_local: false,
        },
        // Google Gemini
        ModelItem {
            provider: "gemini".to_string(),
            model_id: "gemini-2.5-flash".to_string(),
            display_name: "Gemini 2.5 Flash".to_string(),
            context_window: "1M ctx".to_string(),
            capabilities: vec![
                "ultra-fast".to_string(),
                "multimodal".to_string(),
                "tools".to_string(),
            ],
            is_custom: false,
            is_local: false,
        },
        ModelItem {
            provider: "gemini".to_string(),
            model_id: "gemini-2.5-pro".to_string(),
            display_name: "Gemini 2.5 Pro".to_string(),
            context_window: "2M ctx".to_string(),
            capabilities: vec![
                "massive-context".to_string(),
                "reasoning".to_string(),
                "tools".to_string(),
            ],
            is_custom: false,
            is_local: false,
        },
        ModelItem {
            provider: "gemini".to_string(),
            model_id: "gemini-2.0-flash".to_string(),
            display_name: "Gemini 2.0 Flash".to_string(),
            context_window: "1M ctx".to_string(),
            capabilities: vec!["ultra-fast".to_string(), "multimodal".to_string()],
            is_custom: false,
            is_local: false,
        },
        ModelItem {
            provider: "gemini".to_string(),
            model_id: "gemini-1.5-pro".to_string(),
            display_name: "Gemini 1.5 Pro".to_string(),
            context_window: "2M ctx".to_string(),
            capabilities: vec!["massive-context".to_string(), "reasoning".to_string()],
            is_custom: false,
            is_local: false,
        },
        // DeepSeek
        ModelItem {
            provider: "deepseek".to_string(),
            model_id: "deepseek-chat".to_string(),
            display_name: "DeepSeek V3".to_string(),
            context_window: "64k ctx".to_string(),
            capabilities: vec![
                "coding".to_string(),
                "tools".to_string(),
                "fast".to_string(),
            ],
            is_custom: false,
            is_local: false,
        },
        ModelItem {
            provider: "deepseek".to_string(),
            model_id: "deepseek-reasoner".to_string(),
            display_name: "DeepSeek R1 (Reasoning)".to_string(),
            context_window: "64k ctx".to_string(),
            capabilities: vec!["deep-thinking".to_string(), "math".to_string()],
            is_custom: false,
            is_local: false,
        },
        // Groq
        ModelItem {
            provider: "groq".to_string(),
            model_id: "llama-3.3-70b-versatile".to_string(),
            display_name: "Llama 3.3 70B (Groq)".to_string(),
            context_window: "128k ctx".to_string(),
            capabilities: vec!["realtime-speed".to_string()],
            is_custom: false,
            is_local: false,
        },
        // OpenCode (Free Tier)
        ModelItem {
            provider: "opencode".to_string(),
            model_id: "big-pickle".to_string(),
            display_name: "Big Pickle (OpenCode Free)".to_string(),
            context_window: "200k ctx".to_string(),
            capabilities: vec![
                "free".to_string(),
                "reasoning".to_string(),
                "coding".to_string(),
            ],
            is_custom: false,
            is_local: false,
        },
        // OpenRouter
        ModelItem {
            provider: "openrouter".to_string(),
            model_id: "openrouter/auto".to_string(),
            display_name: "OpenRouter Auto".to_string(),
            context_window: "128k ctx".to_string(),
            capabilities: vec!["router".to_string(), "multi-provider".to_string()],
            is_custom: false,
            is_local: false,
        },
    ];

    if !skip_ollama_defaults {
        models.push(ModelItem {
            provider: "ollama".to_string(),
            model_id: "qwen2.5-coder".to_string(),
            display_name: "Qwen 2.5 Coder (Local)".to_string(),
            context_window: "32k ctx".to_string(),
            capabilities: vec![
                "local".to_string(),
                "offline".to_string(),
                "coding".to_string(),
            ],
            is_custom: false,
            is_local: true,
        });
        models.push(ModelItem {
            provider: "ollama".to_string(),
            model_id: "llama3".to_string(),
            display_name: "Llama 3 (Local)".to_string(),
            context_window: "8k ctx".to_string(),
            capabilities: vec!["local".to_string(), "offline".to_string()],
            is_custom: false,
            is_local: true,
        });
    }

    models
}
