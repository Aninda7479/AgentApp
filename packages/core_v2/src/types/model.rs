use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderType {
    OpenAI,
    Anthropic,
    Gemini,
    Ollama,
    OpenRouter,
    DeepSeek,
    Groq,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelConfig {
    pub provider: ProviderType,
    pub model_id: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<usize>,
}

impl ModelConfig {
    pub fn new(provider: ProviderType, model_id: impl Into<String>) -> Self {
        Self {
            provider,
            model_id: model_id.into(),
            api_key: None,
            base_url: None,
            temperature: None,
            max_tokens: None,
        }
    }

    pub fn get_base_url(&self) -> String {
        if let Some(ref url) = self.base_url {
            if !url.is_empty() {
                return url.clone();
            }
        }
        match self.provider {
            ProviderType::OpenAI => "https://api.openai.com/v1".to_string(),
            ProviderType::Anthropic => "https://api.anthropic.com/v1".to_string(),
            ProviderType::Gemini => "https://generativelanguage.googleapis.com/v1beta".to_string(),
            ProviderType::Ollama => "http://localhost:11434/v1".to_string(),
            ProviderType::OpenRouter => "https://openrouter.ai/api/v1".to_string(),
            ProviderType::DeepSeek => "https://api.deepseek.com/v1".to_string(),
            ProviderType::Groq => "https://api.groq.com/openai/v1".to_string(),
        }
    }
}
