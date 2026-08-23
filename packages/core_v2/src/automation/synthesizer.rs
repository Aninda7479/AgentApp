use std::path::{Path, PathBuf};
use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::automation::recorder::DemonstrationTrace;
use crate::types::ModelConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SynthesizedSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub parameters_schema: serde_json::Value,
    pub execution_script: String,
    pub language: String,
    pub created_at: String,
}

pub struct SkillSynthesizer {
    skills_dir: PathBuf,
}

impl SkillSynthesizer {
    pub fn new(workspace_root: &Path) -> Self {
        let skills_dir = workspace_root.join(".superagent").join("skills");
        Self { skills_dir }
    }

    /// Synthesizes a raw trace into a structured skill template.
    pub async fn synthesize_from_trace(
        &self,
        trace: &DemonstrationTrace,
        skill_name: &str,
        _model_config: &ModelConfig,
    ) -> Result<SynthesizedSkill> {
        let skill_id = skill_name
            .to_lowercase()
            .replace(' ', "-")
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-')
            .collect::<String>();

        let action_count = trace.actions.len();
        let description = format!(
            "Automated workflow synthesized from {} recorded actions: {}",
            action_count, trace.description
        );

        // Generate synthetic executable workflow definition
        let actions_json = serde_json::to_string_pretty(&trace.actions)?;
        let execution_script = format!(
            "// Synthesized Workflow: {}\n// Actions: {}\nconst recordedSteps = {};\n\nexport async function run(params) {{\n  console.log('Executing synthesized skill with parameters:', params);\n  // Replay steps...\n  return {{ status: 'completed', steps: recordedSteps.length }};\n}}",
            trace.title, action_count, actions_json
        );

        let skill = SynthesizedSkill {
            id: skill_id.clone(),
            name: skill_name.to_string(),
            description,
            parameters_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "input": { "type": "string", "description": "Custom parameter for workflow execution" }
                }
            }),
            execution_script,
            language: "javascript".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        self.save_skill(&skill).await?;
        Ok(skill)
    }

    pub async fn save_skill(&self, skill: &SynthesizedSkill) -> Result<()> {
        if !self.skills_dir.exists() {
            tokio::fs::create_dir_all(&self.skills_dir).await?;
        }
        let file_path = self.skills_dir.join(format!("{}.json", skill.id));
        let json = serde_json::to_string_pretty(skill)?;
        tokio::fs::write(file_path, json).await?;
        Ok(())
    }

    pub async fn list_skills(&self) -> Result<Vec<SynthesizedSkill>> {
        let mut list = Vec::new();
        if !self.skills_dir.exists() {
            return Ok(list);
        }
        let mut entries = tokio::fs::read_dir(&self.skills_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = tokio::fs::read_to_string(&path).await {
                    if let Ok(skill) = serde_json::from_str::<SynthesizedSkill>(&content) {
                        list.push(skill);
                    }
                }
            }
        }
        Ok(list)
    }
}
