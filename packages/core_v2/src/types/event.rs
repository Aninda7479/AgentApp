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
}
