use async_trait::async_trait;
use tokio::sync::mpsc::Receiver;
use crate::types::{AgentEvent, ChatMessage, ModelConfig};

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn chat_stream(
        &self,
        config: &ModelConfig,
        messages: &[ChatMessage],
        tools: &[serde_json::Value],
    ) -> anyhow::Result<Receiver<AgentEvent>>;
}
