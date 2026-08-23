use std::sync::Arc;
use std::time::Instant;
use anyhow::Result;
use tokio::sync::mpsc;

use crate::orchestrator::SubagentRunner;
use crate::types::{
    AgentEvent, WorkflowDefinition, WorkflowExecutionResult, WorkflowStepResult,
};

pub struct PipelineExecutor {
    subagent_runner: Arc<SubagentRunner>,
}

impl PipelineExecutor {
    pub fn new(subagent_runner: Arc<SubagentRunner>) -> Self {
        Self { subagent_runner }
    }

    /// Executes a sequential multi-agent workflow pipeline.
    pub async fn execute_pipeline(
        &self,
        workflow: &WorkflowDefinition,
        initial_input: &str,
        event_tx: Option<mpsc::Sender<AgentEvent>>,
    ) -> Result<WorkflowExecutionResult> {
        let start_time = Instant::now();
        let total_steps = workflow.steps.len();
        let mut step_results: Vec<WorkflowStepResult> = Vec::new();
        let mut previous_output = initial_input.to_string();

        for (idx, step) in workflow.steps.iter().enumerate() {
            let step_start = Instant::now();

            if let Some(ref tx) = event_tx {
                let _ = tx
                    .send(AgentEvent::WorkflowProgress {
                        workflow_id: workflow.id.clone(),
                        step_index: idx + 1,
                        total_steps,
                        step_name: step.name.clone(),
                        status: "running".to_string(),
                    })
                    .await;
            }

            // Construct step prompt
            let prompt = if step.pass_previous_output && !previous_output.is_empty() {
                if step.prompt_template.contains("{{previous_output}}") {
                    step.prompt_template.replace("{{previous_output}}", &previous_output)
                } else {
                    format!(
                        "{}\n\n--- Input / Context from Previous Step ---\n{}",
                        step.prompt_template, previous_output
                    )
                }
            } else {
                step.prompt_template.clone()
            };

            let step_exec_res = self
                .subagent_runner
                .execute_subagent(&step.persona_id, &prompt)
                .await;

            let (output, is_error) = match step_exec_res {
                Ok(out) => (out, false),
                Err(err) => (format!("Error executing step '{}': {}", step.name, err), true),
            };

            let duration_ms = step_start.elapsed().as_millis() as u64;

            let step_result = WorkflowStepResult {
                step_id: step.step_id.clone(),
                step_name: step.name.clone(),
                persona_id: step.persona_id.clone(),
                output: output.clone(),
                is_error,
                duration_ms,
            };

            step_results.push(step_result);

            if is_error {
                if let Some(ref tx) = event_tx {
                    let _ = tx
                        .send(AgentEvent::WorkflowProgress {
                            workflow_id: workflow.id.clone(),
                            step_index: idx + 1,
                            total_steps,
                            step_name: step.name.clone(),
                            status: "failed".to_string(),
                        })
                        .await;
                }

                let total_duration_ms = start_time.elapsed().as_millis() as u64;
                return Ok(WorkflowExecutionResult {
                    workflow_id: workflow.id.clone(),
                    workflow_name: workflow.name.clone(),
                    success: false,
                    step_results,
                    final_output: output,
                    total_duration_ms,
                });
            }

            previous_output = output;

            if let Some(ref tx) = event_tx {
                let _ = tx
                    .send(AgentEvent::WorkflowProgress {
                        workflow_id: workflow.id.clone(),
                        step_index: idx + 1,
                        total_steps,
                        step_name: step.name.clone(),
                        status: "completed".to_string(),
                    })
                    .await;
            }
        }

        let total_duration_ms = start_time.elapsed().as_millis() as u64;

        Ok(WorkflowExecutionResult {
            workflow_id: workflow.id.clone(),
            workflow_name: workflow.name.clone(),
            success: true,
            step_results,
            final_output: previous_output,
            total_duration_ms,
        })
    }
}
