use axum::{http::StatusCode, Json};
use base64::Engine;
use reqwest::multipart::{Form, Part};
use tracing::{error, info, warn};

use crate::server::state::AppState;

pub async fn handle_voice_channel(
    ch: &str,
    state: &AppState,
    args: Vec<serde_json::Value>,
) -> Option<Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)>> {
    match ch {
        "voice-transcribe" | "media-transcribe" | "dictation-transcribe" => {
            let arg = args.first().cloned().unwrap_or_else(|| serde_json::json!({}));

            // 1. Extract audio bytes (base64 string, byte array, or nested object)
            let audio_bytes_opt: Option<Vec<u8>> = if let Some(b64) = arg.get("audio_base64")
                .or_else(|| arg.get("audio"))
                .or_else(|| arg.get("data"))
                .and_then(|v| v.as_str())
            {
                let clean_b64 = if let Some(idx) = b64.find("base64,") {
                    &b64[idx + 7..]
                } else {
                    b64
                };
                base64::engine::general_purpose::STANDARD.decode(clean_b64).ok()
            } else if let Some(arr) = arg.get("buffer").and_then(|v| v.as_array()) {
                let bytes: Vec<u8> = arr.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect();
                if bytes.is_empty() { None } else { Some(bytes) }
            } else {
                None
            };

            let audio_bytes = match audio_bytes_opt {
                Some(b) if !b.is_empty() => b,
                _ => {
                    return Some(Err((
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({ "error": "No audio data supplied in request", "ok": false })),
                    )));
                }
            };

            let filename = arg.get("filename").and_then(|v| v.as_str()).unwrap_or("dictation.wav").to_string();
            let language = arg.get("language").and_then(|v| v.as_str()).map(|s| s.to_string());
            let prompt = arg.get("prompt").and_then(|v| v.as_str()).map(|s| s.to_string());

            let raw_settings = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
            let providers_list = raw_settings.get("providers").and_then(|p| p.as_array());

            // 2. Discover available STT keys (Groq > OpenAI > Gemini)
            let mut groq_key: Option<String> = None;
            let mut openai_key: Option<String> = None;
            let mut gemini_key: Option<String> = None;

            if let Some(list) = providers_list {
                for p in list {
                    let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                    let key = p.get("apiKey").and_then(|v| v.as_str()).map(|s| s.trim().to_string());
                    if let Some(k) = key {
                        if !k.is_empty() {
                            if id == "groq" {
                                groq_key = Some(k);
                            } else if id == "openai" {
                                openai_key = Some(k);
                            } else if id == "gemini" || id == "google" {
                                gemini_key = Some(k);
                            }
                        }
                    }
                }
            }

            if groq_key.is_none() {
                groq_key = state.settings_store.get_api_key("groq").ok().flatten().or_else(|| std::env::var("GROQ_API_KEY").ok());
            }
            if openai_key.is_none() {
                openai_key = state.settings_store.get_api_key("openai").ok().flatten().or_else(|| std::env::var("OPENAI_API_KEY").ok());
            }
            if gemini_key.is_none() {
                gemini_key = state.settings_store.get_api_key("gemini").ok().flatten()
                    .or_else(|| state.settings_store.get_api_key("google").ok().flatten())
                    .or_else(|| std::env::var("GEMINI_API_KEY").or_else(|_| std::env::var("GOOGLE_API_KEY")).ok());
            }

            let http_client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(45))
                .build()
                .unwrap_or_default();

            let mut transcribed_text: Option<String> = None;
            let mut last_error: Option<String> = None;

            // 3A. Try Groq Whisper (Ultra-fast ~200ms latency)
            if let Some(ref key) = groq_key {
                let part = Part::bytes(audio_bytes.clone())
                    .file_name(filename.clone())
                    .mime_str("audio/wav")
                    .unwrap_or_else(|_| Part::bytes(audio_bytes.clone()).file_name(filename.clone()));

                let mut form = Form::new()
                    .part("file", part)
                    .text("model", "whisper-large-v3-turbo")
                    .text("response_format", "json");

                if let Some(ref lang) = language {
                    form = form.text("language", lang.clone());
                }
                if let Some(ref p) = prompt {
                    form = form.text("prompt", p.clone());
                }

                match http_client
                    .post("https://api.groq.com/openai/v1/audio/transcriptions")
                    .header("Authorization", format!("Bearer {}", key))
                    .multipart(form)
                    .send()
                    .await
                {
                    Ok(resp) if resp.status().is_success() => {
                        if let Ok(res_json) = resp.json::<serde_json::Value>().await {
                            if let Some(text) = res_json.get("text").and_then(|v| v.as_str()) {
                                transcribed_text = Some(text.trim().to_string());
                            }
                        }
                    }
                    Ok(resp) => {
                        let status = resp.status();
                        let body = resp.text().await.unwrap_or_default();
                        warn!("Groq Whisper error {}: {}", status, body);
                        last_error = Some(format!("Groq STT error {}: {}", status, body));
                    }
                    Err(e) => {
                        warn!("Groq STT request failed: {}", e);
                        last_error = Some(format!("Groq connection error: {}", e));
                    }
                }
            }

            // 3B. Try OpenAI Whisper
            if transcribed_text.is_none() {
                if let Some(ref key) = openai_key {
                    let part = Part::bytes(audio_bytes.clone())
                        .file_name(filename.clone())
                        .mime_str("audio/wav")
                        .unwrap_or_else(|_| Part::bytes(audio_bytes.clone()).file_name(filename.clone()));

                    let mut form = Form::new()
                        .part("file", part)
                        .text("model", "whisper-1")
                        .text("response_format", "json");

                    if let Some(ref lang) = language {
                        form = form.text("language", lang.clone());
                    }
                    if let Some(ref p) = prompt {
                        form = form.text("prompt", p.clone());
                    }

                    match http_client
                        .post("https://api.openai.com/v1/audio/transcriptions")
                        .header("Authorization", format!("Bearer {}", key))
                        .multipart(form)
                        .send()
                        .await
                    {
                        Ok(resp) if resp.status().is_success() => {
                            if let Ok(res_json) = resp.json::<serde_json::Value>().await {
                                if let Some(text) = res_json.get("text").and_then(|v| v.as_str()) {
                                    transcribed_text = Some(text.trim().to_string());
                                }
                            }
                        }
                        Ok(resp) => {
                            let status = resp.status();
                            let body = resp.text().await.unwrap_or_default();
                            warn!("OpenAI Whisper error {}: {}", status, body);
                            last_error = Some(format!("OpenAI STT error {}: {}", status, body));
                        }
                        Err(e) => {
                            warn!("OpenAI STT request failed: {}", e);
                            last_error = Some(format!("OpenAI connection error: {}", e));
                        }
                    }
                }
            }

            // 3C. Try Gemini Multimodal STT
            if transcribed_text.is_none() {
                if let Some(ref key) = gemini_key {
                    let audio_b64 = base64::engine::general_purpose::STANDARD.encode(&audio_bytes);
                    let body = serde_json::json!({
                        "contents": [{
                            "parts": [
                                {
                                    "text": "Transcribe this spoken audio accurately. Output strictly the verbatim speech text with proper capitalization and punctuation. Do not add explanations or formatting."
                                },
                                {
                                    "inlineData": {
                                        "mimeType": "audio/wav",
                                        "data": audio_b64
                                    }
                                }
                            ]
                        }]
                    });

                    let url = format!(
                        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
                        key
                    );

                    match http_client.post(&url).json(&body).send().await {
                        Ok(resp) if resp.status().is_success() => {
                            if let Ok(res_json) = resp.json::<serde_json::Value>().await {
                                if let Some(text) = res_json
                                    .get("candidates")
                                    .and_then(|c| c.get(0))
                                    .and_then(|c| c.get("content"))
                                    .and_then(|c| c.get("parts"))
                                    .and_then(|p| p.get(0))
                                    .and_then(|p| p.get("text"))
                                    .and_then(|v| v.as_str())
                                {
                                    transcribed_text = Some(text.trim().to_string());
                                }
                            }
                        }
                        Ok(resp) => {
                            let status = resp.status();
                            let body = resp.text().await.unwrap_or_default();
                            warn!("Gemini STT error {}: {}", status, body);
                            last_error = Some(format!("Gemini STT error {}: {}", status, body));
                        }
                        Err(e) => {
                            warn!("Gemini STT request failed: {}", e);
                            last_error = Some(format!("Gemini connection error: {}", e));
                        }
                    }
                }
            }

            // 4. Handle Result & Post-processing (Dictionary & Corrections)
            match transcribed_text {
                Some(mut text) => {
                    // Apply custom corrections from settings
                    if let Some(corrections) = raw_settings
                        .get("voice")
                        .and_then(|v| v.get("dictionary"))
                        .and_then(|d| d.get("corrections"))
                        .and_then(|c| c.as_array())
                    {
                        for corr in corrections {
                            if let (Some(from), Some(to)) = (
                                corr.get("from").and_then(|v| v.as_str()),
                                corr.get("to").and_then(|v| v.as_str()),
                            ) {
                                if !from.trim().is_empty() {
                                    text = text.replace(from, to);
                                }
                            }
                        }
                    }

                    info!("Successfully transcribed voice speech: \"{}\"", text);
                    Some(Ok(Json(serde_json::json!({
                        "ok": true,
                        "text": text,
                        "data": {
                            "text": text,
                            "ok": true
                        }
                    }))))
                }
                None => {
                    let err = last_error.unwrap_or_else(|| {
                        "No Voice STT provider configured. Please add a Groq, OpenAI, or Gemini API key in Settings -> Providers.".to_string()
                    });
                    error!("Voice transcription failed: {}", err);
                    Some(Err((
                        StatusCode::BAD_GATEWAY,
                        Json(serde_json::json!({
                            "ok": false,
                            "error": err,
                            "data": { "text": "", "ok": false, "error": err }
                        })),
                    )))
                }
            }
        }
        _ => None,
    }
}
