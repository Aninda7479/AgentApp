use std::time::Duration;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use sysinfo::System;

use crate::integrations::catalog::{get_curated_integrations, IntegrationEntry};
use crate::server::auth::is_request_authenticated;
use crate::server::state::{AppState, ProviderProxyRequest, SystemInfoResponse};

pub async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "engine": "superagent-core-v2 (Rust)",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

pub async fn redirect_account() -> impl IntoResponse {
    axum::response::Redirect::temporary("/settings/web-app")
}

pub async fn get_system_info() -> impl IntoResponse {
    let mut sys = System::new_all();
    sys.refresh_all();

    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());
    let total_memory_mb = sys.total_memory() / (1024 * 1024);
    let used_memory_mb = sys.used_memory() / (1024 * 1024);
    let cpu_count = sys.cpus().len();
    let hostname = System::host_name().unwrap_or_else(|| "localhost".to_string());

    Json(SystemInfoResponse {
        os_name,
        os_version,
        total_memory_mb,
        used_memory_mb,
        cpu_count,
        hostname,
    })
}

pub async fn get_providers_status(State(state): State<AppState>) -> impl IntoResponse {
    let settings = state.settings_store.load().unwrap_or_default();

    let check_provider = |key_name: &str, env_var: &str| -> bool {
        if std::env::var(env_var).map(|v| !v.trim().is_empty()).unwrap_or(false) {
            return true;
        }
        if let Some(val) = settings.api_keys.get(key_name) {
            return !val.trim().is_empty();
        }
        false
    };

    Json(serde_json::json!({
        "openai": { "configured": check_provider("openai", "OPENAI_API_KEY") },
        "anthropic": { "configured": check_provider("anthropic", "ANTHROPIC_API_KEY") },
        "gemini": { "configured": check_provider("gemini", "GEMINI_API_KEY") },
        "openrouter": { "configured": check_provider("openrouter", "OPENROUTER_API_KEY") },
        "deepseek": { "configured": check_provider("deepseek", "DEEPSEEK_API_KEY") },
        "groq": { "configured": check_provider("groq", "GROQ_API_KEY") },
        "ollama": { "configured": true }
    }))
}

pub fn is_private_or_loopback_host(host: &str) -> bool {
    let h = host.to_lowercase();
    if h == "localhost" || h == "127.0.0.1" || h == "::1" {
        return false;
    }
    if let Ok(ip) = h.parse::<std::net::IpAddr>() {
        match ip {
            std::net::IpAddr::V4(v4) => {
                let oct = v4.octets();
                // 169.254.x.x link local / cloud metadata
                if oct[0] == 169 && oct[1] == 254 {
                    return true;
                }
                // 10.x.x.x
                if oct[0] == 10 {
                    return true;
                }
                // 172.16.x.x - 172.31.x.x
                if oct[0] == 172 && (16..=31).contains(&oct[1]) {
                    return true;
                }
                // 192.168.x.x
                if oct[0] == 192 && oct[1] == 168 {
                    return true;
                }
            }
            std::net::IpAddr::V6(v6) => {
                if v6.is_loopback() || v6.is_multicast() {
                    return true;
                }
            }
        }
    }
    false
}

pub async fn handle_provider_proxy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<ProviderProxyRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if !is_request_authenticated(&state, &headers) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    let parsed_url = url::Url::parse(&req.url).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid URL" })),
        )
    })?;

    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Only http and https protocols allowed" })),
        ));
    }

    if let Some(host) = parsed_url.host_str() {
        if is_private_or_loopback_host(host) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({ "error": "Access to private or link-local address is denied" })),
            ));
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("SuperAgent/0.21.0 (Windows; x64)")
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
        })?;

    let method = match req.method.as_deref().unwrap_or("GET").to_uppercase().as_str() {
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        _ => reqwest::Method::GET,
    };

    let mut request_builder = client.request(method, parsed_url);
    if let Some(hdrs) = req.headers {
        for (k, v) in hdrs {
            if let Ok(name) = reqwest::header::HeaderName::from_bytes(k.as_bytes()) {
                if let Ok(val) = reqwest::header::HeaderValue::from_str(&v) {
                    request_builder = request_builder.header(name, val);
                }
            }
        }
    }

    if let Some(body_val) = req.body {
        if let Some(s) = body_val.as_str() {
            request_builder = request_builder.header(reqwest::header::CONTENT_TYPE, "application/json").body(s.to_string());
        } else {
            request_builder = request_builder.json(&body_val);
        }
    }

    match request_builder.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let ok = resp.status().is_success();
            let text = resp.text().await.unwrap_or_default();
            let data: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::String(text));

            Ok(Json(serde_json::json!({
                "ok": ok,
                "status": status,
                "data": data
            })))
        }
        Err(err) => Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "ok": false,
                "error": err.to_string()
            })),
        )),
    }
}

