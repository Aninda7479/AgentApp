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
use crate::tools::builtin::{
    CreateArtifactTool, EditFileTool, GetAvailableToolsTool, GrepSearchTool, ListArtifactsTool,
    ListDirTool, ReadArtifactTool, ReadFileTool, RunCommandTool, RunSubagentTool, WriteFileTool,
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
                Some(a) => a.clone(),
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

            let attachments: Vec<String> = arg
                .get("currentAttachments")
                .or_else(|| arg.get("attachments"))
                .or_else(|| config_val.get("attachments"))
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

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

            let mut model_config = ModelConfig::new(provider_type, model_str.clone());
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
                    let conv_dir = state.chat_storage.storage_dir().join("chats").join(&clean_chat_id);
                    let _ = std::fs::create_dir_all(&conv_dir);
                    conv_dir
                }
            } else {
                let conv_dir = state.chat_storage.storage_dir().join("chats").join(&clean_chat_id);
                let _ = std::fs::create_dir_all(&conv_dir);
                conv_dir
            };

            let (cancel_tx, mut cancel_rx) = tokio::sync::broadcast::channel::<()>(2);
            {
                let mut cancellations = state.active_cancellations.lock();
                cancellations.insert(session_id.clone(), cancel_tx);
            }

            let state_clone = state.clone();
            let sid = session_id.clone();
            let prompt_clone = prompt.clone();
            let attachments_clone = attachments.clone();

            tokio::spawn(async move {
                // 1. Mark session running in session_store, preserve conversation history
                let prior_history = {
                    let mut store = state_clone.session_store.lock();
                    if let Some(entry) = store.get_mut(&sid) {
                        entry.is_running = true;
                        entry.events.clear();
                        entry.full_assistant_text.clear();
                        entry.full_thought_text.clear();
                        entry.last_updated = chrono::Utc::now().timestamp_millis();
                        // Preserve conversation_history across runs for multi-turn context
                        entry.conversation_history.clone()
                    } else {
                        store.put(
                            sid.clone(),
                            SessionStateEntry {
                                events: Vec::new(),
                                is_running: true,
                                full_assistant_text: String::new(),
                                full_thought_text: String::new(),
                                last_updated: chrono::Utc::now().timestamp_millis(),
                                conversation_history: Vec::new(),
                            },
                        );
                        Vec::new()
                    }
                };

                // If server-side history is empty, try to hydrate from client-sent history
                let initial_history = if prior_history.is_empty() {
                    // Parse client-sent history from the payload (LRU eviction fallback)
                    if let Some(client_history) = arg.get("history").and_then(|v| v.as_array()) {
                        let mut msgs = Vec::new();
                        for item in client_history {
                            let role_str = item.get("role").and_then(|v| v.as_str()).unwrap_or("");
                            let content = item.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            match role_str {
                                "user" => msgs.push(crate::types::ChatMessage::user(content)),
                                "assistant" => {
                                    // Check if this has tool_calls
                                    if let Some(tool_calls) = item.get("tool_calls").and_then(|v| v.as_array()) {
                                        let mut blocks = Vec::new();
                                        if !content.is_empty() {
                                            blocks.push(crate::types::ContentBlock::Text { text: content });
                                        }
                                        for tc in tool_calls {
                                            let id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                            let name = tc.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                            let args_str = tc.get("arguments").and_then(|v| v.as_str()).unwrap_or("{}");
                                            let input: serde_json::Value = serde_json::from_str(args_str).unwrap_or_else(|_| serde_json::json!({}));
                                            blocks.push(crate::types::ContentBlock::ToolUse { id, name, input });
                                        }
                                        msgs.push(crate::types::ChatMessage::new(crate::types::Role::Assistant, blocks));
                                    } else {
                                        msgs.push(crate::types::ChatMessage::assistant(content));
                                    }
                                }
                                "tool" => {
                                    let tool_call_id = item.get("tool_call_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let is_error = item.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);
                                    msgs.push(crate::types::ChatMessage::tool_result(tool_call_id, content, is_error));
                                }
                                _ => {}
                            }
                        }
                        msgs
                    } else {
                        Vec::new()
                    }
                } else {
                    prior_history
                };

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

                // 3. Model tier detection (auto + manual override)
                //    Tier 1 (>30B): All tools
                //    Tier 2 (7-30B): Core tools (no browser/media tools)
                //    Tier 3 (<7B): No tools — pure text generation
                let model_tier: u8 = {
                    // Check for manual override in settings
                    let manual_tier = raw_settings.get("modelTiers")
                        .and_then(|tiers| tiers.get(&model_str))
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u8);

                    if let Some(tier) = manual_tier {
                        tier
                    } else {
                        // Auto-detect from model name heuristics
                        let lower = model_str.to_lowercase();
                        if lower.contains("1b") || lower.contains("1.5b") || lower.contains("2b")
                            || lower.contains("3b") || lower.contains("4b")
                            || lower.contains(":1b") || lower.contains(":3b")
                            || lower.contains("phi-2") || lower.contains("tinyllama")
                        {
                            3 // Tier 3: < 7B
                        } else if lower.contains("7b") || lower.contains("8b")
                            || lower.contains("13b") || lower.contains("14b")
                            || lower.contains("22b") || lower.contains("27b")
                            || lower.contains(":7b") || lower.contains(":8b")
                            || lower.contains("mistral-small") || lower.contains("gemma-2")
                        {
                            2 // Tier 2: 7-30B
                        } else {
                            1 // Tier 1: >30B or unknown (assume capable)
                        }
                    }
                };

                // 4. Build adaptive tool registry based on model tier
                let mut session_tool_registry = ToolRegistry::new();

                let allowed_commands: Vec<String> = config_val.get("allowedCommands")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|c| c.as_str().map(|s| s.to_string())).collect())
                    .unwrap_or_default();

                // Artifact tools are enabled across ALL tiers (Tier 1, 2, and 3)
                session_tool_registry.register(CreateArtifactTool::new());
                session_tool_registry.register(ListArtifactsTool::new());
                session_tool_registry.register(ReadArtifactTool::new());

                if model_tier <= 2 {
                    // Core file and code tools for Tier 1 & 2
                    session_tool_registry.register(ReadFileTool::new(effective_workspace.clone()));
                    session_tool_registry.register(WriteFileTool::new(effective_workspace.clone()));
                    session_tool_registry.register(EditFileTool::new(effective_workspace.clone()));
                    session_tool_registry.register(ListDirTool::new(effective_workspace.clone()));
                    session_tool_registry.register(RunCommandTool::with_allowed_commands(effective_workspace.clone(), allowed_commands));
                    session_tool_registry.register(GrepSearchTool::new(effective_workspace.clone()));
                }

                if model_tier == 1 {
                    // Heavy automation & media tools for Tier 1 only (large, capable models)
                    session_tool_registry.register(GeneratePdfTool::new(effective_workspace.clone()));
                    session_tool_registry.register(GeneratePresentationTool::new(effective_workspace.clone()));
                    session_tool_registry.register(BrowserNavigateTool::new());
                    session_tool_registry.register(BrowserScreenshotTool::new(effective_workspace.clone()));
                    session_tool_registry.register(WebSearchTool::new());
                }

                // Register GetAvailableToolsTool for ALL tiers so any model can query its enabled capabilities
                let tools_summary: Vec<(String, String)> = session_tool_registry.list_schemas()
                    .iter()
                    .map(|s| {
                        let name = s.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let desc = s.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        (name, desc)
                    })
                    .collect();
                session_tool_registry.register(GetAvailableToolsTool::new(tools_summary));

                let session_tool_registry_arc = Arc::new(session_tool_registry);
                let subagent_runner = Arc::new(SubagentRunner::new(
                    state_clone.persona_store.clone(),
                    session_tool_registry_arc.clone(),
                ));

                let mut complete_registry = (*session_tool_registry_arc).clone();
                if model_tier <= 2 {
                    complete_registry.register(RunSubagentTool::new(subagent_runner));
                }

                // 5. Build enriched system prompt
                let sys_prompt = if instructions.is_empty() {
                    let tool_names: Vec<String> = complete_registry.list_schemas()
                        .iter()
                        .filter_map(|s| s.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
                        .collect();

                    let tools_section = format!(
                        "You have access to these tools: {}.\n\
                        You can also call 'get_available_tools' at any time to verify what tools you have access to.\n\
                        When asked to create an artifact, game, web app, calculator, or interactive widget, use the 'create_artifact' tool to build a complete HTML/CSS/JS application.",
                        tool_names.join(", ")
                    );

                    format!(
                        "You are SuperAgent, an expert autonomous AI software engineer and problem solver.\n\n\
                        IMPORTANT BEHAVIORAL GUIDELINES:\n\
                        - For casual greetings (hi, hello, hey), respond naturally and conversationally. Do NOT call tools for simple greetings.\n\
                        - You can query what tools you have access to at any time by calling the 'get_available_tools' tool.\n\
                        - For coding tasks, write complete, working solutions.\n\
                        - For interactive apps, games, or widgets, use 'create_artifact' to build a self-contained web app with HTML, CSS, and JavaScript.\n\
                        - Always maintain context from prior messages in the conversation.\n\
                        - If the user asks to continue or refers to something from earlier, use the conversation history.\n\n\
                        {}", tools_section
                    )
                } else {
                    instructions
                };

                let engine = AgentEngine::new(Arc::new(complete_registry));

                let start_time = std::time::Instant::now();
                let mut has_error = false;
                let mut completion_token_count = 0usize;

                // 6. Use run_loop_with_history_and_attachments for multi-turn context and multimodal attachments
                let run_result = engine
                    .run_loop_with_history_and_attachments(
                        &model_config,
                        &sys_prompt,
                        &prompt_clone,
                        initial_history,
                        attachments_clone,
                    )
                    .await;
                let mut did_emit_done = false;

                match run_result {
                    Ok((mut rx, mut history_rx)) => {
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
                                                let mut store = state_clone.session_store.lock();
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

                        // 7. Persist new messages into conversation_history
                        if let Ok(new_messages) = history_rx.try_recv() {
                            let mut store = state_clone.session_store.lock();
                            if let Some(entry) = store.get_mut(&sid) {
                                entry.conversation_history.extend(new_messages);
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
                    let store = state_clone.session_store.lock();
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
                    let mut store = state_clone.session_store.lock();
                    if let Some(entry) = store.get_mut(&sid) {
                        entry.is_running = false;
                        entry.last_updated = chrono::Utc::now().timestamp_millis();
                    }
                    let mut cancellations = state_clone.active_cancellations.lock();
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
                let cancellations = state.active_cancellations.lock();
                if let Some(tx) = cancellations.get(&session_id) {
                    let _ = tx.send(());
                }
            }

            {
                let mut store = state.session_store.lock();
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
            let store = state.session_store.lock();
            let sessions: Vec<String> = store.iter().filter(|(_, v)| v.is_running).map(|(k, _)| k.clone()).collect();
            Some(Ok(Json(serde_json::json!({ "data": { "sessions": sessions } }))))
        }
        "agent-permission-response" => Some(Ok(Json(serde_json::json!({ "data": { "success": true } })))),
        "agent-compact" => Some(Ok(Json(serde_json::json!({ "data": { "compacted": false, "tokensBefore": 0, "tokensAfter": 0 } })))),
        _ => None,
    }
}
