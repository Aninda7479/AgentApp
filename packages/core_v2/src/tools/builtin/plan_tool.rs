use anyhow::Result;
use async_trait::async_trait;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::tools::r#trait::Tool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: usize,
    pub description: String,
    pub status: String, // "pending", "in_progress", "completed", "failed"
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlanState {
    pub title: String,
    pub steps: Vec<PlanStep>,
    pub notes: String,
    pub updated_at: String,
}

/// Tool for managing an active, stateful execution plan and roadmap ("a plan to go").
#[derive(Clone, Default)]
pub struct PlanTool {
    state: Arc<RwLock<Option<PlanState>>>,
}

impl PlanTool {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(None)),
        }
    }

    pub fn with_shared_state(state: Arc<RwLock<Option<PlanState>>>) -> Self {
        Self { state }
    }
}

#[async_trait]
impl Tool for PlanTool {
    fn name(&self) -> &str {
        "plan"
    }

    fn description(&self) -> &str {
        "Creates, updates, and inspects the active execution roadmap and milestone steps for the current task."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create", "update", "get", "clear"],
                    "description": "Action to perform: 'create' a new plan, 'update' step progress, 'get' current plan status, or 'clear'"
                },
                "title": {
                    "type": "string",
                    "description": "The high-level goal or title of the execution plan"
                },
                "steps": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of sequential step descriptions for the plan"
                },
                "step_id": {
                    "type": "integer",
                    "description": "1-based index or ID of the step to update"
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "completed", "failed"],
                    "description": "Updated status for the specified step"
                },
                "notes": {
                    "type": "string",
                    "description": "Optional notes, context, or architectural decisions"
                }
            }
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let action = input
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("get")
            .to_lowercase();

        match action.as_str() {
            "create" | "set" => self.create_plan(input).await,
            "update" => self.update_plan(input).await,
            "clear" | "reset" => self.clear_plan().await,
            _ => self.get_plan().await,
        }
    }
}

impl PlanTool {
    async fn create_plan(&self, input: Value) -> Result<String> {
        let title = input
            .get("title")
            .or_else(|| input.get("goal"))
            .or_else(|| input.get("objective"))
            .and_then(|v| v.as_str())
            .unwrap_or("Active Execution Plan")
            .to_string();

        let raw_steps = input
            .get("steps")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut steps = Vec::new();
        for (i, step_val) in raw_steps.iter().enumerate() {
            let desc = if let Some(s) = step_val.as_str() {
                s.to_string()
            } else if let Some(obj) = step_val.as_object() {
                obj.get("description")
                    .or_else(|| obj.get("text"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Step")
                    .to_string()
            } else {
                format!("Step {}", i + 1)
            };

            let status = step_val
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or(if i == 0 { "in_progress" } else { "pending" })
                .to_string();

            steps.push(PlanStep {
                id: i + 1,
                description: desc,
                status,
            });
        }

        let notes = input
            .get("notes")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let plan = PlanState {
            title,
            steps,
            notes,
            updated_at: Utc::now().to_rfc3339(),
        };

        let formatted = Self::render_plan(&plan);
        *self.state.write().await = Some(plan);

        Ok(format!("Plan initialized successfully:\n\n{}", formatted))
    }

    async fn update_plan(&self, input: Value) -> Result<String> {
        let mut guard = self.state.write().await;
        let plan = guard.as_mut().ok_or_else(|| {
            anyhow::anyhow!("No active plan exists. Call `plan(action: \"create\", title: \"...\", steps: [...])` first.")
        })?;

        let step_id = input
            .get("step_id")
            .or_else(|| input.get("id"))
            .or_else(|| input.get("step"))
            .and_then(|v| v.as_u64())
            .map(|n| n as usize);

        let new_status = input.get("status").and_then(|v| v.as_str());

        if let Some(sid) = step_id {
            if let Some(step) = plan.steps.iter_mut().find(|s| s.id == sid) {
                if let Some(st) = new_status {
                    step.status = st.to_lowercase();
                }
            } else {
                return Err(anyhow::anyhow!("Step ID {} not found in active plan", sid));
            }
        }

        if let Some(notes) = input.get("notes").and_then(|v| v.as_str()) {
            plan.notes = notes.to_string();
        }

        if let Some(title) = input.get("title").and_then(|v| v.as_str()) {
            plan.title = title.to_string();
        }

        plan.updated_at = Utc::now().to_rfc3339();
        let formatted = Self::render_plan(plan);
        Ok(format!("Plan updated:\n\n{}", formatted))
    }

    async fn get_plan(&self) -> Result<String> {
        let guard = self.state.read().await;
        match guard.as_ref() {
            Some(plan) => Ok(Self::render_plan(plan)),
            None => Ok("No active execution plan currently formulated. Call `plan(action: \"create\", title: \"...\", steps: [...])` to establish a roadmap.".to_string()),
        }
    }

    async fn clear_plan(&self) -> Result<String> {
        *self.state.write().await = None;
        Ok("Execution plan cleared.".to_string())
    }

    fn render_plan(plan: &PlanState) -> String {
        let mut out = format!("# 🗺️ Execution Roadmap: {}\n\n", plan.title);

        if !plan.notes.is_empty() {
            out.push_str(&format!("> **Context & Notes**: {}\n\n", plan.notes));
        }

        out.push_str("| # | Status | Objective |\n");
        out.push_str("| :-: | :--- | :--- |\n");

        for step in &plan.steps {
            let status_badge = match step.status.as_str() {
                "completed" | "done" => "✅ **Completed**",
                "in_progress" | "running" | "active" => "🔄 **In Progress**",
                "failed" | "error" => "❌ **Failed**",
                _ => "⏳ Pending",
            };
            out.push_str(&format!(
                "| {} | {} | {} |\n",
                step.id, status_badge, step.description
            ));
        }

        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_plan_tool_lifecycle() {
        let tool = PlanTool::new();

        // 1. Initially empty
        let initial = tool.execute(json!({ "action": "get" })).await.unwrap();
        assert!(initial.contains("No active execution plan"));

        // 2. Create plan
        let create_res = tool
            .execute(json!({
                "action": "create",
                "title": "Migrate Database Schema",
                "steps": [
                    "Inspect old migrations",
                    "Generate new models",
                    "Run migration tests"
                ]
            }))
            .await
            .unwrap();

        assert!(create_res.contains("Migrate Database Schema"));
        assert!(create_res.contains("Inspect old migrations"));
        assert!(create_res.contains("Generate new models"));
        assert!(create_res.contains("In Progress"));

        // 3. Update step 1 to completed, step 2 to in_progress
        let update_res = tool
            .execute(json!({
                "action": "update",
                "step_id": 1,
                "status": "completed"
            }))
            .await
            .unwrap();
        assert!(update_res.contains("✅ **Completed**"));

        // 4. Clear plan
        let clear_res = tool.execute(json!({ "action": "clear" })).await.unwrap();
        assert!(clear_res.contains("cleared"));
    }
}
