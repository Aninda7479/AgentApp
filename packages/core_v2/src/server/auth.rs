use axum::{
    extract::{Path as AxumPath, Request, State},
    http::{header, HeaderMap, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};

use crate::server::spa::{find_ui_dist_dir, EmbeddedUi};
use crate::server::state::{AppState, AuthLoginRequest, AuthPasswordRequest, AuthVerifyRequest};

/// Helper extracting session token from cookie or Authorization header.
pub fn extract_session_token(headers: &HeaderMap) -> Option<String> {
    if let Some(auth_val) = headers.get(header::AUTHORIZATION) {
        if let Ok(auth_str) = auth_val.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                return Some(token.trim().to_string());
            }
        }
    }
    if let Some(cookie_val) = headers.get(header::COOKIE) {
        if let Ok(cookie_str) = cookie_val.to_str() {
            for part in cookie_str.split(';') {
                let part = part.trim();
                if let Some(token) = part.strip_prefix("sa_session=") {
                    return Some(token.to_string());
                }
                if let Some(token) = part.strip_prefix("session=") {
                    return Some(token.to_string());
                }
                if let Some(token) = part.strip_prefix("sess=") {
                    return Some(token.to_string());
                }
            }
        }
    }
    None
}

/// Verifies whether a request is authenticated when auth is required.
pub fn is_request_authenticated(state: &AppState, headers: &HeaderMap) -> bool {
    let disable_auth = std::env::var("SUPERAGENT_DISABLE_AUTH").map(|v| v == "true").unwrap_or(false);
    if disable_auth {
        return true;
    }
    let settings = state.settings_store.load().unwrap_or_default();
    let auth_required = settings.enable_auth.unwrap_or(true);
    if !auth_required {
        return true;
    }
    if let Some(token) = extract_session_token(headers) {
        state.auth_store.validate_session_token(&token).is_some()
    } else {
        false
    }
}

pub fn is_public_path(path: &str) -> bool {
    let clean = path.trim_end_matches('/');
    matches!(
        clean,
        "/login"
            | "/health"
            | "/api/health"
            | "/api/auth/status"
            | "/api/auth/login"
            | "/api/auth/setup"
            | "/api/ipc/circle-search-analyze"
            | "/api/ipc/voice-transcribe"
            | "/api/ipc/media-transcribe"
            | "/api/ipc/dictation-transcribe"
            | "/manifest.json"
            | "/icon.svg"
            | "/icon.png"
            | "/favicon.ico"
    ) || path.ends_with("/sdk.js")
        || path.ends_with(".css")
        || path.ends_with(".js")
        || path.ends_with(".png")
        || path.ends_with(".svg")
        || path.ends_with(".ico")
        || path.ends_with(".woff")
        || path.ends_with(".woff2")
        || path.ends_with(".ttf")
        || path.ends_with(".map")
        || path.ends_with(".jpg")
        || path.ends_with(".jpeg")
        || path.ends_with(".webp")
        || path.ends_with(".gif")
        || path.ends_with(".mp4")
        || path.ends_with(".webm")
        || (path.starts_with("/api/images/generations/") && path.ends_with("/file"))
        || (path.starts_with("/api/videos/generations/") && (path.ends_with("/file") || path.ends_with("/thumbnail")))
}


