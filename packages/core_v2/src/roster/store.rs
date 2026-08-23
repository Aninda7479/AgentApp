use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use anyhow::{anyhow, Result};
use tokio::sync::RwLock;

use crate::storage::settings::get_superagent_dir;
use crate::types::{AgentPersona, CapabilityTier, ModelConfig, ProviderType};

const PERSONAS_FILE: &str = "personas.json";

#[derive(Clone)]
pub struct PersonaStore {
    file_path: PathBuf,
    personas: Arc<RwLock<HashMap<String, AgentPersona>>>,
}

impl PersonaStore {
    pub fn new(user_data: &Path) -> Self {
        let file_path = user_data.join(PERSONAS_FILE);
        let personas = Arc::new(RwLock::new(HashMap::new()));
        let store = Self {
            file_path,
            personas,
        };
        store.init();
        store
    }

    pub fn default_store() -> Self {
        let dir = get_superagent_dir();
        Self::new(&dir)
    }

    fn init(&self) {
        if self.file_path.exists() {
            if let Ok(content) = fs::read_to_string(&self.file_path) {
                if let Ok(loaded) = serde_json::from_str::<Vec<AgentPersona>>(&content) {
                    if let Ok(mut lock) = self.personas.try_write() {
                        for p in loaded {
                            lock.insert(p.id.clone(), p);
                        }
                    }
                    return;
                }
            }
        }

        // Initialize default built-in digital workforce personas
        let defaults = Self::get_default_personas();
        if let Ok(mut lock) = self.personas.try_write() {
            for p in &defaults {
                lock.insert(p.id.clone(), p.clone());
            }
        }
        let _ = self.save_to_disk(&defaults);
    }

    pub fn get_default_personas() -> Vec<AgentPersona> {
        vec![
            AgentPersona {
                id: "coordinator".to_string(),
                name: "Chief of Staff".to_string(),
                role_title: "Central Task Coordinator".to_string(),
                description: "Analyzes user instructions, delegates sub-tasks to specialized domain agents, and aggregates results into a cohesive response.".to_string(),
                system_prompt: "You are the Chief of Staff and Central Coordinator for SuperAgent. Your responsibility is to analyze requests, break down complex tasks, delegate execution to specialized agent personas using available subagent tools, and present unified solutions to the user.".to_string(),
                capability_tier: CapabilityTier::DeepReasoning,
                model_config: ModelConfig::new(ProviderType::OpenAI, "gpt-4o"),
                allowed_tools: vec!["run_subagent".to_string(), "read_file".to_string(), "list_dir".to_string()],
                is_coordinator: true,
                max_turns: 25,
                avatar_emoji: Some("👔".to_string()),
                is_builtin: true,
                created_at: Some(chrono::Utc::now().to_rfc3339()),
                updated_at: Some(chrono::Utc::now().to_rfc3339()),
            },
            AgentPersona {
                id: "code-architect".to_string(),
                name: "Code Architect".to_string(),
                role_title: "Senior Software Engineer".to_string(),
                description: "Specialized in codebase analysis, multi-file refactoring, writing unit tests, and terminal command execution.".to_string(),
                system_prompt: "You are an expert Senior Software Engineer. You write clean, robust, and idiomatic code, verify edits carefully, and execute terminal commands to validate implementations.".to_string(),
                capability_tier: CapabilityTier::DeepReasoning,
                model_config: ModelConfig::new(ProviderType::Anthropic, "claude-3-5-sonnet-20241022"),
                allowed_tools: vec![
                    "read_file".to_string(),
                    "write_file".to_string(),
                    "edit_file".to_string(),
                    "list_dir".to_string(),
                    "run_command".to_string(),
                    "grep_search".to_string(),
                ],
                is_coordinator: false,
                max_turns: 30,
                avatar_emoji: Some("💻".to_string()),
                is_builtin: true,
                created_at: Some(chrono::Utc::now().to_rfc3339()),
                updated_at: Some(chrono::Utc::now().to_rfc3339()),
            },
            AgentPersona {
                id: "trend-radar".to_string(),
                name: "Trend Radar".to_string(),
                role_title: "Continuous Market & Social Analyst".to_string(),
                description: "Monitors live feeds, scans web sources, aggregates key industry shifts, and outputs structured intelligence briefings.".to_string(),
                system_prompt: "You are a Real-Time Intelligence Analyst. Your goal is to browse the live web, extract key trending updates, eliminate noise, and synthesize structured, factual summaries.".to_string(),
                capability_tier: CapabilityTier::HighThroughput,
                model_config: ModelConfig::new(ProviderType::OpenAI, "gpt-4o-mini"),
                allowed_tools: vec![
                    "web_search".to_string(),
                    "browser_navigate".to_string(),
                    "browser_screenshot".to_string(),
                ],
                is_coordinator: false,
                max_turns: 15,
                avatar_emoji: Some("📡".to_string()),
                is_builtin: true,
                created_at: Some(chrono::Utc::now().to_rfc3339()),
                updated_at: Some(chrono::Utc::now().to_rfc3339()),
            },
            AgentPersona {
                id: "copywriter".to_string(),
                name: "Content Drafter".to_string(),
                role_title: "Multi-Channel Communications Specialist".to_string(),
                description: "Formats briefs into platform-tailored articles, newsletters, community updates, presentation slides, and PDF documents.".to_string(),
                system_prompt: "You are a Professional Communications Drafter. You craft compelling, clear, and audience-tailored messages across social media, email newsletters, presentations, and reports.".to_string(),
                capability_tier: CapabilityTier::DeepReasoning,
                model_config: ModelConfig::new(ProviderType::OpenAI, "gpt-4o"),
                allowed_tools: vec![
                    "generate_pdf".to_string(),
                    "generate_presentation".to_string(),
                    "write_file".to_string(),
                ],
                is_coordinator: false,
                max_turns: 20,
                avatar_emoji: Some("✍️".to_string()),
                is_builtin: true,
                created_at: Some(chrono::Utc::now().to_rfc3339()),
                updated_at: Some(chrono::Utc::now().to_rfc3339()),
            },
            AgentPersona {
                id: "email-triage".to_string(),
                name: "Inbox & Partner Triage".to_string(),
                role_title: "Partnership & Communications Assistant".to_string(),
                description: "Scans incoming collaboration requests and partner emails, identifies unanswered inquiries, and drafts personalized replies.".to_string(),
                system_prompt: "You are an Executive Partnership & Email Assistant. Your job is to triage communications, identify high-priority inquiries, and draft professional, contextual replies without sending them until approved.".to_string(),
                capability_tier: CapabilityTier::HighThroughput,
                model_config: ModelConfig::new(ProviderType::OpenAI, "gpt-4o"),
                allowed_tools: vec![
                    "read_file".to_string(),
                    "write_file".to_string(),
                ],
                is_coordinator: false,
                max_turns: 15,
                avatar_emoji: Some("📥".to_string()),
                is_builtin: true,
                created_at: Some(chrono::Utc::now().to_rfc3339()),
                updated_at: Some(chrono::Utc::now().to_rfc3339()),
            },
        ]
    }

