use std::collections::HashMap;
use std::sync::Arc;
use anyhow::{anyhow, Result};
use tokio::sync::{mpsc, Mutex};
use chrono::Utc;

use crate::orchestrator::AgentEngine;
use crate::roster::PersonaStore;
use crate::tools::ToolRegistry;
use crate::types::{AgentEvent, AgentPersona};

#[derive(Clone, Debug)]
pub struct AgentMail {
    pub from: String,
    pub content: String,
    pub timestamp: i64,
}

#[derive(Clone)]
pub struct AgentMailbox {
    inbox: Arc<Mutex<HashMap<String, Vec<AgentMail>>>>,
}

impl AgentMailbox {
    pub fn new() -> Self {
        Self {
            inbox: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn send_mail(&self, from: String, to: String, content: String) {
        let mut lock = self.inbox.lock().await;
        lock.entry(to).or_default().push(AgentMail {
            from,
            content,
            timestamp: Utc::now().timestamp(),
        });
    }

    pub async fn check_mail(&self, agent_id: &str) -> Vec<AgentMail> {
        let lock = self.inbox.lock().await;
        lock.get(agent_id).cloned().unwrap_or_default()
    }

    pub async fn clear_mail(&self, agent_id: &str) {
        let mut lock = self.inbox.lock().await;
        lock.remove(agent_id);
    }
}

pub struct SubagentRunner {
    roster: Arc<PersonaStore>,
    tool_registry: Arc<ToolRegistry>,
    mailbox: AgentMailbox,
}

impl SubagentRunner {
    pub fn new(roster: Arc<PersonaStore>, tool_registry: Arc<ToolRegistry>) -> Self {
        Self {
            roster,
            tool_registry,
            mailbox: AgentMailbox::new(),
        }
    }

    pub fn mailbox(&self) -> &AgentMailbox {
        &self.mailbox
    }

    pub async fn check_mailbox(&self, agent_id: &str) -> Vec<AgentMail> {
        self.mailbox.check_mail(agent_id).await
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