/// Axum middleware guarding all protected API routes, WebSockets, and SPA pages.
pub async fn auth_middleware(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Response {
    // Allow CORS preflight requests
    if req.method() == Method::OPTIONS {
        return next.run(req).await;
    }

    let path = req.uri().path().to_string();

    // Check if auth is disabled via environment variable override
    let disable_auth = std::env::var("SUPERAGENT_DISABLE_AUTH").map(|v| v == "true").unwrap_or(false);
    if disable_auth {
        return next.run(req).await;
    }

    // Check if auth is explicitly disabled in settings
    let settings = state.settings_store.load().unwrap_or_default();
    let auth_required = settings.enable_auth.unwrap_or(true);
    if !auth_required {
        return next.run(req).await;
    }

    // Allow public endpoints (login, status, health, static brand & assets)
    if is_public_path(&path) {
        return next.run(req).await;
    }

    // Check headers (Authorization: Bearer <token> or Cookie sa_session=...)
    if is_request_authenticated(&state, req.headers()) {
        return next.run(req).await;
    }

    // Check query params (?token=... or ?sa_session=...) for WebSocket upgrades or direct links
    if let Some(query) = req.uri().query() {
        for part in query.split('&') {
            if let Some(token) = part.strip_prefix("token=").or_else(|| part.strip_prefix("sa_session=")) {
                if state.auth_store.validate_session_token(token).is_some() {
                    return next.run(req).await;
                }
            }
        }
    }

    // If unauthenticated: API and WebSocket calls get 401 JSON
    if path.starts_with("/api/") || path.starts_with("/ws/") {
        return (
            StatusCode::UNAUTHORIZED,
            [
                (header::CONTENT_TYPE, "application/json"),
            ],
            serde_json::json!({
                "error": "Authentication required",
                "authRequired": true
            }).to_string(),
        ).into_response();
    }

    // Browser navigation / page requests get redirected to /login
    (
        StatusCode::FOUND,
        [
            (header::LOCATION, "/login"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        "",
    ).into_response()
}

pub async fn serve_login(State(state): State<AppState>) -> Response {
    let dist_opt = state
        .ui_dist_dir
        .as_ref()
        .cloned()
        .or_else(|| find_ui_dist_dir(&state.workspace_root));

    if let Some(ref dist) = dist_opt {
        let login_file = dist.join("login.html");
        if let Ok(html) = tokio::fs::read_to_string(&login_file).await {
            return (
                [
                    (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                    (header::CACHE_CONTROL, "no-cache"),
                ],
                html,
            )
                .into_response();
        }
    }

    if let Some(file) = EmbeddedUi::get("login.html") {
        return (
            [
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                (header::CACHE_CONTROL, "no-cache"),
            ],
            file.data.into_owned(),
        )
            .into_response();
    }

    (StatusCode::NOT_FOUND, "login.html not found").into_response()
}

pub async fn get_auth_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let raw_settings = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
    let owner_name = raw_settings.get("general").and_then(|g| g.get("ownerName")).and_then(|v| v.as_str());

    let disable_auth = std::env::var("SUPERAGENT_DISABLE_AUTH").map(|v| v == "true").unwrap_or(false);
    let settings = state.settings_store.load().unwrap_or_default();
    let auth_required = !disable_auth && settings.enable_auth.unwrap_or(true);
    let password_set = state.auth_store.is_password_set();

    let authenticated = if !auth_required {
        true
    } else if let Some(token) = extract_session_token(&headers) {
        state.auth_store.validate_session_token(&token).is_some()
    } else {
        false
    };

    Json(serde_json::json!({
        "authenticated": authenticated,
        "authRequired": auth_required,
        "passwordSet": password_set,
        "ownerName": owner_name,
        "user": if authenticated { Some("admin") } else { None },
        "version": env!("CARGO_PKG_VERSION")
    }))
}

pub async fn setup_auth(
    State(state): State<AppState>,
    Json(req): Json<AuthLoginRequest>,
) -> Result<Response, StatusCode> {
    if state.auth_store.is_password_set() {
        return Ok((
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "ok": false,
                "error": "A password has already been set. Please sign in."
            })),
        )
            .into_response());
    }

    if let Err(e) = state.auth_store.set_password(&req.password, Some("admin")) {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": e.to_string()
            })),
        )
            .into_response());
    }

    let token = state.auth_store.create_session_token("admin");
    let cookie_header = format!("sa_session={}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax", token);
    let body = Json(serde_json::json!({
        "ok": true,
        "success": true,
        "token": token,
        "username": "admin"
    }));

    let mut res = body.into_response();
    if let Ok(val) = header::HeaderValue::from_str(&cookie_header) {
        res.headers_mut().insert(header::SET_COOKIE, val);
    }
    Ok(res)
}

