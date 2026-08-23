use std::sync::Arc;
use anyhow::{anyhow, Result};
use tokio::sync::mpsc;

use crate::orchestrator::AgentEngine;
use crate::roster::PersonaStore;
use crate::tools::ToolRegistry;
use crate::types::{AgentEvent, AgentPersona};

pub struct SubagentRunner {
    roster: Arc<PersonaStore>,
    tool_registry: Arc<ToolRegistry>,
}

impl SubagentRunner {
    pub fn new(roster: Arc<PersonaStore>, tool_registry: Arc<ToolRegistry>) -> Self {
        Self {
            roster,
            tool_registry,
        }
    }

    /// Spawns and executes a subagent persona run synchronously (collecting full output text).
    pub async fn execute_subagent(
        &self,
        persona_id: &str,
        prompt: &str,
    ) -> Result<String> {
        let persona = self
            .roster
            .get(persona_id)
            .await
            .ok_or_else(|| anyhow!("Subagent persona '{}' not found in roster", persona_id))?;

        // Filter tools to allowed tools for this persona if specified
        let engine_tools = if persona.allowed_tools.is_empty() {
            self.tool_registry.clone()
        } else {
            let mut filtered = ToolRegistry::new();
            for tool_name in &persona.allowed_tools {
                if let Some(tool) = self.tool_registry.get(tool_name) {
                    filtered.register_arc(tool);
                }
            }
            Arc::new(filtered)
        };

        let mut engine = AgentEngine::new(engine_tools);
        engine.set_max_turns(persona.max_turns);

        let mut rx = engine
            .run_loop(&persona.model_config, &persona.system_prompt, prompt)
            .await?;

        let mut output_text = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                AgentEvent::Token { text } => {
                    output_text.push_str(&text);
                }
                AgentEvent::Error { message } => {
                    return Err(anyhow!("Subagent '{}' error: {}", persona.name, message));
                }
                _ => {}
            }
        }

        if output_text.trim().is_empty() {
            Ok(format!("Subagent '{}' completed execution.", persona.name))
        } else {
            Ok(output_text)
        }
    }

    /// Spawns and streams events from a subagent.
    pub async fn stream_subagent(
        &self,
        persona: &AgentPersona,
        prompt: &str,
    ) -> Result<mpsc::Receiver<AgentEvent>> {
        let mut engine = AgentEngine::new(self.tool_registry.clone());
        engine.set_max_turns(persona.max_turns);
        engine
            .run_loop(&persona.model_config, &persona.system_prompt, prompt)
            .await
    }
}
