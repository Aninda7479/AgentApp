use serde::{Deserialize, Serialize};
use crate::types::ModelConfig;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityTier {
    DeepReasoning,
    HighThroughput,
    LongContext,
    LocalPrivacy,
    MultimodalMedia,
}

impl Default for CapabilityTier {
    fn default() -> Self {
        CapabilityTier::DeepReasoning
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPersona {
    pub id: String,
    pub name: String,
    pub role_title: String,
    pub description: String,
    pub system_prompt: String,
    pub capability_tier: CapabilityTier,
    pub model_config: ModelConfig,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub is_coordinator: bool,
    #[serde(default = "default_max_turns")]
    pub max_turns: usize,
    #[serde(default)]
    pub avatar_emoji: Option<String>,
    #[serde(default)]
    pub is_builtin: bool,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

fn default_max_turns() -> usize {
    20
}

impl AgentPersona {
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        role_title: impl Into<String>,
        description: impl Into<String>,
        system_prompt: impl Into<String>,
        model_config: ModelConfig,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            role_title: role_title.into(),
            description: description.into(),
            system_prompt: system_prompt.into(),
            capability_tier: CapabilityTier::DeepReasoning,
            model_config,
            allowed_tools: Vec::new(),
            is_coordinator: false,
            max_turns: 20,
            avatar_emoji: None,
            is_builtin: false,
            created_at: Some(chrono::Utc::now().to_rfc3339()),
            updated_at: Some(chrono::Utc::now().to_rfc3339()),
        }
    }
}
