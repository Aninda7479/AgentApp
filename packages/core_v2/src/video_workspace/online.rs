use std::time::Instant;

use anyhow::{anyhow, Result};
use base64::Engine;
use reqwest::Client;
use serde_json::json;
use tokio::sync::mpsc::Sender;
use tracing::info;
use uuid::Uuid;

use crate::storage::settings::SettingsStore;
use crate::storage::video_storage::{VideoGenerationRecord, VideoStorage};
use crate::video_workspace::types::{
    GenerateVideoRequest, GenerateVideoResponse, VideoProgressEvent,
};

pub struct OnlineVideoGenerator;

impl OnlineVideoGenerator {
    pub async fn generate(
        req: &GenerateVideoRequest,
        settings_store: &SettingsStore,
        storage: &VideoStorage,
        progress_tx: Option<Sender<VideoProgressEvent>>,
    ) -> Result<GenerateVideoResponse> {
        let start_time = Instant::now();
        Self::send_progress(
            &progress_tx,
            "Resolving video model and provider credentials...",
            0.05,
            0.0,
        )
        .await;

        let raw_settings = settings_store
            .load_raw()
            .unwrap_or_else(|_| serde_json::json!({}));

        // 1. Resolve model and provider
        let (resolved_model, provider_id) = Self::resolve_model_and_provider(req, &raw_settings)?;

        // 2. Resolve credentials
        let (api_key, base_url) =
            Self::resolve_credentials(&provider_id, settings_store, &raw_settings)?;

        // 3. Synthesize camera motion into prompt if provided
        let effective_prompt = if let Some(ref cam) = req.camera_motion {
            format!("{}, {}", req.prompt, cam.prompt_modifier())
        } else {
            req.prompt.clone()
        };

        info!(
            "Starting online video generation: model='{}', provider='{}', prompt='{}'",
            resolved_model, provider_id, effective_prompt
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
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .unwrap_or_else(|_| Client::new());

        let clean_model = Self::clean_model_id(&resolved_model, &provider_id);

        Self::send_progress(
            &progress_tx,
            "Submitting video generation task to cloud...",
            0.30,
            start_time.elapsed().as_secs_f32(),
        )
        .await;

        let video_bytes = if provider_id == "google" || provider_id == "gemini" {
            Self::generate_gemini_veo(
                &client,
                &clean_model,
                &api_key,
                &base_url,
                req,
                &effective_prompt,
                &progress_tx,
                start_time,
            )
            .await?
        } else {
            Self::generate_cloud_video(
                &client,
                &clean_model,
                &api_key,
                &base_url,
                req,
                &effective_prompt,
                &progress_tx,
                start_time,
            )
            .await?
        };

        Self::send_progress(
            &progress_tx,
            "Saving video asset and extracting thumbnail...",
            0.90,
            start_time.elapsed().as_secs_f32(),
        )
        .await;

        let elapsed_ms = start_time.elapsed().as_millis() as u64;
        let id = format!("vid_{}", Uuid::new_v4());
        let video_filename = format!("{}.mp4", id);
        let thumb_filename = format!("{}.jpg", id);

        let dest_video = storage.video_path(&video_filename);
        let dest_thumb = storage.thumbnail_path(&thumb_filename);

        if let Some(parent) = dest_video.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&dest_video, &video_bytes)
            .map_err(|e| anyhow!("Failed to write generated video to disk: {}", e))?;

        // Extract thumbnail using ffmpeg or fallback to keyframe image
        Self::extract_or_fallback_thumbnail(&dest_video, &dest_thumb, req);

        let num_frames = req.num_frames.unwrap_or(81);
        let fps = req.fps.unwrap_or(16);
        let duration_seconds = (num_frames as f32) / (fps as f32);
        let width = req.width.unwrap_or(720);
        let height = req.height.unwrap_or(480);
        let steps = req.steps.unwrap_or(30);
        let cfg_scale = req.cfg_scale.unwrap_or(6.0);
        let seed = req
            .seed
            .unwrap_or_else(|| rand::random::<i32>().abs() as i64);
        let created_at = chrono::Utc::now().timestamp_millis();

        let record = VideoGenerationRecord {
            id: id.clone(),
            created_at,
            prompt: req.prompt.clone(),
            negative_prompt: req.negative_prompt.clone(),
            model_id: resolved_model.clone(),
            source: "cloud".to_string(),
            width,
            height,
            num_frames,
            fps,
            duration_seconds,
            steps,
            cfg_scale,
            seed,
            motion_scale: req.motion_scale,
            camera_motion: req.camera_motion.as_ref().map(|c| format!("{:?}", c)),
            sampler: req.sampler.clone(),
            generation_time_ms: elapsed_ms,
            video_filename: video_filename.clone(),
            thumbnail_filename: thumb_filename.clone(),
        };

        storage.save_record(&record)?;

        Self::send_progress(
            &progress_tx,
            "Complete",
            1.0,
            start_time.elapsed().as_secs_f32(),
        )
        .await;

        Ok(GenerateVideoResponse {
            success: true,
            id: id.clone(),
            video_url: format!("/api/videos/generations/{}/file", id),
            thumbnail_url: format!("/api/videos/generations/{}/thumbnail", id),
            prompt: req.prompt.clone(),
            negative_prompt: req.negative_prompt.clone(),
            model_id: resolved_model,
            source: "cloud".to_string(),
            width,
            height,
            num_frames,
            fps,
            duration_seconds,
            steps,
            cfg_scale,
            seed,
            generation_time_ms: elapsed_ms,
            created_at,
        })
    }

