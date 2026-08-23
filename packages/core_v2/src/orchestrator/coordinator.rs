use std::sync::Arc;
use crate::roster::PersonaStore;
use crate::types::AgentPersona;

pub struct Coordinator {
    roster: Arc<PersonaStore>,
}

#[derive(Debug, Clone)]
pub struct RoutedRequest {
    pub persona: AgentPersona,
    pub clean_prompt: String,
    pub explicit_mention: bool,
}

impl Coordinator {
    pub fn new(roster: Arc<PersonaStore>) -> Self {
        Self { roster }
    }

    /// Resolves user input into a target Persona and cleaned prompt.
    ///
    /// Checks for `@persona_id` prefix or tag in the prompt.
    /// If found, routes directly to that persona.
    /// Otherwise, defaults to the designated coordinator (Chief of Staff).
    pub async fn route_prompt(&self, raw_prompt: &str) -> RoutedRequest {
        let trimmed = raw_prompt.trim();

        // Check if prompt starts with or contains `@<id>`
        if let Some(at_idx) = trimmed.find('@') {
            let after_at = &trimmed[at_idx + 1..];
            let end_id = after_at
                .find(|c: char| !c.is_alphanumeric() && c != '-' && c != '_')
                .unwrap_or(after_at.len());
            let target_id = &after_at[..end_id];

            if let Some(persona) = self.roster.get(target_id).await {
                // Remove the @mention from the prompt
                let mut clean = String::new();
                clean.push_str(&trimmed[..at_idx]);
                clean.push_str(&trimmed[at_idx + 1 + end_id..]);
                let clean_prompt = clean.trim().to_string();

                return RoutedRequest {
                    persona,
                    clean_prompt: if clean_prompt.is_empty() {
                        raw_prompt.to_string()
                    } else {
                        clean_prompt
                    },
                    explicit_mention: true,
                };
            }
        }

        // Default to Chief of Staff / Coordinator persona
        let persona = if let Some(coord) = self.roster.get_coordinator().await {
            coord
        } else if let Some(first) = self.roster.list().await.into_iter().next() {
            first
        } else {
            // Fallback default
            PersonaStore::get_default_personas()
                .into_iter()
                .next()
                .unwrap()
        };

        RoutedRequest {
            persona,
            clean_prompt: raw_prompt.to_string(),
            explicit_mention: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_coordinator_explicit_routing() {
        let temp_dir = std::env::temp_dir().join(format!("test_coord_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let roster = Arc::new(PersonaStore::new(&temp_dir));
        let coordinator = Coordinator::new(roster);

        // Test @mention routing
        let routed = coordinator.route_prompt("@trend-radar scan the AI news").await;
        assert!(routed.explicit_mention);
        assert_eq!(routed.persona.id, "trend-radar");
        assert_eq!(routed.clean_prompt, "scan the AI news");

        // Test default routing
        let default_routed = coordinator.route_prompt("How do I architect this application?").await;
        assert!(!default_routed.explicit_mention);
        assert_eq!(default_routed.persona.id, "coordinator");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

