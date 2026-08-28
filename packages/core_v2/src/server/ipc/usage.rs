use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::Result;
use axum::{http::StatusCode, Json};

use crate::server::state::AppState;
use crate::storage::settings::{get_superagent_dir, SettingsStore};

// ─── Usage Tracking Helpers ──────────────────────────────────────────────────

pub fn get_usage_log_path() -> PathBuf {
    get_superagent_dir().join("usage-log.json")
}

pub fn load_usage_records() -> Vec<serde_json::Value> {
    let p = get_usage_log_path();
    if p.exists() {
        if let Ok(raw) = std::fs::read_to_string(&p) {
            if let Ok(val) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                return val;
            }
        }
    }
    Vec::new()
}

pub fn save_usage_records(records: &[serde_json::Value]) -> Result<()> {
    let p = get_usage_log_path();
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json_str = serde_json::to_string_pretty(records)?;
    std::fs::write(p, json_str)?;
    Ok(())
}

pub fn calculate_usage_summary() -> Vec<serde_json::Value> {
    let records = load_usage_records();
    let mut map: HashMap<String, serde_json::Value> = HashMap::new();

    for r in records {
        let model = r.get("model").and_then(|v| v.as_str()).unwrap_or("unknown");
        let provider = r.get("provider").and_then(|v| v.as_str()).unwrap_or("unknown");
        let key = format!("{}:{}", provider, model);

        let p_tok = r.get("promptTokens").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let c_tok = r.get("completionTokens").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let t_tok = r.get("totalTokens").and_then(|v| v.as_f64()).unwrap_or(p_tok + c_tok);
        let cost = r.get("cost").and_then(|v| v.as_f64()).unwrap_or(0.0);

        let entry = map.entry(key).or_insert_with(|| {
            serde_json::json!({
                "model": model,
                "provider": provider,
                "totalPromptTokens": 0.0,
                "totalCompletionTokens": 0.0,
                "totalTokens": 0.0,
                "totalCost": 0.0,
                "callCount": 0
            })
        });

        if let Some(obj) = entry.as_object_mut() {
            if let Some(v) = obj.get_mut("totalPromptTokens").and_then(|v| v.as_f64()) {
                obj.insert("totalPromptTokens".to_string(), serde_json::json!(v + p_tok));
            }
            if let Some(v) = obj.get_mut("totalCompletionTokens").and_then(|v| v.as_f64()) {
                obj.insert("totalCompletionTokens".to_string(), serde_json::json!(v + c_tok));
            }
            if let Some(v) = obj.get_mut("totalTokens").and_then(|v| v.as_f64()) {
                obj.insert("totalTokens".to_string(), serde_json::json!(v + t_tok));
            }
            if let Some(v) = obj.get_mut("totalCost").and_then(|v| v.as_f64()) {
                obj.insert("totalCost".to_string(), serde_json::json!(v + cost));
            }
            if let Some(v) = obj.get_mut("callCount").and_then(|v| v.as_i64()) {
                obj.insert("callCount".to_string(), serde_json::json!(v + 1));
            }
        }
    }

    map.into_values().collect()
}

pub fn get_default_pricing_catalog() -> Vec<serde_json::Value> {
    let mut catalog: Vec<serde_json::Value> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // 1. First populate all models configured in user's workspace settings
    let raw_settings = SettingsStore::new().load_raw().unwrap_or_default();

    if let Some(models) = raw_settings.get("models").and_then(|m| m.as_array()) {
        for m in models {
            let model_id = m.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let provider_id = m.get("providerId").and_then(|v| v.as_str()).unwrap_or("");
            if !model_id.is_empty() && !provider_id.is_empty() {
                let key = format!("{}:{}", provider_id, model_id);
                if !seen.contains(&key) {
                    seen.insert(key);
                    let (in_rate, out_rate) = get_model_pricing(provider_id, model_id);
                    let display_name = m.get("name").and_then(|v| v.as_str()).unwrap_or(model_id);
                    catalog.push(serde_json::json!({
                        "model": model_id,
                        "name": display_name,
                        "provider": provider_id,
                        "inputPrice": in_rate,
                        "outputPrice": out_rate,
                    }));
                }
            }
        }
    }

    // 2. Add standard known catalog entries
    let defaults = [
        ("gemini-2.5-flash", "gemini"),
        ("gemini-2.5-pro", "gemini"),
        ("gemini-3.5-flash-lite", "gemini"),
        ("gemini-2.0-flash", "gemini"),
        ("gemini-1.5-pro", "gemini"),
        ("gpt-4o", "openai"),
        ("gpt-4o-mini", "openai"),
        ("o3-mini", "openai"),
        ("claude-3-7-sonnet", "anthropic"),
        ("claude-3-5-sonnet", "anthropic"),
        ("claude-3-5-haiku", "anthropic"),
        ("deepseek-chat", "deepseek"),
        ("deepseek-reasoner", "deepseek"),
        ("llama-3.3-70b", "groq"),
    ];

    for (mod_id, prov_id) in defaults {
        let key = format!("{}:{}", prov_id, mod_id);
        if !seen.contains(&key) {
            seen.insert(key);
            let (in_rate, out_rate) = get_model_pricing(prov_id, mod_id);
            catalog.push(serde_json::json!({
                "model": mod_id,
                "name": mod_id,
                "provider": prov_id,
                "inputPrice": in_rate,
                "outputPrice": out_rate,
            }));
        }
    }

    catalog
}

