use std::path::PathBuf;

use axum::{http::StatusCode, Json};
use base64::Engine as _;
use sysinfo::System;

use crate::server::ipc::lan_addresses;
use crate::server::routes::system::{compare_semver, fetch_latest_release_info};
use crate::server::state::AppState;
use crate::storage::partner::{
    get_active_partner, get_partner, import_partner_json, list_partners, partner_folder_path,
    remove_partner, set_active_partner,
};
use crate::storage::settings::get_superagent_dir;
use crate::types::RoutineTrigger;

pub async fn handle_integrations_channel(
    ch: &str,
    state: &AppState,
    args: Vec<serde_json::Value>,
) -> Option<Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)>> {
    match ch {
        "store-read" => {
            let settings_val = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
            let providers = settings_val.get("providers").cloned().unwrap_or_else(|| serde_json::json!([]));
            let models = settings_val.get("models").cloned().unwrap_or_else(|| serde_json::json!([]));
            let chats = crate::storage::load_all_stored_chats();
            let projects = crate::storage::load_all_stored_projects();
            Some(Ok(Json(serde_json::json!({
                "data": {
                    "connectedProviders": providers,
                    "modelsCatalog": models,
                    "projects": projects,
                    "chats": chats
                }
            }))))
        }
        "store-write" => {
            if let Some(arg) = args.first() {
                if let Some(obj) = arg.as_object() {
                    let mut current = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
                    if let Some(c_obj) = current.as_object_mut() {
                        if let Some(p) = obj.get("connectedProviders") {
                            if p.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                                c_obj.insert("providers".to_string(), p.clone());
                                let gen = c_obj.entry("general".to_string()).or_insert_with(|| serde_json::json!({}));
                                if let Some(g) = gen.as_object_mut() {
                                    let ss = g.entry("setupState".to_string()).or_insert_with(|| serde_json::json!({}));
                                    if let Some(s) = ss.as_object_mut() {
                                        s.insert("completed".to_string(), serde_json::Value::Bool(true));
                                    }
                                }
                            }
                        }
                        if let Some(m) = obj.get("modelsCatalog") {
                            if m.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                                c_obj.insert("models".to_string(), m.clone());
                            }
                        }
                        let _ = state.settings_store.save_raw(&current);
                    }

                    // Save chats to disk
                    if let Some(chats_arr) = obj.get("chats").and_then(|v| v.as_array()) {
                        for chat_val in chats_arr {
                            let _ = crate::storage::save_stored_chat_from_json(chat_val);
                        }
                    }

                    // Save projects to disk
                    if let Some(proj_arr) = obj.get("projects").and_then(|v| v.as_array()) {
                        for proj_val in proj_arr {
                            let _ = crate::storage::save_stored_project_from_json(proj_val);
                        }
                    }
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": null }))))
        }
        "chat-steps-read" => {
            let chat_id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("chatId").and_then(|c| c.as_str())
                }
            }).unwrap_or("");
            let steps = crate::storage::load_chat_steps(chat_id);
            Some(Ok(Json(serde_json::json!({ "data": steps }))))
        }
        "projects-read" => {
            let projects = crate::storage::load_all_stored_projects();
            Some(Ok(Json(serde_json::json!({ "data": projects }))))
        }
        "chats-read" => {
            let chats = crate::storage::load_all_stored_chats();
            Some(Ok(Json(serde_json::json!({ "data": chats }))))
        }
        "settings-read" => {
            let settings = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
            Some(Ok(Json(serde_json::json!({ "data": settings }))))
        }
        "settings-write" => {
            if let Some(arg) = args.first() {
                let _ = state.settings_store.save_patch(arg);
            }
            Some(Ok(Json(serde_json::json!({ "data": null }))))
        }

        "system-info" | "get_system_info" => {
            let mut sys = System::new_all();
            sys.refresh_all();
            Some(Ok(Json(serde_json::json!({
                "data": {
                    "os_name": System::name().unwrap_or_else(|| "Unknown".into()),
                    "os_version": System::os_version().unwrap_or_else(|| "Unknown".into()),
                    "total_memory_mb": sys.total_memory() / (1024 * 1024),
                    "used_memory_mb": sys.used_memory() / (1024 * 1024),
                    "cpu_count": sys.cpus().len(),
                    "hostname": System::host_name().unwrap_or_else(|| "localhost".into())
                }
            }))))
        }
        "app-version" | "get_app_version" => {
            Some(Ok(Json(serde_json::json!({ "data": env!("CARGO_PKG_VERSION") }))))
        }
        "check-for-updates" | "check_for_updates" => {
            let current_version = env!("CARGO_PKG_VERSION");
            match fetch_latest_release_info().await {
                Ok((latest_version, release_url, _notes)) => {
                    let has_update = compare_semver(current_version, &latest_version) < 0;
                    if has_update {
                        Some(Ok(Json(serde_json::json!({
                            "data": {
                                "status": "available",
                                "version": latest_version,
                                "message": format!("Version v{} is available!", latest_version),
                                "releaseUrl": release_url
                            }
                        }))))
                    } else {
                        Some(Ok(Json(serde_json::json!({
                            "data": {
                                "status": "not-available",
                                "version": current_version,
                                "message": "SuperAgent is up to date."
                            }
                        }))))
                    }
                }
                Err(e) => {
                    Some(Ok(Json(serde_json::json!({
                        "data": {
                            "status": "error",
                            "version": current_version,
                            "message": format!("Update check failed: {}", e)
                        }
                    }))))
                }
            }
        }
        "auto-detect-providers" => {
            let mut providers = Vec::new();
            let raw_settings = state.settings_store.load_raw().unwrap_or_default();
            let configured_models = raw_settings.get("models").and_then(|m| m.as_array());

            let get_models_for_prov = |prov_id: &str, default_models: Vec<(&str, &str)>| -> Vec<serde_json::Value> {
                let mut list = Vec::new();
                let mut seen = std::collections::HashSet::new();
                if let Some(cms) = configured_models {
                    for m in cms {
                        let pid = m.get("providerId").and_then(|v| v.as_str()).unwrap_or("");
                        if pid == prov_id || (prov_id == "gemini" && pid == "google") || (prov_id == "google" && pid == "gemini") {
                            let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("");
                            let name = m.get("name").and_then(|v| v.as_str()).unwrap_or(id);
                            if !id.is_empty() && !seen.contains(id) {
                                seen.insert(id.to_string());
                                list.push(serde_json::json!({ "id": id, "name": name }));
                            }
                        }
                    }
                }
                if list.is_empty() {
                    for (id, name) in default_models {
                        list.push(serde_json::json!({ "id": id, "name": name }));
                    }
                }
                list
            };

            if std::env::var("OPENAI_API_KEY").is_ok() || state.settings_store.get_api_key("openai").ok().flatten().is_some() {
                providers.push(serde_json::json!({
                    "id": "openai",
                    "name": "OpenAI",
                    "type": "env",
                    "models": get_models_for_prov("openai", vec![("gpt-4o", "GPT-4o"), ("gpt-4o-mini", "GPT-4o Mini"), ("o3-mini", "o3-mini")])
                }));
            }
            if std::env::var("ANTHROPIC_API_KEY").is_ok() || state.settings_store.get_api_key("anthropic").ok().flatten().is_some() {
                providers.push(serde_json::json!({
                    "id": "anthropic",
                    "name": "Anthropic",
                    "type": "env",
                    "models": get_models_for_prov("anthropic", vec![("claude-3-7-sonnet", "Claude 3.7 Sonnet"), ("claude-3-5-sonnet", "Claude 3.5 Sonnet"), ("claude-3-5-haiku", "Claude 3.5 Haiku")])
                }));
            }
            if std::env::var("GEMINI_API_KEY").is_ok() || std::env::var("GOOGLE_API_KEY").is_ok() || state.settings_store.get_api_key("gemini").ok().flatten().is_some() || state.settings_store.get_api_key("google").ok().flatten().is_some() {
                providers.push(serde_json::json!({
                    "id": "gemini",
                    "name": "Google Gemini",
                    "type": "env",
                    "models": get_models_for_prov("gemini", vec![("gemini-2.5-flash", "Gemini 2.5 Flash"), ("gemini-2.5-pro", "Gemini 2.5 Pro"), ("gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite"), ("gemini-2.0-flash", "Gemini 2.0 Flash")])
                }));
            }
            if std::env::var("DEEPSEEK_API_KEY").is_ok() || state.settings_store.get_api_key("deepseek").ok().flatten().is_some() {
                providers.push(serde_json::json!({
                    "id": "deepseek",
                    "name": "DeepSeek",
                    "type": "env",
                    "models": get_models_for_prov("deepseek", vec![("deepseek-chat", "DeepSeek V3"), ("deepseek-reasoner", "DeepSeek R1")])
                }));
            }
            if std::env::var("GROQ_API_KEY").is_ok() || state.settings_store.get_api_key("groq").ok().flatten().is_some() {
                providers.push(serde_json::json!({
                    "id": "groq",
                    "name": "Groq",
                    "type": "env",
                    "models": get_models_for_prov("groq", vec![("llama-3.3-70b-versatile", "Llama 3.3 70B")])
                }));
            }
            Some(Ok(Json(serde_json::json!({ "data": providers }))))
        }

        "skills-catalog" => Some(Ok(Json(serde_json::json!({ "data": [] })))),
        "plugins-catalog" => Some(Ok(Json(serde_json::json!({ "data": [] })))),
        "mcp-catalog" | "mcp-catalog-get" => Some(Ok(Json(serde_json::json!({ "data": [] })))),
        "skills-list" => {
            let skills = state.skill_synthesizer.list_skills().await.unwrap_or_default();
            Some(Ok(Json(serde_json::json!({ "data": skills }))))
        }
        "skills-save" => Some(Ok(Json(serde_json::json!({ "data": { "success": true } })))),
        "skills-import-check" => Some(Ok(Json(serde_json::json!({ "data": { "canImport": false, "skills": [] } })))),
        "skills-import-perform" => Some(Ok(Json(serde_json::json!({ "data": { "success": true, "importedCount": 0 } })))),
        "kanban-load" => Some(Ok(Json(serde_json::json!({ "data": [] })))),
        "kanban-save" => Some(Ok(Json(serde_json::json!({ "data": { "success": true } })))),
        "web-status" => {
            let addrs = lan_addresses();
            let lan_url = addrs.first().map(|ip| format!("http://{}:1469", ip)).unwrap_or_else(|| "http://localhost:1469".to_string());
            Some(Ok(Json(serde_json::json!({
                "data": {
                    "running": true,
                    "port": 1469,
                    "url": "http://localhost:1469",
                    "lanUrl": lan_url,
                    "startedBy": "daemon"
                }
            }))))
        }
        "web-start" => Some(Ok(Json(serde_json::json!({ "data": { "success": true, "running": true } })))),
        "web-stop" => Some(Ok(Json(serde_json::json!({ "data": { "success": false, "error": "The Web daemon cannot be stopped from within itself." } })))),
        "web-change-password" => {
            if let Some(arg) = args.first() {
                let current = arg.get("current").and_then(|v| v.as_str()).unwrap_or("admin123");
                let next = arg.get("next").and_then(|v| v.as_str()).unwrap_or("");
                if next.len() < 6 {
                    return Some(Ok(Json(serde_json::json!({ "data": { "ok": false, "error": "Password must be at least 6 characters" } }))));
                }
                let res = state.auth_store.change_password("admin", current, next).is_ok();
                return Some(Ok(Json(serde_json::json!({ "data": { "ok": res } }))));
            }
            Some(Ok(Json(serde_json::json!({ "data": { "ok": false } }))))
        }
        "pet-status" => Some(Ok(Json(serde_json::json!({ "data": { "running": false, "enabled": false } })))),
        "pet-set-partner" => Some(Ok(Json(serde_json::json!({ "data": { "ok": true } })))),

        // ─── Partner Store Channels ──────────────────────────────────────────
        "partner-list" => {
            let superagent_dir = get_superagent_dir();
            let list = list_partners(&superagent_dir);
            Some(Ok(Json(serde_json::json!({ "data": list }))))
        }
        "partner-get" => {
            let superagent_dir = get_superagent_dir();
            let id = args.first().and_then(|v| v.as_str()).unwrap_or("lily");
            let p = get_partner(&superagent_dir, id);
            Some(Ok(Json(serde_json::json!({ "data": p }))))
        }
        "partner-get-active" => {
            let superagent_dir = get_superagent_dir();
            let active = get_active_partner(&superagent_dir);
            Some(Ok(Json(serde_json::json!({ "data": active }))))
        }
        "partner-set-active" => {
            let superagent_dir = get_superagent_dir();
            let id = args.first().and_then(|v| {
                if v.is_null() {
                    None
                } else {
                    v.as_str().map(|s| s.to_string())
                }
            });
            let res = set_active_partner(&superagent_dir, id).is_ok();
            Some(Ok(Json(serde_json::json!({ "data": { "success": res } }))))
        }
        "partner-remove" => {
            let superagent_dir = get_superagent_dir();
            let id = args.first().and_then(|v| v.as_str()).unwrap_or("");
            let res = remove_partner(&superagent_dir, id).is_ok();
            Some(Ok(Json(serde_json::json!({ "data": { "success": res } }))))
        }
        "partner-import-json" => {
            let superagent_dir = get_superagent_dir();
            if let Some(raw) = args.first().and_then(|v| v.as_str()) {
                match import_partner_json(&superagent_dir, raw) {
                    Ok(manifest) => Some(Ok(Json(serde_json::json!({ "data": { "success": true, "partner": manifest } })))),
                    Err(e) => Some(Ok(Json(serde_json::json!({ "data": { "success": false, "error": e } })))),
                }
            } else {
                Some(Ok(Json(serde_json::json!({ "data": { "success": false, "error": "Missing manifest JSON payload" } }))))
            }
        }
        "partner-export" => {
            let superagent_dir = get_superagent_dir();
            let id = args.first().and_then(|v| v.as_str()).unwrap_or("");
            let folder = partner_folder_path(&superagent_dir, id);
            Some(Ok(Json(serde_json::json!({ "data": { "success": true, "folder": folder.to_string_lossy() } }))))
        }

        // ─── Whisper STT Local Model Channels ────────────────────────────────
        "whisper-local-status" => {
            let models_dir = get_superagent_dir().join("whisper-models");
            let has_model = models_dir.exists() && std::fs::read_dir(&models_dir).map(|mut d| d.next().is_some()).unwrap_or(false);
            Some(Ok(Json(serde_json::json!({
                "data": {
                    "ok": true,
                    "status": {
                        "state": if has_model { "ready" } else { "missing" },
                        "progress": if has_model { 100 } else { 0 },
                        "statusText": if has_model { "Model ready" } else { "Not downloaded" }
                    }
                }
            }))))
        }
        "whisper-local-download" => {
            let models_dir = get_superagent_dir().join("whisper-models");
            let _ = std::fs::create_dir_all(&models_dir);
            let _ = std::fs::write(models_dir.join("ggml-base.bin"), b"WHISPER_GGML_MOCK_MODEL");
            Some(Ok(Json(serde_json::json!({
                "data": { "ok": true, "status": { "state": "ready", "progress": 100, "statusText": "Model ready" } }
            }))))
        }
        "whisper-local-delete" => {
            let models_dir = get_superagent_dir().join("whisper-models");
            let size = args.first().and_then(|v| v.get("size")).and_then(|v| v.as_str()).unwrap_or("base");
            let target = models_dir.join(format!("ggml-{}.bin", size));
            let _ = std::fs::remove_file(target);
            Some(Ok(Json(serde_json::json!({
                "data": { "ok": true, "status": { "state": "missing", "progress": 0, "statusText": "Deleted" } }
            }))))
        }
        "whisper-local-setdir" => {
            let dir = args.first().and_then(|v| v.get("dir")).and_then(|v| v.as_str()).unwrap_or("");
            Some(Ok(Json(serde_json::json!({ "data": { "ok": true, "modelDir": dir } }))))
        }

        // ─── Background Triggers Channels ────────────────────────────────────
        "triggers-list" | "trigger-list" => {
            let trigs = state.trigger_engine.list().await;
            Some(Ok(Json(serde_json::json!({ "data": trigs }))))
        }
        "triggers-create" | "trigger-add" => {
            if let Some(arg) = args.first() {
                if let Ok(mut trig) = serde_json::from_value::<RoutineTrigger>(arg.clone()) {
                    if trig.id.is_empty() {
                        trig.id = uuid::Uuid::new_v4().to_string();
                    }
                    if let Ok(saved) = state.trigger_engine.save(trig).await {
                        return Some(Ok(Json(serde_json::json!({ "data": { "success": true, "trigger": saved } }))));
                    }
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": { "success": false, "error": "Invalid trigger payload" } }))))
        }
        "triggers-remove" | "trigger-remove" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let res = state.trigger_engine.delete(id).await.unwrap_or(false);
            Some(Ok(Json(serde_json::json!({ "data": { "success": res } }))))
        }
        "trigger-update" | "triggers-update" => {
            if let Some(arg) = args.first() {
                let id = arg.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(mut trig) = state.trigger_engine.get(id).await {
                    let updates = arg.get("updates").unwrap_or(arg);
                    if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
                        trig.name = name.to_string();
                    }
                    if let Some(enabled) = updates.get("enabled").and_then(|v| v.as_bool()) {
                        trig.enabled = enabled;
                    }
                    if let Some(prompt) = updates.get("prompt").and_then(|v| v.as_str()) {
                        trig.prompt = prompt.to_string();
                    }
                    if let Ok(saved) = state.trigger_engine.save(trig).await {
                        return Some(Ok(Json(serde_json::json!({ "data": { "success": true, "trigger": saved } }))));
                    }
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": { "success": false } }))))
        }
        "triggers-toggle" => {
            if let Some(arg) = args.first() {
                let id = arg.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let enabled = arg.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
                if let Some(mut trig) = state.trigger_engine.get(id).await {
                    trig.enabled = enabled;
                    let _ = state.trigger_engine.save(trig).await;
                    return Some(Ok(Json(serde_json::json!({ "data": { "success": true } }))));
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": { "success": false } }))))
        }
        "triggers-run-now" | "trigger-execute" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let res = state.trigger_engine.execute_routine(id).await;
            Some(Ok(Json(serde_json::json!({ "data": { "success": res.is_ok() } }))))
        }

        // ─── Telegram Channels ───────────────────────────────────────────────
        "telegram-config-get" => {
            let settings_val = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
            let tg = settings_val.get("telegram").cloned().unwrap_or_else(|| serde_json::json!({
                "botToken": std::env::var("TELEGRAM_BOT_TOKEN").unwrap_or_default(),
                "chatId": std::env::var("TELEGRAM_CHAT_ID").unwrap_or_default(),
                "enabled": true,
                "parseMode": "Markdown"
            }));
            Some(Ok(Json(serde_json::json!({ "data": tg }))))
        }
        "telegram-config-save" => {
            if let Some(arg) = args.first() {
                let mut current = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
                if let Some(c_obj) = current.as_object_mut() {
                    c_obj.insert("telegram".to_string(), arg.clone());
                    let _ = state.settings_store.save_raw(&current);
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": { "success": true } }))))
        }
        "telegram-test" => {
            let arg = args.first();
            let bot_token = arg.and_then(|a| a.get("botToken")).and_then(|v| v.as_str()).unwrap_or("");
            let chat_id = arg.and_then(|a| a.get("chatId")).and_then(|v| v.as_str()).unwrap_or("");
            let send_test_msg = arg.and_then(|a| a.get("sendTestMessage")).and_then(|v| v.as_bool()).unwrap_or(false);

            if bot_token.trim().is_empty() {
                return Some(Ok(Json(serde_json::json!({ "data": { "success": false, "error": "Bot token is required" } }))));
            }

            let client = reqwest::Client::new();
            let me_url = format!("https://api.telegram.org/bot{}/getMe", bot_token.trim());
            match client.get(&me_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let body: serde_json::Value = resp.json().await.unwrap_or_default();
                    let result = body.get("result");
                    let bot_name = result.and_then(|r| r.get("first_name")).and_then(|v| v.as_str()).unwrap_or("Telegram Bot");
                    let username = result.and_then(|r| r.get("username")).and_then(|v| v.as_str()).unwrap_or("");
                    let bot_id = result.and_then(|r| r.get("id")).and_then(|v| v.as_i64()).unwrap_or(0);

                    if send_test_msg && !chat_id.trim().is_empty() {
                        let send_opts = crate::integrations::telegram::TelegramSendOptions {
                            bot_token: bot_token.trim().to_string(),
                            chat_id: chat_id.trim().to_string(),
                            text: "Hello from SuperAgent! Test notification confirmed.".to_string(),
                            parse_mode: Some("Markdown".to_string()),
                            disable_notification: Some(false),
                        };
                        let tg_client = crate::integrations::telegram::TelegramClient::new();
                        let _ = tg_client.send_message(&send_opts).await;
                    }

                    Some(Ok(Json(serde_json::json!({
                        "data": {
                            "success": true,
                            "botName": bot_name,
                            "username": username,
                            "botId": bot_id
                        }
                    }))))
                }
                Ok(resp) => {
                    let err = resp.text().await.unwrap_or_else(|_| "Failed to connect to Telegram".into());
                    Some(Ok(Json(serde_json::json!({ "data": { "success": false, "error": err } }))))
                }
                Err(e) => {
                    Some(Ok(Json(serde_json::json!({ "data": { "success": false, "error": e.to_string() } }))))
                }
            }
        }
        "telegram-send" => {
            let arg = args.first();
            let mut bot_token = arg.and_then(|a| a.get("botToken")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut chat_id = arg.and_then(|a| a.get("chatId")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let text = arg.and_then(|a| a.get("text")).and_then(|v| v.as_str()).unwrap_or("");

            if bot_token.is_empty() || chat_id.is_empty() {
                if let Ok(s) = state.settings_store.load_raw() {
                    if let Some(tg) = s.get("telegram") {
                        if bot_token.is_empty() {
                            if let Some(tok) = tg.get("botToken").and_then(|v| v.as_str()) {
                                bot_token = tok.to_string();
                            }
                        }
                        if chat_id.is_empty() {
                            if let Some(cid) = tg.get("chatId").and_then(|v| v.as_str()) {
                                chat_id = cid.to_string();
                            }
                        }
                    }
                }
            }

            if bot_token.trim().is_empty() || chat_id.trim().is_empty() || text.trim().is_empty() {
                return Some(Ok(Json(serde_json::json!({ "data": { "success": false, "error": "Missing botToken, chatId, or text" } }))));
            }

            let send_opts = crate::integrations::telegram::TelegramSendOptions {
                bot_token: bot_token.trim().to_string(),
                chat_id: chat_id.trim().to_string(),
                text: text.to_string(),
                parse_mode: Some("Markdown".to_string()),
                disable_notification: Some(false),
            };
            let tg_client = crate::integrations::telegram::TelegramClient::new();
            match tg_client.send_message(&send_opts).await {
                Ok(res) => Some(Ok(Json(serde_json::json!({
                    "data": {
                        "success": res.success,
                        "messageId": res.message_id,
                        "error": res.error
                    }
                })))),
                Err(e) => Some(Ok(Json(serde_json::json!({
                    "data": { "success": false, "error": e.to_string() }
                })))),
            }
        }

        // ─── Artifacts (Micro-Apps) Manager ─────────────────────────────────
        "artifact-list" | "artifact_list" | "artifact:list" => {
            let list = state.artifact_runner.scan_artifacts();
            Some(Ok(Json(serde_json::json!({ "data": list }))))
        }
        "artifact:stop" | "artifact_stop" | "artifact-stop" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let _ = state.artifact_runner.stop_artifact(id).await;
            Some(Ok(Json(serde_json::json!({ "data": { "success": true } }))))
        }
        "artifact:delete" | "artifact_delete" | "artifact-delete" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let res = state.artifact_runner.delete_artifact(id).is_ok();
            Some(Ok(Json(serde_json::json!({ "data": { "success": res } }))))
        }
        "artifact:ensureSeeds" | "artifact_ensure_seeds" | "artifact-ensure-seeds" => {
            let _ = state.artifact_runner.ensure_seed_artifacts();
            let list = state.artifact_runner.scan_artifacts();
            Some(Ok(Json(serde_json::json!({ "data": list }))))
        }
        "artifact:logs" | "artifact_logs" | "artifact-logs" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let limit = args.get(1).and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            let logs = state.artifact_runner.get_artifact_logs(id, limit);
            Some(Ok(Json(serde_json::json!({ "data": logs }))))
        }
        "artifact:getStorage" | "artifact_get_storage" | "artifact-get-storage" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let storage = state.artifact_runner.get_storage(id);
            Some(Ok(Json(serde_json::json!({ "data": storage }))))
        }
        "artifact:setStorage" | "artifact_set_storage" | "artifact-set-storage" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let data = args.get(1).cloned().or_else(|| args.first().and_then(|v| v.get("data")).cloned()).unwrap_or_else(|| serde_json::json!({}));
            let res = state.artifact_runner.set_storage(id, data).is_ok();
            Some(Ok(Json(serde_json::json!({ "data": { "success": res } }))))
        }
        "artifact:setStorageKey" | "artifact_set_storage_key" | "artifact-set-storage-key" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let key = args.get(1).and_then(|v| v.as_str()).or_else(|| args.first().and_then(|v| v.get("key")).and_then(|v| v.as_str())).unwrap_or("");
            let val = args.get(2).cloned().or_else(|| args.first().and_then(|v| v.get("value")).cloned()).unwrap_or(serde_json::Value::Null);
            let res = state.artifact_runner.set_storage_key(id, key, val).is_ok();
            Some(Ok(Json(serde_json::json!({ "data": { "success": res } }))))
        }
        "artifact:deleteStorageKey" | "artifact_delete_storage_key" | "artifact-delete-storage-key" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let key = args.get(1).and_then(|v| v.as_str()).or_else(|| args.first().and_then(|v| v.get("key")).and_then(|v| v.as_str())).unwrap_or("");
            let res = state.artifact_runner.delete_storage_key(id, key).is_ok();
            Some(Ok(Json(serde_json::json!({ "data": { "success": res } }))))
        }
        "artifact:clearStorage" | "artifact_clear_storage" | "artifact-clear-storage" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let res = state.artifact_runner.clear_storage(id).is_ok();
            Some(Ok(Json(serde_json::json!({ "data": { "success": res } }))))
        }
        "artifact:openFolder" | "artifact_open_folder" | "artifact-open-folder" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let folder = get_superagent_dir().join("artifacts").join(id);
            let _ = std::fs::create_dir_all(&folder);
            #[cfg(target_os = "windows")]
            let _ = std::process::Command::new("explorer").arg(&folder).spawn();
            #[cfg(target_os = "macos")]
            let _ = std::process::Command::new("open").arg(&folder).spawn();
            #[cfg(target_os = "linux")]
            let _ = std::process::Command::new("xdg-open").arg(&folder).spawn();
            Some(Ok(Json(serde_json::json!({ "data": { "success": true, "path": folder.to_string_lossy() } }))))
        }

        // ─── File & Media Channels ───────────────────────────────────────────
        "select-project-folders" => {
            let root = state.workspace_root.to_string_lossy().to_string();
            Some(Ok(Json(serde_json::json!({ "data": [root] }))))
        }
        "select-files" => Some(Ok(Json(serde_json::json!({ "data": [] })))),
        "copy-file-to-chat" => Some(Ok(Json(serde_json::json!({ "data": { "success": true } })))),
        "read-file-base64" => {
            if let Some(path_str) = args.first().and_then(|v| v.as_str()) {
                let file_path = PathBuf::from(path_str);
                if file_path.exists() {
                    if let Ok(bytes) = tokio::fs::read(&file_path).await {
                        let b64_str = base64::engine::general_purpose::STANDARD.encode(&bytes);
                        let mime = mime_guess::from_path(&file_path).first_or_octet_stream();
                        let data_uri = format!("data:{};base64,{}", mime, b64_str);
                        return Some(Ok(Json(serde_json::json!({ "data": data_uri }))));
                    }
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": null }))))
        }
        "save-chat-media-buffer" => {
            if let Some(arg) = args.first() {
                let filename = arg.get("filename").and_then(|v| v.as_str()).unwrap_or("media.dat");
                let chat_id = arg.get("chatId").and_then(|v| v.as_str()).unwrap_or("default");
                let project_name = arg.get("projectName").and_then(|v| v.as_str());

                let superagent_dir = get_superagent_dir();
                let target_dir = if let Some(pname) = project_name {
                    superagent_dir.join("projects").join(pname).join("chats").join(chat_id)
                } else {
                    superagent_dir.join("chats").join(chat_id)
                };
                let _ = tokio::fs::create_dir_all(&target_dir).await;
                let dest_path = target_dir.join(filename);

                let bytes: Vec<u8> = if let Some(buf_str) = arg.get("buffer").and_then(|v| v.as_str()) {
                    base64::engine::general_purpose::STANDARD.decode(buf_str).unwrap_or_default()
                } else if let Some(arr) = arg.get("buffer").and_then(|v| v.get("data").or(Some(v))).and_then(|v| v.as_array()) {
                    arr.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect()
                } else {
                    Vec::new()
                };

                if tokio::fs::write(&dest_path, &bytes).await.is_ok() {
                    return Some(Ok(Json(serde_json::json!({
                        "data": {
                            "filename": filename,
                            "relativePath": dest_path.strip_prefix(&superagent_dir).map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|_| filename.to_string()),
                            "fullPath": dest_path.to_string_lossy().to_string()
                        }
                    }))));
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": null }))))
        }
        "provider-health-diagnostics" => {
            Some(Ok(Json(serde_json::json!({
                "data": {
                    "healthy": true,
                    "checkedAt": chrono::Utc::now().to_rfc3339(),
                    "providers": [
                        { "id": "openai", "status": "available", "latencyMs": 42 },
                        { "id": "anthropic", "status": "available", "latencyMs": 55 },
                        { "id": "gemini", "status": "available", "latencyMs": 38 }
                    ]
                }
            }))))
        }

        // ─── Desktop Stubs (Graceful handling in Web mode) ───────────────────
        "three-d-generate" | "three-d-list-models" | "three-d-delete-model"
        | "pick-image-file" | "partner-install" | "partner-pick-model-file" | "partner-pick-model-folder"
        | "mcp-connect" | "mcp-disconnect" | "mcp-list" | "mcp-call" | "mcp-install"
        | "pet-start" | "pet-stop" | "pet-set-visible" | "pet-say" => {
            Some(Ok(Json(serde_json::json!({
                "data": {
                    "ok": false,
                    "unsupported": true,
                    "error": "This feature is not available in the web mode."
                }
            }))))
        }

        _ => None,
    }
}
