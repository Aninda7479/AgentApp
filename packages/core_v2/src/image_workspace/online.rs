use std::time::Instant;

use anyhow::{anyhow, Result};
use base64::Engine;
use reqwest::Client;
use serde_json::json;
use tokio::sync::mpsc::Sender;
use tracing::info;
use uuid::Uuid;

use crate::image_workspace::types::{
    GenerateImageRequest, GenerateImageResponse, GenerationProgressEvent,
};
use crate::storage::image_storage::{GenerationRecord, ImageStorage};
use crate::storage::settings::SettingsStore;

pub struct OnlineImageGenerator;

impl OnlineImageGenerator {
    pub async fn generate(
        req: &GenerateImageRequest,
        settings_store: &SettingsStore,
        storage: &ImageStorage,
        progress_tx: Option<Sender<GenerationProgressEvent>>,
    ) -> Result<GenerateImageResponse> {
        let start_time = Instant::now();
        Self::send_progress(
            &progress_tx,
            "Resolving model and provider credentials...",
            0.05,
            0.0,
        )
        .await;

        let raw_settings = settings_store
            .load_raw()
            .unwrap_or_else(|_| serde_json::json!({}));

        // 1. Resolve model ID and provider
        let (resolved_model, provider_id) = Self::resolve_model_and_provider(req, &raw_settings)?;

        // 2. Resolve API key and Base URL
        let (api_key, base_url) =
            Self::resolve_credentials(&provider_id, settings_store, &raw_settings)?;

        info!(
            "Starting online image generation: model='{}', provider='{}', prompt='{}'",
            resolved_model, provider_id, req.prompt
        );

        Self::send_progress(
            &progress_tx,
            &format!(
                "Connecting to {} API ({resolved_model})...",
                Self::display_provider_name(&provider_id)
            ),
            0.15,
            start_time.elapsed().as_secs_f32(),
        )
        .await;

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self::send_progress(
            &progress_tx,
            "Generating image on cloud infrastructure...",
            0.40,
            start_time.elapsed().as_secs_f32(),
        )
        .await;

        let clean_model = Self::clean_model_id(&resolved_model, &provider_id);

        let image_bytes = if provider_id == "google" || provider_id == "gemini" {
            Self::generate_gemini(&client, &clean_model, &api_key, &base_url, req).await?
        } else {
            Self::generate_openai_compatible(&client, &clean_model, &api_key, &base_url, req)
                .await?
        };

        Self::send_progress(
            &progress_tx,
            "Saving image to local library...",
            0.90,
            start_time.elapsed().as_secs_f32(),
        )
        .await;

        let elapsed_ms = start_time.elapsed().as_millis() as u64;
        let id = format!("img_{}", Uuid::new_v4());
        let filename = format!("{}.png", id);
        let dest_path = storage.image_path(&filename);

        if let Some(parent) = dest_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&dest_path, &image_bytes)
            .map_err(|e| anyhow!("Failed to write generated image to disk: {}", e))?;

        let width = req.width.unwrap_or(1024);
        let height = req.height.unwrap_or(1024);
        let steps = req.steps.unwrap_or(1);
        let cfg_scale = req.cfg_scale.unwrap_or(1.0);
        let seed = req
            .seed
            .unwrap_or_else(|| rand::random::<i32>().abs() as i64);
        let created_at = chrono::Utc::now().timestamp_millis();

        let record = GenerationRecord {
            id: id.clone(),
            created_at,
            prompt: req.prompt.clone(),
            negative_prompt: req.negative_prompt.clone(),
            model_id: resolved_model.clone(),
            source: "cloud".to_string(),
            width,
            height,
            steps,
            cfg_scale,
            seed,
            sampler: req.sampler.clone(),
            generation_time_ms: elapsed_ms,
            image_filename: filename.clone(),
        };

        storage.save_record(&record)?;

        Self::send_progress(
            &progress_tx,
            "Complete",
            1.0,
            start_time.elapsed().as_secs_f32(),
        )
        .await;