pub fn get_model_pricing(provider: &str, model: &str) -> (f64, f64) {
    let clean_model = model.to_lowercase();
    let clean_provider = provider.to_lowercase();

    if clean_provider == "ollama" || clean_provider == "omniroute" || clean_model.contains("local") {
        return (0.0, 0.0);
    }
    // Gemini models
    if clean_model.contains("gemini-3.5-flash-lite") || clean_model.contains("flash-lite") {
        return (0.05, 0.20);
    }
    if clean_model.contains("gemini-2.5-pro") {
        return (1.25, 5.00);
    }
    if clean_model.contains("gemini-2.5-flash") || clean_model.contains("gemini-2.0-flash") || clean_model.contains("gemini-1.5-flash") || clean_model.contains("flash") {
        return (0.075, 0.30);
    }
    if clean_model.contains("gemini-1.5-pro") || clean_model.contains("gemini-pro") || clean_model.contains("gemini") {
        return (1.25, 5.00);
    }
    // OpenAI models
    if clean_model.contains("gpt-4o-mini") {
        return (0.15, 0.60);
    }
    if clean_model.contains("gpt-4o") || clean_model.contains("chatgpt-4o") {
        return (2.50, 10.00);
    }
    if clean_model.contains("o3-mini") {
        return (1.10, 4.40);
    }
    if clean_model.contains("o1") {
        return (15.00, 60.00);
    }
    // Anthropic models
    if clean_model.contains("claude-3-7-sonnet") || clean_model.contains("claude-3-5-sonnet") || clean_model.contains("sonnet") {
        return (3.00, 15.00);
    }
    if clean_model.contains("claude-3-5-haiku") || clean_model.contains("haiku") {
        return (0.80, 4.00);
    }
    if clean_model.contains("claude-3-opus") || clean_model.contains("opus") {
        return (15.00, 75.00);
    }
    // DeepSeek models
    if clean_model.contains("deepseek-reasoner") || clean_model.contains("r1") {
        return (0.55, 2.19);
    }
    if clean_model.contains("deepseek-chat") || clean_model.contains("deepseek") {
        return (0.14, 0.28);
    }
    // Groq models
    if clean_provider.contains("groq") {
        return (0.59, 0.79);
    }
    (0.15, 0.60)
}

pub fn record_usage(
    provider: &str,
    model: &str,
    prompt_tokens: usize,
    completion_tokens: usize,
    duration_ms: u64,
    status: &str,
) {
    let (in_rate, out_rate) = get_model_pricing(provider, model);
    let prompt_cost = (prompt_tokens as f64 * in_rate) / 1_000_000.0;
    let completion_cost = (completion_tokens as f64 * out_rate) / 1_000_000.0;
    let total_cost = prompt_cost + completion_cost;

    let new_record = serde_json::json!({
        "model": model,
        "provider": provider,
        "promptTokens": prompt_tokens,
        "completionTokens": completion_tokens,
        "totalTokens": prompt_tokens + completion_tokens,
        "cost": total_cost,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "durationMs": duration_ms,
        "status": status,
    });

    let mut records = load_usage_records();
    records.push(new_record);
    if records.len() > 5000 {
        records.drain(0..(records.len() - 5000));
    }
    let _ = save_usage_records(&records);
}

// ─── Usage Channel Dispatcher ────────────────────────────────────────────────

pub async fn handle_usage_channel(
    ch: &str,
    _state: &AppState,
    args: Vec<serde_json::Value>,
) -> Option<Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)>> {
    match ch {
        "usage-summary" => Some(Ok(Json(serde_json::json!({ "data": calculate_usage_summary() })))),
        "usage-records" => Some(Ok(Json(serde_json::json!({ "data": load_usage_records() })))),
        "usage-clear" => {
            let _ = save_usage_records(&[]);
            Some(Ok(Json(serde_json::json!({ "data": null }))))
        }
        "usage-pricing" => Some(Ok(Json(serde_json::json!({ "data": get_default_pricing_catalog() })))),
        "usage-track" | "usage-record-add" => {
            if let Some(arg) = args.first() {
                let provider = arg.get("provider").and_then(|v| v.as_str()).unwrap_or("unknown");
                let model = arg.get("model").and_then(|v| v.as_str()).unwrap_or("unknown");
                let p_tok = arg.get("promptTokens").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let c_tok = arg.get("completionTokens").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let dur = arg.get("durationMs").and_then(|v| v.as_u64()).unwrap_or(0);
                let status = arg.get("status").and_then(|v| v.as_str()).unwrap_or("success");
                record_usage(provider, model, p_tok, c_tok, dur, status);
            }
            Some(Ok(Json(serde_json::json!({ "data": { "success": true } }))))
        }
        _ => None,
    }
}