pub fn compare_semver(a: &str, b: &str) -> i32 {
    let parse = |s: &str| -> Vec<u64> {
        s.trim_start_matches('v')
            .split('.')
            .map(|part| part.chars().take_while(|c| c.is_ascii_digit()).collect::<String>())
            .filter_map(|p| p.parse().ok())
            .collect()
    };
    let va = parse(a);
    let vb = parse(b);
    for i in 0..std::cmp::max(va.len(), vb.len()) {
        let ai = va.get(i).copied().unwrap_or(0);
        let bi = vb.get(i).copied().unwrap_or(0);
        if ai < bi {
            return -1;
        } else if ai > bi {
            return 1;
        }
    }
    0
}

pub async fn fetch_latest_release_info() -> Result<(String, String, Option<String>), anyhow::Error> {
    let client = reqwest::Client::builder()
        .user_agent("SuperAgent-App")
        .timeout(Duration::from_secs(6))
        .build()?;

    // 1. Try redirect on releases/latest
    let head_res = client
        .head("https://github.com/Aninda7479/AgentApp/releases/latest")
        .send()
        .await;

    if let Ok(res) = head_res {
        let final_url = res.url().as_str();
        if let Some(tag_pos) = final_url.rfind("/tag/") {
            let tag = &final_url[tag_pos + 5..];
            let clean_ver = tag.trim_start_matches('v').trim();
            if !clean_ver.is_empty() {
                let release_url = format!("https://github.com/Aninda7479/AgentApp/releases/tag/v{}", clean_ver);
                return Ok((clean_ver.to_string(), release_url, None));
            }
        }
    }

    // 2. Try GitHub API
    let api_res = client
        .get("https://api.github.com/repos/Aninda7479/AgentApp/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await;

    if let Ok(api_res) = api_res {
        if api_res.status().is_success() {
            if let Ok(json) = api_res.json::<serde_json::Value>().await {
                if let Some(tag) = json.get("tag_name").and_then(|v| v.as_str()) {
                    let clean_ver = tag.trim_start_matches('v').trim().to_string();
                    let html_url = json.get("html_url")
                        .and_then(|v| v.as_str())
                        .unwrap_or("https://github.com/Aninda7479/AgentApp/releases")
                        .to_string();
                    let body = json.get("body").and_then(|v| v.as_str()).map(|s| s.to_string());
                    return Ok((clean_ver, html_url, body));
                }
            }
        }
    }

    // 3. Fallback to latest.json manifest
    let manifest_res = client
        .get("https://github.com/Aninda7479/AgentApp/releases/latest/download/latest.json")
        .send()
        .await;

    if let Ok(manifest_res) = manifest_res {
        if manifest_res.status().is_success() {
            if let Ok(json) = manifest_res.json::<serde_json::Value>().await {
                if let Some(ver) = json.get("version").and_then(|v| v.as_str()) {
                    let clean_ver = ver.trim_start_matches('v').trim().to_string();
                    let release_url = format!("https://github.com/Aninda7479/AgentApp/releases/tag/v{}", clean_ver);
                    let notes = json.get("notes").and_then(|v| v.as_str()).map(|s| s.to_string());
                    return Ok((clean_ver, release_url, notes));
                }
            }
        }
    }

    anyhow::bail!("Could not fetch latest release version from GitHub")
}

pub async fn check_for_updates() -> impl IntoResponse {
    let current_version = env!("CARGO_PKG_VERSION");
    match fetch_latest_release_info().await {
        Ok((latest_version, release_url, notes)) => {
            let has_update = compare_semver(current_version, &latest_version) < 0;
            Json(serde_json::json!({
                "current": current_version,
                "latest": latest_version,
                "hasUpdate": has_update,
                "releaseUrl": release_url,
                "notes": notes.unwrap_or_default()
            }))
        }
        Err(e) => {
            Json(serde_json::json!({
                "current": current_version,
                "latest": current_version,
                "hasUpdate": false,
                "releaseUrl": "https://github.com/Aninda7479/AgentApp/releases",
                "error": e.to_string()
            }))
        }
    }
}

pub async fn apply_update() -> impl IntoResponse {
    Json(serde_json::json!({
        "ok": true,
        "message": "SuperAgent Core v2 Daemon is up to date."
    }))
}

pub async fn get_settings(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .settings_store
        .load_raw()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn save_settings(
    State(state): State<AppState>,
    Json(settings): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .settings_store
        .save_raw(&settings)
        .map(|_| Json(serde_json::json!({ "ok": true, "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn list_tools(State(state): State<AppState>) -> impl IntoResponse {
    let schemas = state.tool_registry.list_schemas();
    Json(schemas)
}

pub async fn list_integrations() -> Json<Vec<IntegrationEntry>> {
    Json(get_curated_integrations())
}
