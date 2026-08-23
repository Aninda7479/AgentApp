use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentEvent {
    Token {
        text: String,
    },
    ToolCall {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    ToolOutput {
        tool_use_id: String,
        output: String,
        is_error: bool,
    },
    Error {
        message: String,
    },
    Finished {
        stop_reason: String,
    },
    // Multi-Agent Collaboration Events
    AgentHandover {
        from_persona: String,
        to_persona: String,
        reason: String,
    },
    SubagentStart {
        subagent_id: String,
        persona_id: String,
        prompt: String,
    },
    SubagentFinish {
        subagent_id: String,
        output: String,
        is_error: bool,
    },
    WorkflowProgress {
        workflow_id: String,
        step_index: usize,
        total_steps: usize,
        step_name: String,
        status: String,
    },
}
