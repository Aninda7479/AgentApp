use std::path::PathBuf;

use anyhow::Result;
use axum::{http::StatusCode, Json};

use crate::server::state::AppState;
use crate::storage::settings::get_superagent_dir;

// ─── Global Memory Storage Helpers ───────────────────────────────────────────

pub fn get_global_memory_path() -> PathBuf {
    get_superagent_dir().join("global_memory.json")
}

pub fn load_global_memory() -> serde_json::Value {
    let p = get_global_memory_path();
    let default_mem = serde_json::json!({
        "defaultSystemPrompt": "",
        "globalMemoryInstructions": "",
        "userProfile": [],
        "learnedInsights": [],
        "projectInstructions": []
    });
    if p.exists() {
        if let Ok(raw) = std::fs::read_to_string(&p) {
            if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let (Some(def_obj), Some(val_obj)) = (default_mem.as_object(), val.as_object_mut()) {
                    for (k, v) in def_obj {
                        if !val_obj.contains_key(k) {
                            val_obj.insert(k.clone(), v.clone());
                        }
                    }
                }
                return val;
            }
        }
    }
    default_mem
}

pub fn save_global_memory(val: &serde_json::Value) -> Result<()> {
    let p = get_global_memory_path();
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json_str = serde_json::to_string_pretty(val)?;
    std::fs::write(p, json_str)?;
    Ok(())
}

// ─── Orchestrator Instruction Helpers ────────────────────────────────────────

pub fn get_orchestrator_instructions_path() -> PathBuf {
    get_superagent_dir().join("orchestrator-instructions.md")
}

pub fn load_orchestrator_instructions() -> String {
    let p = get_orchestrator_instructions_path();
    if p.exists() {
        if let Ok(content) = std::fs::read_to_string(&p) {
            if !content.trim().is_empty() {
                return content;
            }
        }
    }
    let default_inst = "# Orchestrator System Instructions\n\nYou are SuperAgent Orchestrator. Route tasks to specialized subagents based on coding, reasoning, and domain expertise.\n";
    let _ = save_orchestrator_instructions(default_inst);
    default_inst.to_string()
}

pub fn save_orchestrator_instructions(content: &str) -> Result<()> {
    let p = get_orchestrator_instructions_path();
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(p, content)?;
    Ok(())
}

// ─── Memory Channel Dispatcher ───────────────────────────────────────────────

pub async fn handle_memory_channel(
    ch: &str,
    _state: &AppState,
    args: Vec<serde_json::Value>,
) -> Option<Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)>> {
    match ch {
        "global-memory-read" => {
            let mem = load_global_memory();
            Some(Ok(Json(serde_json::json!({ "data": mem }))))
        }
        "global-memory-save-instructions" => {
            let mut mem = load_global_memory();
            if let Some(arg) = args.first() {
                let inst = arg.get("instructions").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(obj) = mem.as_object_mut() {
                    obj.insert("globalMemoryInstructions".to_string(), serde_json::json!(inst));
                    let _ = save_global_memory(&mem);
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": { "ok": true } }))))
        }
        "global-memory-add-profile" => {
            let mut mem = load_global_memory();
            if let Some(arg) = args.first() {
                let key = arg.get("key").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                let value = arg.get("value").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                let category = arg.get("category").and_then(|v| v.as_str()).unwrap_or("user_preference").to_string();
                if !key.is_empty() {
                    if let Some(obj) = mem.as_object_mut() {
                        let profile = obj.entry("userProfile".to_string()).or_insert_with(|| serde_json::json!([]));
                        if let Some(arr) = profile.as_array_mut() {
                            let mut found = false;
                            for item in arr.iter_mut() {
                                if item.get("key").and_then(|v| v.as_str()) == Some(&key) {
                                    if let Some(iobj) = item.as_object_mut() {
                                        iobj.insert("value".to_string(), serde_json::json!(value));
                                        iobj.insert("category".to_string(), serde_json::json!(category));
                                    }
                                    found = true;
                                    break;
                                }
                            }
                            if !found {
                                arr.push(serde_json::json!({ "key": key, "value": value, "category": category }));
                            }
                        }
                        let _ = save_global_memory(&mem);
                    }
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": { "ok": true } }))))
        }
        "global-memory-delete-profile" => {
            let mut mem = load_global_memory();
            if let Some(arg) = args.first() {
                let key = arg.get("key").and_then(|v| v.as_str()).unwrap_or("").trim();
                if let Some(obj) = mem.as_object_mut() {
                    if let Some(arr) = obj.get_mut("userProfile").and_then(|v| v.as_array_mut()) {
                        arr.retain(|item| item.get("key").and_then(|v| v.as_str()) != Some(key));
                        let _ = save_global_memory(&mem);
                    }
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": { "ok": true } }))))
        }
        "global-memory-add-insight" => {
            let mut mem = load_global_memory();
            if let Some(arg) = args.first() {
                let topic = arg.get("topic").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                let lesson = arg.get("lesson").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                let category = arg.get("category").and_then(|v| v.as_str()).unwrap_or("user_preference").to_string();
                if !topic.is_empty() && !lesson.is_empty() {
                    if let Some(obj) = mem.as_object_mut() {
                        let insights = obj.entry("learnedInsights".to_string()).or_insert_with(|| serde_json::json!([]));
                        if let Some(arr) = insights.as_array_mut() {
                            arr.push(serde_json::json!({
                                "id": chrono::Utc::now().timestamp_millis().to_string(),
                                "topic": topic,
                                "lesson": lesson,
                                "category": category,
                                "createdAt": chrono::Utc::now().to_rfc3339()
                            }));
                        }
                        let _ = save_global_memory(&mem);
                    }
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": { "ok": true } }))))
        }
        "global-memory-delete-insight" => {
            let mut mem = load_global_memory();
            if let Some(arg) = args.first() {
                let id = arg.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
                if let Some(obj) = mem.as_object_mut() {
                    if let Some(arr) = obj.get_mut("learnedInsights").and_then(|v| v.as_array_mut()) {
                        arr.retain(|item| item.get("id").and_then(|v| v.as_str()) != Some(id));
                        let _ = save_global_memory(&mem);
                    }
                }
            }
            Some(Ok(Json(serde_json::json!({ "data": { "ok": true } }))))
        }
        "orchestrator-read-instructions" => {
            let inst = load_orchestrator_instructions();
            Some(Ok(Json(serde_json::json!({ "data": inst }))))
        }
        "orchestrator-write-instructions" => {
            if let Some(content) = args.first().and_then(|v| v.as_str()) {
                let _ = save_orchestrator_instructions(content);
            }
            Some(Ok(Json(serde_json::json!({ "data": null }))))
        }
        "orchestrator-update-instructions" => {
            let inst = load_orchestrator_instructions();
            Some(Ok(Json(serde_json::json!({ "data": { "success": true, "updated": true, "instructions": inst } }))))
        }
        "orchestrator-optimize-instructions-by-ai" => {
            let inst = load_orchestrator_instructions();
            Some(Ok(Json(serde_json::json!({ "data": { "success": true, "instructions": inst } }))))
        }
        _ => None,
    }
}