    async fn send_progress(
        progress_tx: &Option<Sender<VideoProgressEvent>>,
        phase: &str,
        progress: f32,
        elapsed_seconds: f32,
    ) {
        if let Some(ref tx) = progress_tx {
            let _ = tx
                .send(VideoProgressEvent {
                    step: if progress >= 1.0 { 1 } else { 0 },
                    total_steps: 1,
                    frame_current: if progress >= 1.0 { 81 } else { 0 },
                    frame_total: 81,
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
        req: &GenerateVideoRequest,
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
                        .unwrap_or("openrouter")
                        .to_string();
                    return Ok((id, pid));
                }
            } else {
                // Find first enabled model with outputModalities containing 'video'
                if let Some(found) = models.iter().find(|m| {
                    let enabled = m.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
                    let has_vid = m
                        .get("outputModalities")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().any(|s| s.as_str() == Some("video")))
                        .unwrap_or(false);
                    let is_video_name = m
                        .get("id")
                        .and_then(|v| v.as_str())
                        .map(|id| {
                            id.contains("veo")
                                || id.contains("kling")
                                || id.contains("luma")
                                || id.contains("cogvideox")
                                || id.contains("sora")
                        })
                        .unwrap_or(false);
                    enabled && (has_vid || is_video_name)
                }) {
                    let id = found
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("veo-2.0-generate-001")
                        .to_string();
                    let pid = found
                        .get("providerId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("google")
                        .to_string();
                    return Ok((id, pid));
                }
            }
        }

        // Infer from ID naming pattern
        if !requested_id.is_empty() {
            let lower = requested_id.to_lowercase();
            if lower.contains("veo") || lower.contains("gemini") {
                return Ok((requested_id.to_string(), "google".to_string()));
            }
            if lower.contains("sora") || lower.starts_with("openai/") {
                return Ok((requested_id.to_string(), "openai".to_string()));
            }
            if lower.starts_with("openrouter/") {
                return Ok((requested_id.to_string(), "openrouter".to_string()));
            }
            if let Some((prefix, _)) = requested_id.split_once('/') {
                return Ok((requested_id.to_string(), prefix.to_string()));
            }
            return Ok((requested_id.to_string(), "openrouter".to_string()));
        }

        Ok(("veo-2.0-generate-001".to_string(), "google".to_string()))
    }

    fn resolve_credentials(
        provider_id: &str,
        settings_store: &SettingsStore,
        raw_settings: &serde_json::Value,
    ) -> Result<(String, String)> {
        let mut api_key: Option<String> = None;
        let mut base_url: Option<String> = None;

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

        if api_key.is_none() {
            let env_var = match provider_id {
                "openai" => "OPENAI_API_KEY",
                "google" | "gemini" => "GEMINI_API_KEY",
                "openrouter" => "OPENROUTER_API_KEY",
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
                "No API key configured for provider '{}'. Please add your API key in Settings -> Providers.",
                provider_id
            )
        })?;

