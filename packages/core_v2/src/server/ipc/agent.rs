use std::path::PathBuf;
use std::sync::Arc;

use axum::{http::StatusCode, Json};

use crate::automation::{
    BrowserNavigateTool, BrowserScreenshotTool, WebSearchTool,
};
use crate::media::{GeneratePdfTool, GeneratePresentationTool};
use crate::orchestrator::{AgentEngine, SubagentRunner};
use crate::server::ipc::usage::record_usage;
use crate::server::routes::chat::resolve_active_workspace_model;
use crate::server::state::{AppState, SessionStateEntry};
use crate::storage::settings::get_superagent_dir;
use crate::tools::builtin::{
    EditFileTool, GrepSearchTool, ListDirTool, ReadFileTool, RunCommandTool, RunSubagentTool,
    WriteFileTool,
};
use crate::tools::ToolRegistry;
use crate::types::{ModelConfig, ProviderType};

pub async fn handle_agent_channel(
    ch: &str,
    state: &AppState,
    args: Vec<serde_json::Value>,
) -> Option<Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)>> {
    match ch {
        "agent-run" => {
            let arg = match args.first() {
                Some(a) => a,
                None => {
                    return Some(Err((
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({
                            "error": "Channel \"agent-run\" requires a payload argument."
                        })),
                    )));
                }
            };

            let session_id = arg
                .get("sessionId")
                .and_then(|v| v.as_str())
                .unwrap_or("default-session")
                .to_string();
            let prompt = arg.get("prompt").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let config_val = arg.get("config").cloned().unwrap_or_else(|| serde_json::json!({}));

            let mut provider_str = config_val
                .get("provider")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut model_str = config_val
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut api_key = config_val
                .get("apiKey")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            let mut base_url = config_val
                .get("baseUrl")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            let instructions = config_val
                .get("instructions")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let raw_settings = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));

            // If model is Orchestrator, auto, or empty, resolve first enabled from settings
            if model_str.is_empty() || model_str == "Orchestrator" || model_str == "auto" || model_str == "Model Governance" {
                if let Some(models) = raw_settings.get("models").and_then(|m| m.as_array()) {
                    if let Some(first_enabled) = models.iter().find(|m| m.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false)) {
                        if let Some(id) = first_enabled.get("id").and_then(|v| v.as_str()) {
                            model_str = id.to_string();
                        }
                        if let Some(pid) = first_enabled.get("providerId").and_then(|v| v.as_str()) {
                            provider_str = pid.to_string();
                        }
                    }
                }
            }

            // Check settings models list to resolve display names or provider prefix
            if let Some(models) = raw_settings.get("models").and_then(|m| m.as_array()) {
                if let Some(match_model) = models.iter().find(|m| {
                    m.get("name").and_then(|v| v.as_str()) == Some(&model_str)
                        || m.get("id").and_then(|v| v.as_str()) == Some(&model_str)
                }) {
                    if let Some(pid) = match_model.get("providerId").and_then(|v| v.as_str()) {
                        provider_str = pid.to_string();
                    }
                    if let Some(id) = match_model.get("id").and_then(|v| v.as_str()) {
                        model_str = id.to_string();
                    }
                }
            }

            // Strip provider prefix from model if present (e.g. "gemini-gemini-1.5-pro" -> "gemini-1.5-pro")
            if !provider_str.is_empty() {
                let prefix = format!("{}-", provider_str);
                if model_str.starts_with(&prefix) {
                    model_str = model_str[prefix.len()..].to_string();
                }
            }

            // Fallback API key and baseUrl from settings providers
            if !provider_str.is_empty() {
                if let Some(providers) = raw_settings.get("providers").and_then(|p| p.as_array()) {
                    if let Some(prov) = providers.iter().find(|p| {
                        let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        id == provider_str || (provider_str == "gemini" && id == "google") || (provider_str == "google" && id == "gemini")
                    }) {
                        if api_key.is_none() {
                            if let Some(key) = prov.get("apiKey").and_then(|v| v.as_str()) {
                                if !key.is_empty() {
                                    api_key = Some(key.to_string());
                                }
                            }
                        }
                        if base_url.is_none() {
                            if let Some(u) = prov.get("baseUrl").and_then(|v| v.as_str()) {
                                if !u.is_empty() {
                                    base_url = Some(u.to_string());
                                }
                            }
                        }
                    }
                }
            }

            // Fallback to get_api_key
            if api_key.is_none() && !provider_str.is_empty() {
                if let Ok(Some(k)) = state.settings_store.get_api_key(&provider_str) {
                    if !k.is_empty() {
                        api_key = Some(k);
                    }
                }
            }

            let provider_type = match provider_str.to_lowercase().as_str() {
                "anthropic" | "claude" => ProviderType::Anthropic,
                "gemini" | "google" => ProviderType::Gemini,
                "ollama" => ProviderType::Ollama,
                "openrouter" => ProviderType::OpenRouter,
                "deepseek" => ProviderType::DeepSeek,
                "groq" => ProviderType::Groq,
                _ => ProviderType::OpenAI,
            };

            if model_str.is_empty() {
                if let Some(models) = raw_settings.get("models").and_then(|m| m.as_array()) {
                    if let Some(m) = models.iter().find(|m| {
                        let pid = m.get("providerId").and_then(|v| v.as_str()).unwrap_or("");
                        let en = m.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
                        en && (pid == provider_str || (provider_str == "gemini" && pid == "google") || (provider_str == "google" && pid == "gemini"))
                    }) {
                        if let Some(id) = m.get("id").and_then(|v| v.as_str()) {
                            let prefix = format!("{}-", provider_str);
                            model_str = if id.starts_with(&prefix) { id[prefix.len()..].to_string() } else { id.to_string() };
                        }
                    }
                }
                if model_str.is_empty() {
                    let (_, fallback_id, _, _) = resolve_active_workspace_model(&raw_settings, &state.settings_store);
                    model_str = fallback_id;
                }
            }

            // Fallback to environment variables if still no API key
            if api_key.is_none() {
                api_key = match provider_type {
                    ProviderType::OpenAI => std::env::var("OPENAI_API_KEY").ok(),
                    ProviderType::Anthropic => std::env::var("ANTHROPIC_API_KEY").ok(),
                    ProviderType::Gemini => std::env::var("GEMINI_API_KEY").ok(),
                    ProviderType::OpenRouter => std::env::var("OPENROUTER_API_KEY").ok(),
                    ProviderType::DeepSeek => std::env::var("DEEPSEEK_API_KEY").ok(),
                    ProviderType::Groq => std::env::var("GROQ_API_KEY").ok(),
                    _ => None,
                };
            }

            let mut model_config = ModelConfig::new(provider_type, model_str);
            model_config.api_key = api_key;
            model_config.base_url = base_url;

            let clean_chat_id = session_id.trim_start_matches("session-").trim().to_string();
            let effective_workspace: PathBuf = if let Some(proj_root) = config_val.get("projectRoot")
                .or_else(|| config_val.get("project_root"))
                .or_else(|| config_val.get("workingDirectory"))
                .or_else(|| config_val.get("workspace"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
            {
                let p = PathBuf::from(proj_root);
                if p.exists() && p.is_dir() {
                    p
                } else {
                    let conv_dir = get_superagent_dir().join("conversation").join("chats").join(&clean_chat_id);
                    let _ = std::fs::create_dir_all(&conv_dir);
                    conv_dir
                }
            } else {
                let conv_dir = get_superagent_dir().join("conversation").join("chats").join(&clean_chat_id);
                let _ = std::fs::create_dir_all(&conv_dir);
                conv_dir
            };

            let (cancel_tx, mut cancel_rx) = tokio::sync::broadcast::channel::<()>(2);
            {
                let mut cancellations = state.active_cancellations.lock().unwrap();
                cancellations.insert(session_id.clone(), cancel_tx);
            }

            let state_clone = state.clone();
            let sid = session_id.clone();
            let prompt_clone = prompt.clone();

            tokio::spawn(async move {
                // 1. Mark session running in session_store
                {
                    let mut store = state_clone.session_store.lock().unwrap();
                    if let Some(entry) = store.get_mut(&sid) {
                        entry.is_running = true;
                        entry.events.clear();
                        entry.full_assistant_text.clear();
                        entry.full_thought_text.clear();
                        entry.last_updated = chrono::Utc::now().timestamp_millis();
                    } else {
                        store.put(
                            sid.clone(),
                            SessionStateEntry {
                                events: Vec::new(),
                                is_running: true,
                                full_assistant_text: String::new(),
                                full_thought_text: String::new(),
                                last_updated: chrono::Utc::now().timestamp_millis(),
                            },
                        );
                    }
                }

                // 2. Broadcast context event
                let ctx_evt = serde_json::json!({
                    "channel": "agent-event",
                    "data": {
                        "type": "context",
                        "sessionId": sid,
                        "context": { "used": 0, "limit": 128000, "pct": 0 }
                    }
                });
                let _ = state_clone.ws_broadcast_tx.send(ctx_evt.to_string());

                let mut session_tool_registry = ToolRegistry::new();
                session_tool_registry.register(ReadFileTool::new(effective_workspace.clone()));
                session_tool_registry.register(WriteFileTool::new(effective_workspace.clone()));
                session_tool_registry.register(EditFileTool::new(effective_workspace.clone()));
                session_tool_registry.register(ListDirTool::new(effective_workspace.clone()));
                session_tool_registry.register(RunCommandTool::new(effective_workspace.clone()));
                session_tool_registry.register(GrepSearchTool::new(effective_workspace.clone()));
                session_tool_registry.register(GeneratePdfTool::new(effective_workspace.clone()));
                session_tool_registry.register(GeneratePresentationTool::new(effective_workspace.clone()));
                session_tool_registry.register(BrowserNavigateTool::new());
                session_tool_registry.register(BrowserScreenshotTool::new(effective_workspace.clone()));
                session_tool_registry.register(WebSearchTool::new());

                let session_tool_registry_arc = Arc::new(session_tool_registry);
                let subagent_runner = Arc::new(SubagentRunner::new(
                    state_clone.persona_store.clone(),
                    session_tool_registry_arc.clone(),
                ));

                let mut complete_registry = (*session_tool_registry_arc).clone();
                complete_registry.register(RunSubagentTool::new(subagent_runner));

                let engine = AgentEngine::new(Arc::new(complete_registry));
                let sys_prompt = if instructions.is_empty() {
                    "You are SuperAgent, an expert autonomous AI software engineer and problem solver.".to_string()
                } else {
                    instructions
                };

                let start_time = std::time::Instant::now();
                let mut has_error = false;
                let mut completion_token_count = 0usize;

                let run_result = engine.run_loop(&model_config, &sys_prompt, &prompt_clone).await;
                let mut did_emit_done = false;

                match run_result {
                    Ok(mut rx) => {
                        loop {
                            tokio::select! {
                                _ = cancel_rx.recv() => {
                                    let abort_evt = serde_json::json!({
                                        "channel": "agent-event",
                                        "data": {
                                            "type": "abort",
                                            "sessionId": sid
                                        }
                                    });
                                    let _ = state_clone.ws_broadcast_tx.send(abort_evt.to_string());
                                    did_emit_done = true;
                                    break;
                                }
                                event_opt = rx.recv() => {
                                    match event_opt {
                                        Some(event) => {
                                            let mut data_obj = serde_json::json!({
                                                "sessionId": sid,
                                            });

                                            match &event {
                                                crate::types::AgentEvent::Token { text } => {
                                                    completion_token_count += 1;
                                                    data_obj["type"] = serde_json::json!("token");
                                                    data_obj["content"] = serde_json::json!(text);
                                                }
                                                crate::types::AgentEvent::ToolCall { name, input, .. } => {
                                                    data_obj["type"] = serde_json::json!("tool_call");
                                                    data_obj["toolName"] = serde_json::json!(name);
                                                    data_obj["toolArgs"] = input.clone();
                                                }
                                                crate::types::AgentEvent::ToolOutput { output, .. } => {
                                                    data_obj["type"] = serde_json::json!("tool_result");
                                                    data_obj["toolResult"] = serde_json::json!(output);
                                                }
                                                crate::types::AgentEvent::Error { message } => {
                                                    has_error = true;
                                                    data_obj["type"] = serde_json::json!("error");
                                                    data_obj["error"] = serde_json::json!(message);
                                                    did_emit_done = true;
                                                }
                                                crate::types::AgentEvent::Finished { .. } => {
                                                    data_obj["type"] = serde_json::json!("done");
                                                    did_emit_done = true;
                                                }
                                                _ => {
                                                    data_obj["type"] = serde_json::json!("token");
                                                    data_obj["content"] = serde_json::json!("");
                                                }
                                            }

                                            // Record text in session store
                                            {
                                                let mut store = state_clone.session_store.lock().unwrap();
                                                if let Some(entry) = store.get_mut(&sid) {
                                                    if let Some(c) = data_obj.get("content").and_then(|v| v.as_str()) {
                                                        entry.full_assistant_text.push_str(c);
                                                    }
                                                    entry.last_updated = chrono::Utc::now().timestamp_millis();
                                                }
                                            }

                                            let broadcast_msg = serde_json::json!({
                                                "channel": "agent-event",
                                                "data": data_obj
                                            });
                                            let _ = state_clone.ws_broadcast_tx.send(broadcast_msg.to_string());
                                        }
                                        None => {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(err) => {
                        has_error = true;
                        let err_msg = serde_json::json!({
                            "channel": "agent-event",
                            "data": {
                                "type": "error",
                                "sessionId": sid,
                                "error": err.to_string()
                            }
                        });
                        let _ = state_clone.ws_broadcast_tx.send(err_msg.to_string());
                        did_emit_done = true;
                    }
                }

                if !did_emit_done {
                    let done_msg = serde_json::json!({
                        "channel": "agent-event",
                        "data": {
                            "type": "done",
                            "sessionId": sid
                        }
                    });
                    let _ = state_clone.ws_broadcast_tx.send(done_msg.to_string());
                }

                let duration_ms = start_time.elapsed().as_millis() as u64;
                let prompt_token_count = std::cmp::max(1, (prompt_clone.len() + 3) / 4);
                let full_text_len = {
                    let store = state_clone.session_store.lock().unwrap();
                    store.peek(&sid).map(|e| e.full_assistant_text.len()).unwrap_or(0)
                };
                let final_completion_tokens = std::cmp::max(completion_token_count, (full_text_len + 3) / 4);
                record_usage(
                    &format!("{:?}", model_config.provider).to_lowercase(),
                    &model_config.model_id,
                    prompt_token_count,
                    final_completion_tokens,
                    duration_ms,
                    if has_error { "failure" } else { "success" },
                );

                // Mark session idle & clean cancellation token
                {
                    let mut store = state_clone.session_store.lock().unwrap();
                    if let Some(entry) = store.get_mut(&sid) {
                        entry.is_running = false;
                        entry.last_updated = chrono::Utc::now().timestamp_millis();
                    }
                    let mut cancellations = state_clone.active_cancellations.lock().unwrap();
                    cancellations.remove(&sid);
                }
            });

            Some(Ok(Json(serde_json::json!({
                "data": {
                    "status": "started",
                    "sessionId": session_id
                }
            }))))
        }
        "agent-stop" => {
            let session_id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s.to_string())
                } else {
                    v.get("sessionId").and_then(|s| s.as_str()).map(|s| s.to_string())
                }
            }).unwrap_or_default();

            {
                let cancellations = state.active_cancellations.lock().unwrap();
                if let Some(tx) = cancellations.get(&session_id) {
                    let _ = tx.send(());
                }
            }

            {
                let mut store = state.session_store.lock().unwrap();
                if let Some(entry) = store.get_mut(&session_id) {
                    entry.is_running = false;
                }
            }

            let stop_msg = serde_json::json!({
                "channel": "agent-event",
                "data": {
                    "type": "abort",
                    "sessionId": session_id
                }
            });
            let _ = state.ws_broadcast_tx.send(stop_msg.to_string());

            Some(Ok(Json(serde_json::json!({ "data": { "stopped": true } }))))
        }
        "agent-list" => {
            let store = state.session_store.lock().unwrap();
            let sessions: Vec<String> = store.iter().filter(|(_, v)| v.is_running).map(|(k, _)| k.clone()).collect();
            Some(Ok(Json(serde_json::json!({ "data": { "sessions": sessions } }))))
        }
        "agent-permission-response" => Some(Ok(Json(serde_json::json!({ "data": { "success": true } })))),
        "agent-compact" => Some(Ok(Json(serde_json::json!({ "data": { "compacted": false, "tokensBefore": 0, "tokensAfter": 0 } })))),
        _ => None,
    }
}
