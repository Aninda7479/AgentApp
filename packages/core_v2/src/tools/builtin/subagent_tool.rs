use std::sync::Arc;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};

use crate::orchestrator::SubagentRunner;
use crate::tools::r#trait::Tool;

pub struct RunSubagentTool {
    runner: Arc<SubagentRunner>,
}

impl RunSubagentTool {
    pub fn new(runner: Arc<SubagentRunner>) -> Self {
        Self { runner }
    }
}

#[async_trait]
impl Tool for RunSubagentTool {
    fn name(&self) -> &str {
        "run_subagent"
    }

    fn description(&self) -> &str {
        "Delegates a sub-task or research query to a specialized agent persona (e.g. 'code-architect', 'trend-radar', 'copywriter', 'email-triage')."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "persona_id": {
                    "type": "string",
                    "description": "ID of the specialized persona to invoke (e.g. 'code-architect', 'trend-radar', 'copywriter', 'email-triage')"
                },
                "prompt": {
                    "type": "string",
                    "description": "Clear and detailed task description or query for the subagent"
                }
            },
            "required": ["persona_id", "prompt"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let persona_id = input["persona_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'persona_id' parameter"))?;
        let prompt = input["prompt"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'prompt' parameter"))?;

        self.runner.execute_subagent(persona_id, prompt).await
    }
}