pub async fn login_auth(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<AuthLoginRequest>,
) -> Result<Response, StatusCode> {
    let ip = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("127.0.0.1")
        .to_string();

    if state.auth_store.is_locked(&ip) {
        return Ok((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "ok": false,
                "error": "Too many failed attempts. Account temporarily locked for 15 minutes."
            })),
        )
            .into_response());
    }

    if state.auth_store.verify_password(&req.username, &req.password) {
        state.auth_store.clear_failed_attempts(&ip);
        let user_agent = headers
            .get(header::USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let token = state.auth_store.create_session_with_metadata(
            &req.username,
            Some(ip),
            user_agent,
        );

        let cookie_header = format!("sa_session={}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax", token);
        let body = Json(serde_json::json!({
            "ok": true,
            "success": true,
            "token": token,
            "username": req.username
        }));

        let mut res = body.into_response();
        if let Ok(val) = header::HeaderValue::from_str(&cookie_header) {
            res.headers_mut().insert(header::SET_COOKIE, val);
        }
        Ok(res)
    } else {
        state.auth_store.record_failed_attempt(&ip);
        Ok((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "ok": false,
                "error": "Invalid password"
            })),
        )
            .into_response())
    }
}

pub async fn logout_auth(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Some(token) = extract_session_token(&headers) {
        state.auth_store.invalidate_session(&token);
    }
    let mut res = Json(serde_json::json!({ "ok": true, "success": true })).into_response();
    if let Ok(val) = header::HeaderValue::from_str("sa_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax") {
        res.headers_mut().insert(header::SET_COOKIE, val);
    }
    res
}

pub async fn verify_auth_token(
    State(state): State<AppState>,
    Json(req): Json<AuthVerifyRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if let Some(token) = req.token {
        if let Some(user) = state.auth_store.validate_session_token(&token) {
            return Ok(Json(serde_json::json!({
                "valid": true,
                "username": user
            })));
        }
    }
    Err(StatusCode::UNAUTHORIZED)
}

pub async fn change_auth_password(
    State(state): State<AppState>,
    Json(req): Json<AuthPasswordRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let current_pass = req.current_password.unwrap_or_else(|| "admin123".to_string());
    state
        .auth_store
        .change_password(&req.username, &current_pass, &req.new_password)
        .map(|_| Json(serde_json::json!({ "ok": true, "success": true })))
        .map_err(|_| StatusCode::BAD_REQUEST)
}

pub async fn get_auth_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_request_authenticated(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let current_token = extract_session_token(&headers);
    let mut list = state.auth_store.list_sessions("admin");

    // Sort by last_used descending, but keep current session at the top
    list.sort_by(|a, b| {
        let is_a_cur = current_token.as_ref().map(|ct| ct == &a.token).unwrap_or(false);
        let is_b_cur = current_token.as_ref().map(|ct| ct == &b.token).unwrap_or(false);
        if is_a_cur && !is_b_cur {
            std::cmp::Ordering::Less
        } else if !is_a_cur && is_b_cur {
            std::cmp::Ordering::Greater
        } else {
            b.last_used.cmp(&a.last_used)
        }
    });

    let sessions: Vec<serde_json::Value> = list
        .into_iter()
        .map(|s| {
            let is_current = current_token.as_ref().map(|ct| ct == &s.token).unwrap_or(false);
            serde_json::json!({
                "id": s.token,
                "token": s.token,
                "username": s.username,
                "userAgent": s.user_agent.as_deref().unwrap_or("Web Browser"),
                "ip": s.ip.as_deref().unwrap_or("127.0.0.1"),
                "issuedAt": s.created_at,
                "lastSeenAt": s.last_used,
                "isCurrent": is_current,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "sessions": sessions,
        "currentSessionId": current_token,
    })))
}

pub async fn delete_auth_device(
    State(state): State<AppState>,
    AxumPath(session_id): AxumPath<String>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_request_authenticated(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let deleted = state.auth_store.invalidate_session(&session_id);
    Ok(Json(serde_json::json!({ "ok": deleted, "success": deleted })))
}

pub async fn get_auth_history(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_request_authenticated(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut history = state.auth_store.get_login_history();
    history.sort_by(|a, b| {
        let ts_a = a.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        let ts_b = b.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        ts_b.cmp(&ts_a)
    });
    Ok(Json(serde_json::json!({
        "history": history
    })))
}
