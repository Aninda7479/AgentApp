pub mod anthropic;
pub mod gemini;
pub mod openai;
pub mod opencode;
pub mod r#trait;

pub use anthropic::AnthropicProvider;
pub use gemini::GeminiProvider;
pub use openai::OpenAiProvider;
pub use opencode::OpenCodeProvider;
pub use r#trait::LlmProvider;

use crate::types::ProviderType;
use std::sync::Arc;

pub struct ProviderFactory;

impl ProviderFactory {
    pub fn create(provider_type: &ProviderType) -> Arc<dyn LlmProvider> {
        match provider_type {
            ProviderType::OpenAI
            | ProviderType::Ollama
            | ProviderType::OpenRouter
            | ProviderType::DeepSeek
            | ProviderType::Groq => Arc::new(OpenAiProvider::new()),
            ProviderType::OpenCode => Arc::new(OpenCodeProvider::new()),
            ProviderType::Anthropic => Arc::new(AnthropicProvider::new()),
            ProviderType::Gemini => Arc::new(GeminiProvider::new()),
        }
    }
}
