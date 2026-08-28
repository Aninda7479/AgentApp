use std::time::Duration;

use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    Json,
};
use futures_util::stream::Stream;

use crate::orchestrator::AgentEngine;
use crate::server::ipc::record_usage;
use crate::server::state::{AppState, ChatStreamRequest};
use crate::types::{AgentEvent, ModelConfig, ProviderType};

/// Dynamic Workspace Model Resolver
pub fn resolve_active_workspace_model(
    raw_settings: &serde_json::Value,
    settings_store: &crate::storage::SettingsStore,
) -> (ProviderType, String, Option<String>, Option<String>) {
    // 1. Check lastUsedModel in settings
    if let Some(last_used) = raw_settings.get("lastUsedModel").and_then(|v| v.as_str()) {
        if !last_used.is_empty() && last_used != "auto" && last_used != "Orchestrator" {
            if let Some(models) = raw_settings.get("models").and_then(|m| m.as_array()) {
                if let Some(matched) = models.iter().find(|m| {
                    m.get("id").and_then(|v| v.as_str()) == Some(last_used)
                        || m.get("name").and_then(|v| v.as_str()) == Some(last_used)
                }) {
                    let pid = matched.get("providerId").and_then(|v| v.as_str()).unwrap_or("gemini");
                    let id = matched.get("id").and_then(|v| v.as_str()).unwrap_or(last_used);
                    let prefix = format!("{}-", pid);
                    let clean_id = if id.starts_with(&prefix) { &id[prefix.len()..] } else { id };
                    let prov_type = match pid.to_lowercase().as_str() {
                        "gemini" | "google" => ProviderType::Gemini,
                        "openai" => ProviderType::OpenAI,
                        "anthropic" | "claude" => ProviderType::Anthropic,
                        "ollama" => ProviderType::Ollama,
                        "openrouter" => ProviderType::OpenRouter,
                        "deepseek" => ProviderType::DeepSeek,
                        "groq" => ProviderType::Groq,
                        _ => ProviderType::Gemini,
                    };
                    let api_key = settings_store.get_api_key(pid).ok().flatten();
                    return (prov_type, clean_id.to_string(), api_key, None);
                }
            }
        }
    }

    // 2. Check first enabled model in user's workspace settings
    if let Some(models) = raw_settings.get("models").and_then(|m| m.as_array()) {
        if let Some(first_enabled) = models.iter().find(|m| m.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true)) {
            let pid = first_enabled.get("providerId").and_then(|v| v.as_str()).unwrap_or("gemini");
            let id = first_enabled.get("id").and_then(|v| v.as_str()).unwrap_or("gemini-2.5-flash");
            let prefix = format!("{}-", pid);
            let clean_id = if id.starts_with(&prefix) { &id[prefix.len()..] } else { id };
            let prov_type = match pid.to_lowercase().as_str() {
                "gemini" | "google" => ProviderType::Gemini,
                "openai" => ProviderType::OpenAI,
                "anthropic" | "claude" => ProviderType::Anthropic,
                "ollama" => ProviderType::Ollama,
                "openrouter" => ProviderType::OpenRouter,
                "deepseek" => ProviderType::DeepSeek,
                "groq" => ProviderType::Groq,
                _ => ProviderType::Gemini,
            };
            let api_key = settings_store.get_api_key(pid).ok().flatten();
            return (prov_type, clean_id.to_string(), api_key, None);
        }
    }

    // 3. Fallback to Gemini
    (ProviderType::Gemini, "gemini-2.5-flash".to_string(), None, None)
}

pub async fn handle_chat_stream(
    State(state): State<AppState>,
    Json(req): Json<ChatStreamRequest>,
) -> Sse<impl Stream<Item = Result<Event, axum::Error>>> {
    let routed = state.coordinator.route_prompt(&req.prompt).await;

    let target_persona = if let Some(ref pid) = req.persona_id {
        state.persona_store.get(pid).await.unwrap_or(routed.persona)
    } else {
        routed.persona
    };

    let raw_settings = state.settings_store.load_raw().unwrap_or_default();
    let mut model_config = if let Some(p) = req.provider {
        let m_id = req.model_id.clone().unwrap_or_else(|| {
            let (_, default_id, _, _) = resolve_active_workspace_model(&raw_settings, &state.settings_store);
            default_id
        });
        ModelConfig::new(p, m_id)
    } else if req.model_id.is_some() {
        let (prov_type, default_id, _, _) = resolve_active_workspace_model(&raw_settings, &state.settings_store);
        let m_id = req.model_id.clone().unwrap_or(default_id);
        ModelConfig::new(prov_type, m_id)
    } else {
        target_persona.model_config.clone()
    };

    model_config.api_key = req.api_key.or_else(|| {
        state
            .settings_store
            .get_api_key(&format!("{:?}", model_config.provider).to_lowercase())
            .ok()
            .flatten()
    });
    if req.base_url.is_some() {
        model_config.base_url = req.base_url;
    }
    if req.temperature.is_some() {
        model_config.temperature = req.temperature;
    }
    if req.max_tokens.is_some() {
        model_config.max_tokens = req.max_tokens;
    }

    let system_prompt = req
        .system_prompt
        .unwrap_or_else(|| target_persona.system_prompt.clone());
    let prompt_to_run = routed.clean_prompt;

    let mut engine = AgentEngine::new(state.tool_registry.clone());
    engine.set_max_turns(target_persona.max_turns);

    let explicit = routed.explicit_mention;
    let persona_name = target_persona.name.clone();
    let persona_id = target_persona.id.clone();

    let stream = async_stream::stream! {
        let start_time = std::time::Instant::now();
        let mut completion_token_count = 0usize;
        let mut has_error = false;
        let mut total_text_len = 0usize;

        if explicit {
            let handover = AgentEvent::AgentHandover {
                from_persona: "coordinator".to_string(),
                to_persona: persona_id.clone(),
                reason: format!("Routed to specialized agent '{}'", persona_name),
            };
            if let Ok(json_str) = serde_json::to_string(&handover) {
                yield Ok(Event::default().data(json_str));
            }
        }

        match engine.run_loop(&model_config, &system_prompt, &prompt_to_run).await {
            Ok(mut rx) => {
                while let Some(event) = rx.recv().await {
                    if let AgentEvent::Token { ref text } = event {
                        completion_token_count += 1;
                        total_text_len += text.len();
                    } else if let AgentEvent::Error { .. } = event {
                        has_error = true;
                    }
                    if let Ok(json_str) = serde_json::to_string(&event) {
                        yield Ok(Event::default().data(json_str));
                    }
                }
            }
            Err(err) => {
                has_error = true;
                let err_event = AgentEvent::Error { message: err.to_string() };
                if let Ok(json_str) = serde_json::to_string(&err_event) {
                    yield Ok(Event::default().data(json_str));
                }
            }
        }

        let duration_ms = start_time.elapsed().as_millis() as u64;
        let prompt_token_count = std::cmp::max(1, (prompt_to_run.len() + 3) / 4);
        let final_completion_tokens = std::cmp::max(completion_token_count, (total_text_len + 3) / 4);
        record_usage(
            &format!("{:?}", model_config.provider).to_lowercase(),
            &model_config.model_id,
            prompt_token_count,
            final_completion_tokens,
            duration_ms,
            if has_error { "failure" } else { "success" },
        );
    };

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}
