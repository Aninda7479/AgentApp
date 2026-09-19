use std::path::PathBuf;

use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::Response,
};
use serde::Deserialize;
use tokio_util::io::ReaderStream;

use crate::server::state::AppState;
use crate::storage::settings::{get_cache_dir, get_superagent_dir};

#[derive(Debug, Deserialize)]
pub struct StorageFileQuery {
    pub path: String,
    pub download: Option<bool>,
}

fn path_is_jailed(target: &std::path::Path, allowed_roots: &[PathBuf]) -> bool {
    let target_norm = target
        .canonicalize()
        .unwrap_or_else(|_| target.to_path_buf());
    for root in allowed_roots {
        let root_norm = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
        if target_norm.starts_with(&root_norm) {
            return true;
        }
    }
    false
}

pub async fn serve_storage_file(
    State(state): State<AppState>,
    Query(query): Query<StorageFileQuery>,
) -> Result<Response, StatusCode> {
    if query.path.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let target = PathBuf::from(&query.path);
    let allowed_roots = vec![
        get_superagent_dir(),
        get_cache_dir(),
        state.workspace_root.clone(),
    ];

    if !path_is_jailed(&target, &allowed_roots) {
        return Err(StatusCode::FORBIDDEN);
    }

    if !target.exists() || !target.is_file() {
        return Err(StatusCode::NOT_FOUND);
    }

    let file = tokio::fs::File::open(&target)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let meta = file
        .metadata()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let content_length = meta.len();

    let mime = mime_guess::from_path(&target)
        .first_or_octet_stream()
        .to_string();

    let filename = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let mut response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, content_length.to_string())
        .header(header::ACCEPT_RANGES, "bytes");

    if query.download == Some(true) {
        let safe_filename = filename.replace(['"', '\\', '\r', '\n'], "_");
        response = response.header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", safe_filename),
        );
    } else {
        response = response.header(
            header::CONTENT_DISPOSITION,
            format!(
                "inline; filename=\"{}\"",
                filename.replace(['"', '\\', '\r', '\n'], "_")
            ),
        );
    }

    response
        .body(body)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
