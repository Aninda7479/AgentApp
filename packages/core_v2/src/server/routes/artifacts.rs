use std::collections::HashMap;
use std::path::PathBuf;

use axum::{
    extract::{Path as AxumPath, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};

use crate::artifact::ArtifactRuntimeState;
use crate::server::state::AppState;
use crate::storage::settings::get_superagent_dir;

pub async fn list_artifacts(
    State(state): State<AppState>,
) -> Result<Json<Vec<ArtifactRuntimeState>>, StatusCode> {
    let list = state.artifact_runner.scan_artifacts();
    Ok(Json(list))
}

pub async fn start_artifact(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<ArtifactRuntimeState>, StatusCode> {
    state
        .artifact_runner
        .start_artifact(&id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn stop_artifact(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .artifact_runner
        .stop_artifact(&id)
        .await
        .map(|_| Json(serde_json::json!({ "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn get_artifact_sdk() -> impl IntoResponse {
    let sdk_js = r#"
(function (global) {
  'use strict';
  const pathname = window.location.pathname;
  const inferredId = (pathname.match(/\/api\/artifacts\/([^/]+)/) || [])[1] || '';
  const artifactId = window.__ARTIFACT_ID__ || inferredId;
  const origin = window.__SUPERAGENT_SERVER__ || window.location.origin;

  const storage = {
    get artifactId() { return artifactId; },
    async get(key, defaultValue) {
      if (defaultValue === undefined) defaultValue = null;
      if (!artifactId) return defaultValue;
      try {
        const res = await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage/' + encodeURIComponent(key));
        if (!res.ok) return defaultValue;
        const data = await res.json();
        return data.value !== undefined ? data.value : defaultValue;
      } catch (e) {
        try {
          const local = localStorage.getItem('art_' + artifactId + '_' + key);
          return local ? JSON.parse(local) : defaultValue;
        } catch { return defaultValue; }
      }
    },
    async set(key, value) {
      if (!artifactId) return value;
      try {
        localStorage.setItem('art_' + artifactId + '_' + key, JSON.stringify(value));
      } catch {}
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage/' + encodeURIComponent(key), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value })
        });
      } catch (e) {}
      return value;
    },
    async getAll() {
      if (!artifactId) return {};
      try {
        const res = await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage');
        if (!res.ok) return {};
        const json = await res.json();
        return json.data || {};
      } catch { return {}; }
    },
    async setAll(data) {
      if (!artifactId) return data;
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data })
        });
      } catch (e) {}
      return data;
    },
    async remove(key) {
      if (!artifactId) return false;
      try { localStorage.removeItem('art_' + artifactId + '_' + key); } catch {}
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage/' + encodeURIComponent(key), {
          method: 'DELETE'
        });
        return true;
      } catch { return false; }
    },
    async clear() {
      if (!artifactId) return false;
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage', {
          method: 'DELETE'
        });
        return true;
      } catch { return false; }
    }
  };

  global.SuperAgent = global.SuperAgent || {};
  global.SuperAgent.storage = storage;
  global.artifactStorage = storage;
})(window);
"#;

    (
        [(header::CONTENT_TYPE, "application/javascript; charset=utf-8")],
        sdk_js,
    )
}

pub fn get_artifact_dir(id: &str) -> Option<PathBuf> {
    let superagent_dir = get_superagent_dir();
    let candidates = [
        superagent_dir.join("artifacts").join(id),
        superagent_dir.join("artifact").join(id),
    ];
    for cand in &candidates {
        if cand.exists() {
            return Some(cand.clone());
        }
    }
    None
}

pub async fn view_artifact_root(
    AxumPath(id): AxumPath<String>,
) -> impl IntoResponse {
    view_artifact_file(AxumPath((id, String::new()))).await
}

