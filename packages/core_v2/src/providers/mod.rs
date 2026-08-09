pub mod anthropic;
pub mod gemini;
pub mod openai;
pub mod r#trait;

pub use anthropic::AnthropicProvider;
pub use gemini::GeminiProvider;
pub use openai::OpenAiProvider;
pub use r#trait::LlmProvider;

use std::sync::Arc;
use crate::types::ProviderType;

pub struct ProviderFactory;

impl ProviderFactory {
    pub fn create(provider_type: &ProviderType) -> Arc<dyn LlmProvider> {
        match provider_type {
            ProviderType::OpenAI
            | ProviderType::Ollama
            | ProviderType::OpenRouter
            | ProviderType::DeepSeek
            | ProviderType::Groq => Arc::new(OpenAiProvider::new()),
            ProviderType::Anthropic => Arc::new(AnthropicProvider::new()),
            ProviderType::Gemini => Arc::new(GeminiProvider::new()),
        }
    }
}
