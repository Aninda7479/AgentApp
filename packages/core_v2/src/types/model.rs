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
                let trimmed = url.trim_end_matches('/');
                if self.provider == ProviderType::Gemini && !trimmed.contains("/v1") {
                    return format!("{}/v1beta", trimmed);
                }
                if (self.provider == ProviderType::Ollama || trimmed.contains(":11434"))
                    && !trimmed.ends_with("/v1")
                    && !trimmed.ends_with("/v1/chat/completions")
                    && !trimmed.contains("/v1/")
                    && !trimmed.contains("/v1")
                {
                    return format!("{}/v1", trimmed);
                }
                return trimmed.to_string();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ollama_base_url_normalization() {
        let mut cfg = ModelConfig::new(ProviderType::Ollama, "tinyllama:1.1b");
        assert_eq!(cfg.get_base_url(), "http://localhost:11434/v1");

        cfg.base_url = Some("http://localhost:11434".to_string());
        assert_eq!(cfg.get_base_url(), "http://localhost:11434/v1");

        cfg.base_url = Some("http://localhost:11434/".to_string());
        assert_eq!(cfg.get_base_url(), "http://localhost:11434/v1");

        cfg.base_url = Some("http://localhost:11434/v1".to_string());
        assert_eq!(cfg.get_base_url(), "http://localhost:11434/v1");

        cfg.base_url = Some("http://192.168.1.50:11434".to_string());
        assert_eq!(cfg.get_base_url(), "http://192.168.1.50:11434/v1");
    }

    #[test]
    fn test_gemini_base_url_normalization() {
        let mut cfg = ModelConfig::new(ProviderType::Gemini, "gemini-1.5-pro");
        assert_eq!(cfg.get_base_url(), "https://generativelanguage.googleapis.com/v1beta");

        cfg.base_url = Some("https://generativelanguage.googleapis.com".to_string());
        assert_eq!(cfg.get_base_url(), "https://generativelanguage.googleapis.com/v1beta");
    }
}