pub async fn view_artifact_file(
    AxumPath((id, subpath)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let art_dir = match get_artifact_dir(&id) {
        Some(d) => d,
        None => return (StatusCode::NOT_FOUND, "Artifact not found").into_response(),
    };

    let canonical_root = match art_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "Artifact directory unresolvable").into_response(),
    };

    let requested_path = if subpath.trim().is_empty() || subpath == "/" {
        canonical_root.join("index.html")
    } else {
        canonical_root.join(subpath.trim_start_matches('/'))
    };

    let target_file = if requested_path.is_dir() {
        requested_path.join("index.html")
    } else {
        requested_path
    };

    // Ensure path remains inside canonical root (path traversal protection)
    let canonical_target = match target_file.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            let fallback = canonical_root.join("index.html");
            if fallback.exists() {
                fallback
            } else {
                return (StatusCode::NOT_FOUND, "File not found").into_response();
            }
        }
    };

    if !canonical_target.starts_with(&canonical_root) {
        return (StatusCode::FORBIDDEN, "Forbidden: Path traversal detected").into_response();
    }

    match tokio::fs::read(&canonical_target).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&canonical_target)
                .first_or_octet_stream()
                .to_string();
            ([(header::CONTENT_TYPE, mime)], bytes).into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "File not found").into_response(),
    }
}

pub async fn get_artifact_storage(
    AxumPath(id): AxumPath<String>,
) -> Json<serde_json::Value> {
    let file = get_superagent_dir().join("artifacts").join(&id).join("storage.json");
    let data: serde_json::Value = tokio::fs::read_to_string(&file)
        .await
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));

    Json(serde_json::json!({ "ok": true, "id": id, "data": data }))
}

pub async fn set_artifact_storage(
    AxumPath(id): AxumPath<String>,
    Json(body): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let payload = body.get("data").cloned().unwrap_or(body);
    let dir = get_superagent_dir().join("artifacts").join(&id);
    let _ = tokio::fs::create_dir_all(&dir).await;
    let file = dir.join("storage.json");
    let _ = tokio::fs::write(&file, serde_json::to_string_pretty(&payload).unwrap_or_default()).await;

    Json(serde_json::json!({ "ok": true, "id": id, "data": payload }))
}

pub async fn clear_artifact_storage(
    AxumPath(id): AxumPath<String>,
) -> Json<serde_json::Value> {
    let file = get_superagent_dir().join("artifacts").join(&id).join("storage.json");
    let _ = tokio::fs::remove_file(file).await;
    Json(serde_json::json!({ "ok": true, "id": id, "cleared": true }))
}

pub async fn get_artifact_storage_key(
    AxumPath((id, key)): AxumPath<(String, String)>,
) -> Json<serde_json::Value> {
    let file = get_superagent_dir().join("artifacts").join(&id).join("storage.json");
    let data: HashMap<String, serde_json::Value> = tokio::fs::read_to_string(&file)
        .await
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let val = data.get(&key).cloned().unwrap_or(serde_json::Value::Null);
    Json(serde_json::json!({ "ok": true, "id": id, "key": key, "value": val }))
}

pub async fn set_artifact_storage_key(
    AxumPath((id, key)): AxumPath<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let value = body.get("value").cloned().unwrap_or(body);
    let dir = get_superagent_dir().join("artifacts").join(&id);
    let _ = tokio::fs::create_dir_all(&dir).await;
    let file = dir.join("storage.json");

    let mut data: HashMap<String, serde_json::Value> = tokio::fs::read_to_string(&file)
        .await
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    data.insert(key.clone(), value.clone());
    let _ = tokio::fs::write(&file, serde_json::to_string_pretty(&data).unwrap_or_default()).await;

    Json(serde_json::json!({ "ok": true, "id": id, "key": key, "value": value }))
}

pub async fn delete_artifact_storage_key(
    AxumPath((id, key)): AxumPath<(String, String)>,
) -> Json<serde_json::Value> {
    let file = get_superagent_dir().join("artifacts").join(&id).join("storage.json");
    let mut data: HashMap<String, serde_json::Value> = tokio::fs::read_to_string(&file)
        .await
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let deleted = data.remove(&key).is_some();
    if deleted {
        let _ = tokio::fs::write(&file, serde_json::to_string_pretty(&data).unwrap_or_default()).await;
    }

    Json(serde_json::json!({ "ok": true, "id": id, "key": key, "deleted": deleted }))
}
