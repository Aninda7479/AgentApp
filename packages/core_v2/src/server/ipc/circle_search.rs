use axum::{http::StatusCode, Json};

use crate::server::ipc::usage::record_usage;
use crate::server::state::AppState;
use crate::types::{ChatMessage, ContentBlock, ProviderType, Role};

pub async fn handle_circle_search_channel(
    ch: &str,
    state: &AppState,
    args: Vec<serde_json::Value>,
) -> Option<Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)>> {
    match ch {
        "circle-search-analyze" => {
            let arg = args.first().cloned().unwrap_or_else(|| serde_json::json!({}));
            let prompt = arg.get("prompt").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let image_opt = arg.get("image").and_then(|v| v.as_str()).map(|s| s.to_string());
            let mode = arg.get("mode").and_then(|v| v.as_str()).unwrap_or("general");

            let mut content_blocks = Vec::new();
            if let Some(ref img_b64) = image_opt {
                if !img_b64.trim().is_empty() {
                    let media_type = if img_b64.contains("image/png") {
                        "image/png".to_string()
                    } else if img_b64.contains("image/webp") {
                        "image/webp".to_string()
                    } else {
                        "image/jpeg".to_string()
                    };
                    content_blocks.push(ContentBlock::Image {
                        media_type,
                        data: img_b64.clone(),
                    });
                }
            }

            let has_image = !content_blocks.is_empty();
            let system_prompt = if has_image {
                "You are SuperAgent Visual Intelligence, an ultra-fast multimodal search assistant inspired by Google Gemini Circle to Search.\nAnalyze the provided image snippet and user query.\nProvide a direct, concise, and beautifully structured insight:\n- Highlight key findings clearly\n- Use clean Markdown, bold text, and bullet points\n- If code, equations, or data tables are visible, provide the clean code block or transcription\n- Keep answers snappy, insightful, and actionable.".to_string()
            } else {
                "You are SuperAgent Spotlight, an ultra-fast desktop assistant.\nProvide a direct, clear, and structured answer to the user's question:\n- Use clean Markdown, bold headers, and bullet points where helpful\n- Provide precise code blocks with syntax highlighting when relevant\n- Keep responses fast, concise, and actionable.".to_string()
            };

            let effective_prompt = if prompt.is_empty() {
                match mode {
                    "explain" => "Explain what is shown in this image snippet in detail.",
                    "summarize" => "Summarize the key information visible in this snippet.",
                    "translate" => "Translate all text in this snippet to English (or identify language and provide English translation).",
                    "code" => "Analyze and solve or explain the code shown in this screenshot.",
                    "ocr" => "Extract and transcribe all text from this snippet cleanly with exact formatting.",
                    _ => "Analyze this image selection and explain what it shows.",
                }
            } else {
                prompt.as_str()
            };

            content_blocks.push(ContentBlock::Text {
                text: effective_prompt.to_string(),
            });

            let messages = vec![
                ChatMessage::system(system_prompt),
                ChatMessage::new(Role::User, content_blocks),
            ];

            let raw_settings = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
            let circle_settings = raw_settings.get("circleSearch").cloned().unwrap_or_else(|| serde_json::json!({}));

            let query_provider = arg.get("provider").and_then(|v| v.as_str());
            let query_model = arg.get("model").and_then(|v| v.as_str());

            let cfg_provider = query_provider
                .or_else(|| circle_settings.get("provider").and_then(|v| v.as_str()))
                .or_else(|| circle_settings.get("providerType").and_then(|v| v.as_str()))
                .unwrap_or("");
            let cfg_model = query_model
                .or_else(|| circle_settings.get("model").and_then(|v| v.as_str()))
                .or_else(|| circle_settings.get("modelId").and_then(|v| v.as_str()))
                .unwrap_or("")
                .trim();

            let routed = state.coordinator.route_prompt(&effective_prompt).await;
            let persona = routed.persona;
            let mut model_config = persona.model_config.clone();

            let mut resolved_provider_str = cfg_provider.to_string();
            if resolved_provider_str.is_empty() {
                let lower_m = cfg_model.to_lowercase();
                if lower_m.contains("gemini") || lower_m.contains("google") {
                    resolved_provider_str = "gemini".to_string();
                } else if lower_m.contains("gpt") || lower_m.contains("o1") || lower_m.contains("o3") {
                    resolved_provider_str = "openai".to_string();
                } else if lower_m.contains("claude") || lower_m.contains("sonnet") || lower_m.contains("haiku") || lower_m.contains("opus") {
                    resolved_provider_str = "anthropic".to_string();
                } else if lower_m.contains("deepseek") {
                    resolved_provider_str = "deepseek".to_string();
                } else if lower_m.contains("llava") || lower_m.contains("llama") {
                    resolved_provider_str = "ollama".to_string();
                }
            }

            let mut api_key: Option<String> = None;
            let mut base_url: Option<String> = None;

            if let Some(providers_list) = raw_settings.get("providers").and_then(|p| p.as_array()) {
                if let Some(found_prov) = providers_list.iter().find(|p| {
                    let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                    let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                    let target = resolved_provider_str.to_lowercase();
                    id == target
                        || name == target
                        || (target == "gemini" && (id == "google" || name == "google" || id == "google-ai"))
                        || (target == "google" && (id == "gemini" || name == "gemini"))
                        || (target == "anthropic" && (id == "claude" || name == "claude"))
                }) {
                    if let Some(k) = found_prov.get("apiKey").and_then(|v| v.as_str()) {
                        if !k.trim().is_empty() {
                            api_key = Some(k.trim().to_string());
                        }
                    }
                    if let Some(u) = found_prov.get("baseUrl").and_then(|v| v.as_str()) {
                        if !u.trim().is_empty() {
                            base_url = Some(u.trim().to_string());
                        }
                    }
                }
            }

            if api_key.is_none() {
                if let Ok(Some(k)) = state.settings_store.get_api_key(&resolved_provider_str) {
                    if !k.trim().is_empty() {
                        api_key = Some(k.trim().to_string());
                    }
                }
                if api_key.is_none() && (resolved_provider_str == "gemini" || resolved_provider_str == "google") {
                    if let Ok(Some(k)) = state.settings_store.get_api_key("gemini") {
                        if !k.trim().is_empty() { api_key = Some(k.trim().to_string()); }
                    }
                    if api_key.is_none() {
                        if let Ok(Some(k)) = state.settings_store.get_api_key("google") {
                            if !k.trim().is_empty() { api_key = Some(k.trim().to_string()); }
                        }
                    }
                }
            }

            let provider_type = match resolved_provider_str.to_lowercase().as_str() {
                "gemini" | "google" | "google-ai" => ProviderType::Gemini,
                "openai" => ProviderType::OpenAI,
                "anthropic" | "claude" => ProviderType::Anthropic,
                "ollama" => ProviderType::Ollama,
                "openrouter" => ProviderType::OpenRouter,
                "deepseek" => ProviderType::DeepSeek,
                "groq" => ProviderType::Groq,
                _ => model_config.provider,
            };

            if api_key.is_none() {
                api_key = match provider_type {
                    ProviderType::Gemini => std::env::var("GEMINI_API_KEY").or_else(|_| std::env::var("GOOGLE_API_KEY")).ok(),
                    ProviderType::OpenAI => std::env::var("OPENAI_API_KEY").ok(),
                    ProviderType::Anthropic => std::env::var("ANTHROPIC_API_KEY").ok(),
                    ProviderType::OpenRouter => std::env::var("OPENROUTER_API_KEY").ok(),
                    ProviderType::DeepSeek => std::env::var("DEEPSEEK_API_KEY").ok(),
                    ProviderType::Groq => std::env::var("GROQ_API_KEY").ok(),
                    _ => None,
                };
            }

            model_config.provider = provider_type;
            if !cfg_model.is_empty() && cfg_model != "auto" {
                model_config.model_id = cfg_model.to_string();
            }
            if let Some(k) = api_key {
                model_config.api_key = Some(k);
            }
            if let Some(u) = base_url {
                model_config.base_url = Some(u);
            }

            let provider_instance = crate::providers::ProviderFactory::create(&model_config.provider);
            let mut answer = String::new();
            let start_time = std::time::Instant::now();
            let mut completion_token_count = 0usize;
            let mut has_error = false;

            match provider_instance.chat_stream(&model_config, &messages, &[]).await {
                Ok(mut rx) => {
                    while let Some(event) = rx.recv().await {
                        match event {
                            crate::types::AgentEvent::Token { text } => {
                                completion_token_count += 1;
                                answer.push_str(&text);
                            }
                            crate::types::AgentEvent::Error { message } => {
                                has_error = true;
                                answer = format!("Vision Model Notice: {}", message);
                                break;
                            }
                            _ => {}
                        }
                    }
                }
                Err(err) => {
                    has_error = true;
                    answer = format!("Could not query visual intelligence: {}. Please verify your model provider API key in Settings.", err);
                }
            }

            let duration_ms = start_time.elapsed().as_millis() as u64;
            let prompt_token_count = std::cmp::max(1, (effective_prompt.len() + 3) / 4) + if has_image { 256 } else { 0 };
            let final_completion_tokens = std::cmp::max(completion_token_count, (answer.len() + 3) / 4);

            record_usage(
                &format!("{:?}", model_config.provider).to_lowercase(),
                &model_config.model_id,
                prompt_token_count,
                final_completion_tokens,
                duration_ms,
                if has_error { "failure" } else { "success" },
            );

            if answer.trim().is_empty() {
                answer = "No visual insight returned.".to_string();
            }

            Some(Ok(Json(serde_json::json!({
                "data": {
                    "text": answer,
                    "prompt": effective_prompt
                }
            }))))
        }
        _ => None,
    }
}