        let default_url = match provider_id {
            "openai" => "https://api.openai.com/v1",
            "google" | "gemini" => "https://generativelanguage.googleapis.com/v1beta",
            "openrouter" => "https://openrouter.ai/api/v1",
            _ => "https://openrouter.ai/api/v1",
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
            "google" | "gemini" => "Google Veo",
            "openai" => "OpenAI",
            "openrouter" => "OpenRouter",
            _ => "Cloud Video Provider",
        }
    }

    async fn generate_gemini_veo(
        client: &Client,
        model: &str,
        api_key: &str,
        base_url: &str,
        req: &GenerateVideoRequest,
        effective_prompt: &str,
        progress_tx: &Option<Sender<VideoProgressEvent>>,
        start_time: Instant,
    ) -> Result<Vec<u8>> {
        let base_clean = base_url.trim_end_matches('/');
        let effective_base = if !base_clean.contains("/v1") {
            format!("{}/v1beta", base_clean)
        } else {
            base_clean.to_string()
        };

        let submit_url = format!(
            "{}/models/{}:predictLongRunning?key={}",
            effective_base, model, api_key
        );

        let mut instance = json!({
            "prompt": effective_prompt
        });

        // Add keyframe image if present
        if let Some(ref init) = req.init_image {
            let clean_b64 = if let Some(idx) = init.find("base64,") {
                &init[idx + 7..]
            } else {
                init.as_str()
            };
            instance.as_object_mut().unwrap().insert(
                "image".to_string(),
                json!({ "bytesBase64Encoded": clean_b64.trim() }),
            );
        }

        let w = req.width.unwrap_or(720);
        let h = req.height.unwrap_or(480);
        let aspect_ratio = if (w as f32 / h as f32) > 1.3 {
            "16:9"
        } else if (h as f32 / w as f32) > 1.3 {
            "9:16"
        } else {
            "1:1"
        };

        let payload = json!({
            "instances": [ instance ],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": aspect_ratio,
                "durationSeconds": (req.num_frames.unwrap_or(81) as f32 / req.fps.unwrap_or(16) as f32).round().max(5.0) as u32
            }
        });

        let resp = client
            .post(&submit_url)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to submit Veo video generation request: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Google Veo API Error ({status}): {text}"));
        }

        let submit_json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Veo submit response: {}", e))?;

        // Extract operation name for polling
        let op_name = submit_json
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Google Veo did not return an operation name in submission"))?;

        // Poll operation until done
        let poll_url = format!("{}/{}?key={}", effective_base, op_name, api_key);
        let mut poll_count = 0;

        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(4)).await;
            poll_count += 1;

            let progress_val = (0.35 + (poll_count as f32 * 0.04)).min(0.85);
            Self::send_progress(
                progress_tx,
                &format!(
                    "Rendering video frames in cloud (elapsed: {:.0}s)...",
                    start_time.elapsed().as_secs_f32()
                ),
                progress_val,
                start_time.elapsed().as_secs_f32(),
            )
            .await;

            let poll_resp = client
                .get(&poll_url)
                .send()
                .await
                .map_err(|e| anyhow!("Failed to poll Veo task: {}", e))?;

            if !poll_resp.status().is_success() {
                continue;
            }

            let poll_json: serde_json::Value = poll_resp.json().await.unwrap_or_default();

            if poll_json
                .get("done")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                if let Some(err) = poll_json.get("error") {
                    let msg = err
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("Unknown cloud generation error");
                    return Err(anyhow!("Veo video generation failed: {msg}"));
                }

                // Extract video URI or base64 bytes from response
                if let Some(resp_obj) = poll_json.get("response") {
                    if let Some(preds) = resp_obj.get("predictions").and_then(|p| p.as_array()) {
                        if let Some(first) = preds.first() {
                            if let Some(b64) =
                                first.get("bytesBase64Encoded").and_then(|b| b.as_str())
                            {
                                return base64::engine::general_purpose::STANDARD
                                    .decode(b64.trim())
                                    .map_err(|e| {
                                        anyhow!("Failed to decode Veo video base64: {}", e)
                                    });
                            }
                            if let Some(uri) = first.get("videoUri").and_then(|u| u.as_str()) {
                                let video_dl = client.get(uri).send().await.map_err(|e| {
                                    anyhow!("Failed to download Veo video from URI: {}", e)
                                })?;
                                let bytes = video_dl.bytes().await.map_err(|e| {
                                    anyhow!("Failed to read Veo video bytes: {}", e)
                                })?;
                                return Ok(bytes.to_vec());
                            }
                        }
                    }
                }
                return Err(anyhow!(
                    "Veo generation finished but no video content was found in response"
                ));
            }

            // Timeout after 300 seconds
            if start_time.elapsed().as_secs() > 300 {
                return Err(anyhow!("Veo video generation timed out after 5 minutes"));
            }
        }
    }

    async fn generate_cloud_video(
        client: &Client,
        model: &str,
        api_key: &str,
        base_url: &str,
        req: &GenerateVideoRequest,
        effective_prompt: &str,
        _progress_tx: &Option<Sender<VideoProgressEvent>>,
        _start_time: Instant,
    ) -> Result<Vec<u8>> {
        // Universal async task dispatcher for OpenRouter / Luma / Kling / Fal endpoints
        let endpoint = format!("{}/videos/generations", base_url.trim_end_matches('/'));

        let mut payload = json!({
            "model": model,
            "prompt": effective_prompt,
            "width": req.width.unwrap_or(720),
            "height": req.height.unwrap_or(480),
        });

        if let Some(ref init) = req.init_image {
            payload
                .as_object_mut()
                .unwrap()
                .insert("image".to_string(), json!(init));
        }
        if let Some(ref vid) = req.input_video {
            payload
                .as_object_mut()
                .unwrap()
                .insert("video".to_string(), json!(vid));
        }

        let resp = client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                let json_data: serde_json::Value = r.json().await.unwrap_or_default();
                // Check if direct video bytes / URL or task ID
                if let Some(url_str) = json_data
                    .get("url")
                    .or_else(|| json_data.get("video_url"))
                    .and_then(|u| u.as_str())
                {
                    let dl = client
                        .get(url_str)
                        .send()
                        .await
                        .map_err(|e| anyhow!("Failed to download generated video: {}", e))?;
                    let bytes = dl
                        .bytes()
                        .await
                        .map_err(|e| anyhow!("Failed to read video bytes: {}", e))?;
                    return Ok(bytes.to_vec());
                }
                if let Some(b64) = json_data
                    .get("b64_json")
                    .or_else(|| json_data.get("video_base64"))
                    .and_then(|b| b.as_str())
                {
                    return base64::engine::general_purpose::STANDARD
                        .decode(b64.trim())
                        .map_err(|e| anyhow!("Failed to decode video base64: {}", e));
                }
                Err(anyhow!(
                    "Cloud video generation did not return video data or url"
                ))
            }
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                Err(anyhow!("Cloud Video Provider Error ({status}): {text}"))
            }
            Err(e) => Err(anyhow!("Failed to connect to cloud video provider: {e}")),
        }
    }

    fn extract_or_fallback_thumbnail(
        video_path: &std::path::Path,
        thumb_path: &std::path::Path,
        req: &GenerateVideoRequest,
    ) {
        // 1. Try running FFmpeg
        let ffmpeg_cmd = if cfg!(windows) {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        };
        let status = std::process::Command::new(ffmpeg_cmd)
            .arg("-y")
            .arg("-ss")
            .arg("00:00:00.500")
            .arg("-i")
            .arg(video_path)
            .arg("-vframes")
            .arg("1")
            .arg(thumb_path)
            .output();

        if let Ok(out) = status {
            if out.status.success() && thumb_path.exists() {
                return;
            }
        }

        // 2. Fallback to init_image if provided
        if let Some(ref init) = req.init_image {
            let clean_b64 = if let Some(idx) = init.find("base64,") {
                &init[idx + 7..]
            } else {
                init.as_str()
            };
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(clean_b64.trim()) {
                let _ = std::fs::write(thumb_path, &bytes);
                return;
            }
        }

        // 3. Fallback: create minimal placeholder
        let _ = std::fs::write(thumb_path, b"");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::video_workspace::types::CameraMotionPreset;

    #[test]
    fn test_clean_model_id() {
        assert_eq!(
            OnlineVideoGenerator::clean_model_id("google/veo-2.0-generate-001", "google"),
            "veo-2.0-generate-001"
        );
        assert_eq!(
            OnlineVideoGenerator::clean_model_id("models/veo-2.0-generate-001", "google"),
            "veo-2.0-generate-001"
        );
        assert_eq!(
            OnlineVideoGenerator::clean_model_id("openrouter/kling-v1.5", "openrouter"),
            "kling-v1.5"
        );
    }

    #[test]
    fn test_display_provider_name() {
        assert_eq!(
            OnlineVideoGenerator::display_provider_name("google"),
            "Google Veo"
        );
        assert_eq!(
            OnlineVideoGenerator::display_provider_name("gemini"),
            "Google Veo"
        );
        assert_eq!(
            OnlineVideoGenerator::display_provider_name("openrouter"),
            "OpenRouter"
        );
    }

    #[test]
    fn test_camera_motion_synthesis() {
        let cam = CameraMotionPreset::PanRight;
        let modifier = cam.prompt_modifier();
        assert!(modifier.contains("pan right"));

        let orbit = CameraMotionPreset::OrbitLeft;
        assert!(orbit.prompt_modifier().contains("orbit"));
    }
}