        Ok(GenerateImageResponse {
            success: true,
            id: id.clone(),
            image_url: format!("/api/images/generations/{}/file", id),
            prompt: req.prompt.clone(),
            negative_prompt: req.negative_prompt.clone(),
            model_id: resolved_model,
            source: "cloud".to_string(),
            width,
            height,
            steps,
            cfg_scale,
            seed,
            generation_time_ms: elapsed_ms,
            created_at,
        })
    }

    async fn send_progress(
        progress_tx: &Option<Sender<GenerationProgressEvent>>,
        phase: &str,
        progress: f32,
        elapsed_seconds: f32,
    ) {
        if let Some(ref tx) = progress_tx {
            let _ = tx
                .send(GenerationProgressEvent {
                    step: if progress >= 1.0 { 1 } else { 0 },
                    total_steps: 1,
                    progress,
                    phase: phase.to_string(),
                    step_time_ms: None,
                    eta_seconds: None,
                    elapsed_seconds,
                    preview_data_url: None,
                })
                .await;
        }
    }

    fn resolve_model_and_provider(
        req: &GenerateImageRequest,
        raw_settings: &serde_json::Value,
    ) -> Result<(String, String)> {
        let requested_id = req.model_id.as_deref().unwrap_or("").trim();

        // Check if model matches an entry in settings "models"
        if let Some(models) = raw_settings.get("models").and_then(|m| m.as_array()) {
            if !requested_id.is_empty() {
                if let Some(found) = models.iter().find(|m| {
                    m.get("id").and_then(|v| v.as_str()) == Some(requested_id)
                        || m.get("name").and_then(|v| v.as_str()) == Some(requested_id)
                }) {
                    let id = found
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or(requested_id)
                        .to_string();
                    let pid = found
                        .get("providerId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("openai")
                        .to_string();
                    return Ok((id, pid));
                }
            } else {
                // Find first enabled model with outputModalities containing 'image'
                if let Some(found) = models.iter().find(|m| {
                    let enabled = m.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
                    let has_img = m
                        .get("outputModalities")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().any(|s| s.as_str() == Some("image")))
                        .unwrap_or(false);
                    let is_image_name = m
                        .get("id")
                        .and_then(|v| v.as_str())
                        .map(|id| {
                            id.contains("dall-e") || id.contains("imagen") || id.contains("flux")
                        })
                        .unwrap_or(false);
                    enabled && (has_img || is_image_name)
                }) {
                    let id = found
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("dall-e-3")
                        .to_string();
                    let pid = found
                        .get("providerId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("openai")
                        .to_string();
                    return Ok((id, pid));
                }
            }
        }

        // Infer from ID naming pattern
        if !requested_id.is_empty() {
            let lower = requested_id.to_lowercase();
            if lower.contains("imagen") || lower.contains("gemini") {
                return Ok((requested_id.to_string(), "google".to_string()));
            }
            if lower.contains("dall-e") || lower.starts_with("openai/") {
                return Ok((requested_id.to_string(), "openai".to_string()));
            }
            if lower.starts_with("openrouter/") {
                return Ok((requested_id.to_string(), "openrouter".to_string()));
            }
            if let Some((prefix, _)) = requested_id.split_once('/') {
                return Ok((requested_id.to_string(), prefix.to_string()));
            }
            return Ok((requested_id.to_string(), "openai".to_string()));
        }

        Ok(("dall-e-3".to_string(), "openai".to_string()))
    }

    fn resolve_credentials(
        provider_id: &str,
        settings_store: &SettingsStore,
        raw_settings: &serde_json::Value,
    ) -> Result<(String, String)> {
        let mut api_key: Option<String> = None;
        let mut base_url: Option<String> = None;

        // Check providers list in raw settings
        if let Some(providers) = raw_settings.get("providers").and_then(|p| p.as_array()) {
            if let Some(p) = providers.iter().find(|p| {
                let pid = p.get("id").and_then(|v| v.as_str()).unwrap_or("");
                pid == provider_id
                    || (provider_id == "google" && pid == "gemini")
                    || (provider_id == "gemini" && pid == "google")
            }) {
                if let Some(k) = p.get("apiKey").and_then(|v| v.as_str()) {
                    if !k.is_empty() {
                        api_key = Some(k.to_string());
                    }
                }
                if let Some(u) = p.get("baseUrl").and_then(|v| v.as_str()) {
                    if !u.is_empty() {
                        base_url = Some(u.to_string());
                    }
                }
            }
        }

        // Fallback to settings_store.get_api_key
        if api_key.is_none() {
            if let Ok(Some(k)) = settings_store.get_api_key(provider_id) {
                if !k.is_empty() {
                    api_key = Some(k);
                }
            }
        }
        if api_key.is_none() && (provider_id == "google" || provider_id == "gemini") {
            if let Ok(Some(k)) = settings_store.get_api_key("gemini") {
                if !k.is_empty() {
                    api_key = Some(k);
                }
            }
            if api_key.is_none() {
                if let Ok(Some(k)) = settings_store.get_api_key("google") {
                    if !k.is_empty() {
                        api_key = Some(k);
                    }
                }
            }
        }

        // Fallback to environment variables
        if api_key.is_none() {
            let env_var = match provider_id {
                "openai" => "OPENAI_API_KEY",
                "google" | "gemini" => "GEMINI_API_KEY",
                "openrouter" => "OPENROUTER_API_KEY",
                "groq" => "GROQ_API_KEY",
                _ => "",
            };
            if !env_var.is_empty() {
                if let Ok(val) = std::env::var(env_var) {
                    if !val.is_empty() {
                        api_key = Some(val);
                    }
                }
            }
            if api_key.is_none() && (provider_id == "google" || provider_id == "gemini") {
                if let Ok(val) = std::env::var("GOOGLE_API_KEY") {
                    if !val.is_empty() {
                        api_key = Some(val);
                    }
                }
            }
        }

        let key = api_key.ok_or_else(|| {
            anyhow!(
                "No API key found for provider '{}'. Please configure your API key in Settings -> Providers.",
                provider_id
            )
        })?;

        let default_url = match provider_id {
            "openai" => "https://api.openai.com/v1",
            "google" | "gemini" => "https://generativelanguage.googleapis.com/v1beta",
            "openrouter" => "https://openrouter.ai/api/v1",
            "groq" => "https://api.groq.com/openai/v1",
            _ => "https://api.openai.com/v1",
        };

        let url = base_url.unwrap_or_else(|| default_url.to_string());
        Ok((key, url))
    }

    fn clean_model_id(model_id: &str, provider_id: &str) -> String {
        let mut clean = model_id.to_string();
        let prefix = format!("{}/", provider_id);
        if clean.starts_with(&prefix) {
            clean = clean[prefix.len()..].to_string();
        }
        let prefix_dash = format!("{}-", provider_id);
        if clean.starts_with(&prefix_dash) {
            clean = clean[prefix_dash.len()..].to_string();
        }
        if clean.starts_with("models/") {
            clean = clean["models/".len()..].to_string();
        }
        clean
    }

    fn display_provider_name(provider_id: &str) -> &'static str {
        match provider_id {
            "openai" => "OpenAI",
            "google" | "gemini" => "Google Gemini / Imagen",
            "openrouter" => "OpenRouter",
            "groq" => "Groq",
            _ => "Cloud Provider",
        }
    }

    async fn generate_openai_compatible(
        client: &Client,
        model: &str,
        api_key: &str,
        base_url: &str,
        req: &GenerateImageRequest,
    ) -> Result<Vec<u8>> {
        let endpoint = format!("{}/images/generations", base_url.trim_end_matches('/'));

        let w = req.width.unwrap_or(1024);
        let h = req.height.unwrap_or(1024);
        let size = if model.contains("dall-e-3") {
            if w > h && (w as f32 / h as f32) > 1.3 {
                "1792x1024"
            } else if h > w && (h as f32 / w as f32) > 1.3 {
                "1024x1792"
            } else {
                "1024x1024"
            }
        } else if w <= 512 && h <= 512 {
            "512x512"
        } else {
            "1024x1024"
        };

        let mut body = json!({
            "model": model,
            "prompt": req.prompt,
            "n": 1,
            "size": size,
            "response_format": "b64_json"
        });

        // Add optional negative prompt note if applicable
        if let Some(ref neg) = req.negative_prompt {
            if !neg.trim().is_empty() && !model.contains("dall-e-3") {
                body.as_object_mut()
                    .unwrap()
                    .insert("negative_prompt".to_string(), json!(neg));
            }
        }

        let resp = client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                anyhow!(
                    "Failed to send image generation request to {}: {}",
                    endpoint,
                    e
                )
            })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if let Ok(err_val) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(msg) = err_val
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                {
                    return Err(anyhow!("OpenAI Image Generation Error ({status}): {msg}"));
                }
            }
            return Err(anyhow!("OpenAI Image Generation Error ({status}): {text}"));
        }

        let json_resp: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse response from image generation: {}", e))?;

        let data_arr = json_resp
            .get("data")
            .and_then(|d| d.as_array())
            .ok_or_else(|| anyhow!("Malformed response: missing 'data' array"))?;

        if data_arr.is_empty() {
            return Err(anyhow!("No image data returned from provider"));
        }

        let first = &data_arr[0];
        if let Some(b64) = first.get("b64_json").and_then(|v| v.as_str()) {
            return base64::engine::general_purpose::STANDARD
                .decode(b64.trim())
                .map_err(|e| anyhow!("Failed to decode base64 image data: {}", e));
        }

        if let Some(url_str) = first.get("url").and_then(|v| v.as_str()) {
            let img_resp = client
                .get(url_str)
                .send()
                .await
                .map_err(|e| anyhow!("Failed to download image from URL: {}", e))?;
            let bytes = img_resp
                .bytes()
                .await
                .map_err(|e| anyhow!("Failed to read image bytes: {}", e))?;
            return Ok(bytes.to_vec());
        }

        Err(anyhow!(
            "No valid image URL or base64 data found in generation response"
        ))
    }

    async fn generate_gemini(
        client: &Client,
        model: &str,
        api_key: &str,
        base_url: &str,
        req: &GenerateImageRequest,
    ) -> Result<Vec<u8>> {
        let base_clean = base_url.trim_end_matches('/');
        let effective_base = if !base_clean.contains("/v1") {
            format!("{}/v1beta", base_clean)
        } else {
            base_clean.to_string()
        };

        // Determine aspect ratio string
        let w = req.width.unwrap_or(1024);
        let h = req.height.unwrap_or(1024);
        let aspect_ratio = if (w as f32 / h as f32) > 1.5 {
            "16:9"
        } else if (h as f32 / w as f32) > 1.5 {
            "9:16"
        } else if (w as f32 / h as f32) > 1.2 {
            "4:3"
        } else if (h as f32 / w as f32) > 1.2 {
            "3:4"
        } else {
            "1:1"
        };

        // 1. Imagen endpoint check
        if model.contains("imagen") {
            let url = format!(
                "{}/models/{}:predict?key={}",
                effective_base, model, api_key
            );
            let payload = json!({
                "instances": [
                    { "prompt": req.prompt }
                ],
                "parameters": {
                    "sampleCount": 1,
                    "aspectRatio": aspect_ratio,
                    "outputMimeType": "image/png"
                }
            });

            let resp = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await
                .map_err(|e| anyhow!("Failed to send Imagen request: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(anyhow!("Imagen Generation Error ({status}): {text}"));
            }

            let json_resp: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| anyhow!("Failed to parse Imagen response: {}", e))?;

            if let Some(preds) = json_resp.get("predictions").and_then(|p| p.as_array()) {
                if let Some(first) = preds.first() {
                    if let Some(b64) = first.get("bytesBase64Encoded").and_then(|v| v.as_str()) {
                        return base64::engine::general_purpose::STANDARD
                            .decode(b64.trim())
                            .map_err(|e| anyhow!("Failed to decode Imagen base64: {}", e));
                    }
                }
            }
            return Err(anyhow!("No image data returned from Imagen response"));
        }

        // 2. Multimodal generateContent with responseModalities: ["IMAGE"]
        let url = format!(
            "{}/models/{}:generateContent?key={}",
            effective_base, model, api_key
        );
        let mut contents_parts = vec![json!({ "text": req.prompt })];

        if let Some(ref init) = req.init_image {
            let (mime, clean_data) = if init.starts_with("data:") {
                let comma = init.find(',').unwrap_or(0);
                let mime_part = &init[5..init.find(';').unwrap_or(comma)];
                let data_part = &init[comma + 1..];
                (mime_part, data_part)
            } else {
                ("image/png", init.as_str())
            };
            contents_parts.push(json!({
                "inlineData": {
                    "mimeType": mime,
                    "data": clean_data
                }
            }));
        }

        let payload = json!({
            "contents": [
                {
                    "role": "user",
                    "parts": contents_parts
                }
            ],
            "generationConfig": {
                "responseModalities": ["IMAGE", "TEXT"]
            }
        });

        let resp = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to send Gemini multimodal request: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Gemini Multimodal Generation Error ({status}): {text}"
            ));
        }

        let json_resp: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Gemini response: {}", e))?;

        if let Some(candidates) = json_resp.get("candidates").and_then(|c| c.as_array()) {
            for cand in candidates {
                if let Some(parts) = cand
                    .get("content")
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.as_array())
                {
                    for part in parts {
                        if let Some(inline) = part.get("inlineData") {
                            if let Some(data) = inline.get("data").and_then(|d| d.as_str()) {
                                return base64::engine::general_purpose::STANDARD
                                    .decode(data.trim())
                                    .map_err(|e| anyhow!("Failed to decode inlineData: {}", e));
                            }
                        }
                    }
                }
            }
        }

        Err(anyhow!(
            "Gemini did not return image data for the requested prompt"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_model_id() {
        assert_eq!(
            OnlineImageGenerator::clean_model_id("openai/dall-e-3", "openai"),
            "dall-e-3"
        );
        assert_eq!(
            OnlineImageGenerator::clean_model_id("openai-dall-e-3", "openai"),
            "dall-e-3"
        );
        assert_eq!(
            OnlineImageGenerator::clean_model_id("models/imagen-3.0-generate-002", "google"),
            "imagen-3.0-generate-002"
        );
    }

    #[test]
    fn test_display_provider_name() {
        assert_eq!(
            OnlineImageGenerator::display_provider_name("openai"),
            "OpenAI"
        );
        assert_eq!(
            OnlineImageGenerator::display_provider_name("google"),
            "Google Gemini / Imagen"
        );
        assert_eq!(
            OnlineImageGenerator::display_provider_name("openrouter"),
            "OpenRouter"
        );
    }
}
