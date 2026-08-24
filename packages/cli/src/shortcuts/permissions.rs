use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PermissionLevel {
    #[default]
    Auto,
    Ask,
    Deny,
}

impl PermissionLevel {
    pub fn cycle(&self) -> Self {
        match self {
            PermissionLevel::Auto => PermissionLevel::Ask,
            PermissionLevel::Ask => PermissionLevel::Deny,
            PermissionLevel::Deny => PermissionLevel::Auto,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            PermissionLevel::Auto => "auto",
            PermissionLevel::Ask => "ask",
            PermissionLevel::Deny => "deny",
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            PermissionLevel::Auto => "Full Autonomy — execute all tool calls without confirmation",
            PermissionLevel::Ask => "Ask Permission — prompt before executing modifications",
            PermissionLevel::Deny => "Deny All — block execution of side-effecting tools",
        }
    }
}
