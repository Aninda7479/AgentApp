use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::tools::r#trait::Tool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoItem {
    pub id: usize,
    pub task: String,
    pub status: String, // "pending", "in_progress", "completed", "cancelled"
}

/// Tool for managing session checklists and multi-step tasks across web search, file reads, edits, and terminal actions.
#[derive(Clone, Default)]
pub struct TodoTool {
    items: Arc<RwLock<Vec<TodoItem>>>,
}

impl TodoTool {
    pub fn new() -> Self {
        Self {
            items: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn with_shared_items(items: Arc<RwLock<Vec<TodoItem>>>) -> Self {
        Self { items }
    }
}

#[async_trait]
impl Tool for TodoTool {
    fn name(&self) -> &str {
        "todo"
    }

    fn description(&self) -> &str {
        "Manages session checklists and task tracking across multi-step agent actions (web search, reading files, code edits, commands)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["add", "update", "list", "clear"],
                    "description": "Action to perform: 'add' new task(s), 'update' task status, 'list' current checklist, or 'clear'"
                },
                "task": {
                    "type": "string",
                    "description": "Task description when adding or targeting a single item"
                },
                "items": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of task strings to add in batch"
                },
                "id": {
                    "type": "integer",
                    "description": "1-based task ID to update"
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "completed", "cancelled"],
                    "description": "Updated status for the specified task"
                }
            }
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let action = input
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("list")
            .to_lowercase();

        match action.as_str() {
            "add" => self.add_items(input).await,
            "update" => self.update_item(input).await,
            "clear" | "reset" => self.clear_items().await,
            _ => self.list_items().await,
        }
    }
}

impl TodoTool {
    async fn add_items(&self, input: Value) -> Result<String> {
        let mut guard = self.items.write().await;
        let start_id = guard.len();

        // 1. Check array of items
        if let Some(arr) = input.get("items").and_then(|v| v.as_array()) {
            for (idx, v) in arr.iter().enumerate() {
                let desc = if let Some(s) = v.as_str() {
                    s.to_string()
                } else if let Some(obj) = v.as_object() {
                    obj.get("task")
                        .or_else(|| obj.get("description"))
                        .and_then(|t| t.as_str())
                        .unwrap_or("Task")
                        .to_string()
                } else {
                    format!("Task {}", start_id + idx + 1)
                };

                let status = v
                    .get("status")
                    .and_then(|s| s.as_str())
                    .unwrap_or("pending")
                    .to_string();

                guard.push(TodoItem {
                    id: start_id + idx + 1,
                    task: desc,
                    status,
                });
            }
        } else if let Some(task) = input
            .get("task")
            .or_else(|| input.get("description"))
            .and_then(|v| v.as_str())
        {
            let status = input
                .get("status")
                .and_then(|s| s.as_str())
                .unwrap_or("pending")
                .to_string();

            guard.push(TodoItem {
                id: start_id + 1,
                task: task.to_string(),
                status,
            });
        }

        let formatted = Self::render_checklist(&guard);
        Ok(format!("Checklist updated:\n\n{}", formatted))
    }

    async fn update_item(&self, input: Value) -> Result<String> {
        let mut guard = self.items.write().await;
        let item_id = input
            .get("id")
            .or_else(|| input.get("task_id"))
            .or_else(|| input.get("index"))
            .and_then(|v| v.as_u64())
            .map(|n| n as usize);

        let new_status = input
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("completed");

        if let Some(id) = item_id {
            if let Some(item) = guard.iter_mut().find(|it| it.id == id) {
                item.status = new_status.to_lowercase();
                if let Some(task) = input.get("task").and_then(|v| v.as_str()) {
                    item.task = task.to_string();
                }
            } else {
                return Err(anyhow::anyhow!("Task ID {} not found in checklist", id));
            }
        } else if let Some(task_match) = input.get("task").and_then(|v| v.as_str()) {
            let lower_match = task_match.to_lowercase();
            if let Some(item) = guard
                .iter_mut()
                .find(|it| it.task.to_lowercase().contains(&lower_match))
            {
                item.status = new_status.to_lowercase();
            } else {
                return Err(anyhow::anyhow!("No task matching '{}' found", task_match));
            }
        }

        let formatted = Self::render_checklist(&guard);
        Ok(format!("Checklist updated:\n\n{}", formatted))
    }

    async fn list_items(&self) -> Result<String> {
        let guard = self.items.read().await;
        if guard.is_empty() {
            Ok("Checklist is currently empty. Use `todo(action: \"add\", task: \"...\")` or `todo(action: \"add\", items: [...])` to track tasks.".to_string())
        } else {
            Ok(Self::render_checklist(&guard))
        }
    }

    async fn clear_items(&self) -> Result<String> {
        let mut guard = self.items.write().await;
        guard.clear();
        Ok("Checklist cleared.".to_string())
    }

    fn render_checklist(items: &[TodoItem]) -> String {
        let completed = items
            .iter()
            .filter(|i| i.status == "completed" || i.status == "done")
            .count();
        let total = items.len();

        let mut out = format!(
            "### ☑️ Session Task Checklist ({}/{} completed)\n\n",
            completed, total
        );
        out.push_str("| ID | Status | Task |\n");
        out.push_str("| :-: | :--- | :--- |\n");

        for item in items {
            let badge = match item.status.as_str() {
                "completed" | "done" => "✅ Completed",
                "in_progress" | "running" | "active" => "🔄 In Progress",
                "cancelled" | "skipped" => "⏹️ Cancelled",
                _ => "⏳ Pending",
            };
            out.push_str(&format!("| {} | {} | {} |\n", item.id, badge, item.task));
        }

        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_todo_tool_lifecycle() {
        let tool = TodoTool::new();

        // 1. Initial list empty
        let initial = tool.execute(json!({ "action": "list" })).await.unwrap();
        assert!(initial.contains("Checklist is currently empty"));

        // 2. Add batch items
        let add_res = tool
            .execute(json!({
                "action": "add",
                "items": [
                    "Web search for Axum 0.7 middleware syntax",
                    "Read src/server/mod.rs",
                    "Edit router with new endpoints"
                ]
            }))
            .await
            .unwrap();

        assert!(add_res.contains("Web search for Axum 0.7 middleware syntax"));
        assert!(add_res.contains("Read src/server/mod.rs"));
        assert!(add_res.contains("Edit router with new endpoints"));
        assert!(add_res.contains("0/3 completed"));

        // 3. Update task 1 to completed, task 2 to in_progress
        let up1 = tool
            .execute(json!({
                "action": "update",
                "id": 1,
                "status": "completed"
            }))
            .await
            .unwrap();
        assert!(up1.contains("1/3 completed"));

        let up2 = tool
            .execute(json!({
                "action": "update",
                "id": 2,
                "status": "in_progress"
            }))
            .await
            .unwrap();
        assert!(up2.contains("🔄 In Progress"));

        // 4. Clear checklist
        let clr = tool.execute(json!({ "action": "clear" })).await.unwrap();
        assert!(clr.contains("cleared"));
    }
}
