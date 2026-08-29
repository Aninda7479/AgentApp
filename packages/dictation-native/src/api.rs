use base64::Engine;
use serde::Serialize;

#[derive(Serialize)]
struct TranscribePayload {
    audio_base64: String,
    filename: String,
    language: Option<String>,
    prompt: Option<String>,
}

#[derive(Serialize)]
struct IpcEnvelope {
    args: Vec<TranscribePayload>,
    audio_base64: String,
    filename: String,
}

fn get_local_session_token() -> Option<String> {
    if let Ok(tok) = std::env::var("SUPERAGENT_SESSION_TOKEN") {
        if !tok.trim().is_empty() {
            return Some(tok.trim().to_string());
        }
    }

    let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok()?;
    let home_path = std::path::PathBuf::from(home);
    let candidates = [
        home_path.join(".superagent").join("config").join("auth.json"),
        home_path.join(".superagent").join("Config").join("auth.json"),
        home_path.join(".superagent").join("auth.json"),
        std::path::PathBuf::from(".").join(".superagent").join("auth.json"),
    ];

    for path in &candidates {
        if let Ok(content) = std::fs::read_to_string(path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(sessions) = val.get("sessions").and_then(|s| s.as_array()) {
                    if let Some(first_session) = sessions.first() {
                        if let Some(tok) = first_session.get("token").or_else(|| first_session.get("id")).and_then(|t| t.as_str()) {
                            if !tok.trim().is_empty() {
                                return Some(tok.trim().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

pub async fn query_voice_transcribe(wav_bytes: &[u8]) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(wav_bytes);

    let item = TranscribePayload {
        audio_base64: b64.clone(),
        filename: "dictation.wav".to_string(),
        language: None,
        prompt: None,
    };

    let envelope = IpcEnvelope {
        args: vec![item],
        audio_base64: b64,
        filename: "dictation.wav".to_string(),
    };

    let url = "http://127.0.0.1:1469/api/ipc/voice-transcribe";
    let mut req_builder = client.post(url).json(&envelope);

    if let Some(token) = get_local_session_token() {
        req_builder = req_builder.header("Authorization", format!("Bearer {}", token));
    }

    let resp = req_builder
        .send()
        .await
        .map_err(|e| format!("Failed to reach SuperAgent core engine (port 1469): {}. Is the app running?", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Server returned error {}: {}", status, err_text));
    }

    let parsed: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

    if let Some(text) = parsed.get("data").and_then(|d| d.get("text")).and_then(|v| v.as_str()) {
        Ok(text.to_string())
    } else if let Some(text) = parsed.get("text").and_then(|v| v.as_str()) {
        Ok(text.to_string())
    } else if let Some(err) = parsed.get("error").and_then(|v| v.as_str()) {
        Err(err.to_string())
    } else {
        Ok(parsed.to_string())
    }
}
