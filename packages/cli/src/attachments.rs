use std::fs;
use std::path::{Path, PathBuf};
use base64::Engine;
use serde::{Deserialize, Serialize};

pub const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];
pub const MAX_IMAGE_BYTES: u64 = 5 * 1024 * 1024; // 5 MB cap

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImageAttachment {
    pub path: PathBuf,
    pub media_type: String,
    pub data_url: String,
    pub size: u64,
}

/// Sniffs the magic bytes of a buffer to determine the exact image MIME type.
pub fn sniff_image_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 8 {
        if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            return Some("image/png");
        }
        if bytes.starts_with(&[0x47, 0x49, 0x46]) {
            return Some("image/gif");
        }
        if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
            return Some("image/webp");
        }
    }
    if bytes.len() >= 3 && bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.len() >= 2 && bytes.starts_with(&[0x42, 0x4D]) {
        return Some("image/bmp");
    }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(128)]).trim_start().to_string();
    if head.starts_with("<?xml") || head.starts_with("<svg") {
        return Some("image/svg+xml");
    }
    None
}

/// Validates that a file path exists, is under the max size cap, and has a recognized image header.
pub fn validate_image_file<P: AsRef<Path>>(path: P) -> Option<ImageAttachment> {
    let p = path.as_ref();
    if !p.is_file() {
        return None;
    }
    let metadata = fs::metadata(p).ok()?;
    if metadata.len() > MAX_IMAGE_BYTES {
        return None;
    }
    let ext = p.extension()?.to_str()?.to_lowercase();
    if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }

    let bytes = fs::read(p).ok()?;
    let media_type = sniff_image_type(&bytes)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", media_type, b64);

    Some(ImageAttachment {
        path: p.to_path_buf(),
        media_type: media_type.to_string(),
        data_url,
        size: metadata.len(),
    })
}

/// Strips matching surrounding single/double quotes inserted by terminal drag-and-drop.
pub fn strip_wrapping_quotes(t: &str) -> &str {
    let t = t.trim();
    if t.len() >= 2 {
        let first = t.chars().next().unwrap();
        let last = t.chars().last().unwrap();
        if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
            return &t[1..t.len() - 1];
        }
    }
    t
}

/// Scans free text for candidate image paths and returns validated ImageAttachments and cleaned text.
pub fn prepare_attachments(text: &str) -> (String, Vec<ImageAttachment>) {
    let mut attachments = Vec::new();
    let mut validated_paths = std::collections::HashSet::new();

    let tokens: Vec<&str> = text.split_whitespace().collect();

    for token in &tokens {
        let cleaned = strip_wrapping_quotes(token);
        let path = Path::new(cleaned);
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                if let Some(att) = validate_image_file(path) {
                    validated_paths.insert(cleaned.to_string());
                    attachments.push(att);
                }
            }
        }
    }

    let clean_tokens: Vec<&str> = tokens
        .into_iter()
        .filter(|t| !validated_paths.contains(strip_wrapping_quotes(t)))
        .collect();

    (clean_tokens.join(" "), attachments)
}

/// Formats a byte size into human-readable representation.
pub fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}