    fn save_to_disk(&self, list: &[AgentPersona]) -> Result<()> {
        if let Some(parent) = self.file_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }
        let json = serde_json::to_string_pretty(list)?;
        fs::write(&self.file_path, json)?;
        Ok(())
    }

    pub async fn list(&self) -> Vec<AgentPersona> {
        let lock = self.personas.read().await;
        lock.values().cloned().collect()
    }

    pub async fn get(&self, id: &str) -> Option<AgentPersona> {
        let lock = self.personas.read().await;
        lock.get(id).cloned()
    }

    pub async fn get_coordinator(&self) -> Option<AgentPersona> {
        let lock = self.personas.read().await;
        lock.values().find(|p| p.is_coordinator).cloned()
    }

    pub async fn save(&self, persona: AgentPersona) -> Result<AgentPersona> {
        let mut updated = persona.clone();
        updated.updated_at = Some(chrono::Utc::now().to_rfc3339());
        if updated.created_at.is_none() {
            updated.created_at = Some(chrono::Utc::now().to_rfc3339());
        }

        let all_personas: Vec<AgentPersona> = {
            let mut lock = self.personas.write().await;
            // If marking this persona as coordinator, remove coordinator flag from others
            if updated.is_coordinator {
                for existing in lock.values_mut() {
                    if existing.id != updated.id {
                        existing.is_coordinator = false;
                    }
                }
            }
            lock.insert(updated.id.clone(), updated.clone());
            lock.values().cloned().collect()
        };

        self.save_to_disk(&all_personas)?;
        Ok(updated)
    }

    pub async fn delete(&self, id: &str) -> Result<bool> {
        let (deleted, all_personas): (bool, Vec<AgentPersona>) = {
            let mut lock = self.personas.write().await;
            if let Some(existing) = lock.get(id) {
                if existing.is_builtin {
                    return Err(anyhow!("Cannot delete built-in persona '{}'", id));
                }
            }
            let removed = lock.remove(id).is_some();
            (removed, lock.values().cloned().collect())
        };

        if deleted {
            self.save_to_disk(&all_personas)?;
        }
        Ok(deleted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_persona_store_defaults_and_crud() {
        let temp_dir = std::env::temp_dir().join(format!("test_store_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);

        let store = PersonaStore::new(&temp_dir);
        let list = store.list().await;
        assert!(list.len() >= 5);

        let coord = store.get_coordinator().await;
        assert!(coord.is_some());
        assert_eq!(coord.unwrap().id, "coordinator");

        // Save a custom persona
        let custom = AgentPersona::new(
            "custom-finance",
            "Finance Auditor",
            "SaaS & Budget Specialist",
            "Tracks recurring costs",
            "Audit all expenses carefully.",
            ModelConfig::new(ProviderType::OpenAI, "gpt-4o"),
        );
        let saved = store.save(custom).await.unwrap();
        assert_eq!(saved.id, "custom-finance");

        let fetched = store.get("custom-finance").await;
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().name, "Finance Auditor");

        // Delete custom persona
        let deleted = store.delete("custom-finance").await.unwrap();
        assert!(deleted);

        // Cannot delete built-in persona
        let err = store.delete("coordinator").await;
        assert!(err.is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}

