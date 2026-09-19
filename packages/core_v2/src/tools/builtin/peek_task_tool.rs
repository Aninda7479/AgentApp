use std::sync::Arc;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};

use crate::tools::builtin::task_manager::{TaskManager, TaskStatus};
use crate::tools::r#trait::Tool;

/// Tool allowing the agent to inspect running/completed background tasks and their output logs.
pub struct PeekTaskTool {
    task_manager: Arc<TaskManager>,
}

impl PeekTaskTool {
    pub fn new(task_manager: Arc<TaskManager>) -> Self {
        Self { task_manager }
    }
}

#[async_trait]
impl Tool for PeekTaskTool {
    fn name(&self) -> &str {
        "peek_tasks"
    }

    fn description(&self) -> &str {
        "Inspects currently running or recently completed background tasks and processes. Returns status, elapsed runtime, exit code, and latest stdout/stderr output lines. Can also terminate a running task."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Specific task ID to inspect (e.g. 'task-1'). If omitted, lists all active and recently completed tasks."
                },
                "kill": {
                    "type": "boolean",
                    "description": "If true, terminates the specified running task instead of just reading its status."
                }
            }
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let task_id = input["task_id"].as_str();
        let should_kill = input["kill"].as_bool().unwrap_or(false);

        if should_kill {
            let id = task_id.ok_or_else(|| anyhow!("Parameter 'task_id' is required when kill=true"))?;
            self.task_manager.kill(id)?;
            return Ok(format!("Background task '{}' has been terminated.", id));
        }

        let snapshots = self.task_manager.peek(task_id);

        if snapshots.is_empty() {
            if let Some(id) = task_id {
                return Ok(format!("Task '{}' was not found in the active background task registry.", id));
            } else {
                return Ok("No background tasks are currently running or recorded.".to_string());
            }
        }

        let mut out = String::new();
        for snap in &snapshots {
            let status_str = match &snap.status {
                TaskStatus::Running => format!("RUNNING (elapsed: {}s)", snap.elapsed_secs),
                TaskStatus::Completed { exit_code } => format!("COMPLETED (exit code: {})", exit_code),
                TaskStatus::Failed { error } => format!("FAILED ({})", error),
                TaskStatus::Terminated => "TERMINATED BY USER".to_string(),
            };

            out.push_str(&format!("=== Task: {} ===\n", snap.id));
            out.push_str(&format!("Command: {}\n", snap.command));
            out.push_str(&format!("Status: {}\n", status_str));
            out.push_str(&format!("Directory: {}\n", snap.cwd));

            if !snap.output_tail.is_empty() {
                out.push_str("--- Latest Output Tail ---\n");
                out.push_str(&snap.output_tail);
                if !snap.output_tail.ends_with('\n') {
                    out.push('\n');
                }
            } else {
                out.push_str("Output: (no output captured yet)\n");
            }
            out.push('\n');
        }

        Ok(out.trim_end().to_string())
    }
}
