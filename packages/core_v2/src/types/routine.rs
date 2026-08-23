use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RoutineTriggerType {
    Cron,
    Interval,
    Webhook,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineTrigger {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub trigger_type: RoutineTriggerType,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Standard 5/6-part cron expression (e.g. "0 9 * * 1-5" or "*/15 * * * *")
    pub cron_expression: Option<String>,
    /// Interval in seconds for interval triggers
    pub interval_seconds: Option<u64>,
    /// Persona assigned to execute this routine
    pub persona_id: String,
    /// Prompt / instruction sent to the agent on trigger
    pub prompt: String,
    /// Optional webhook token
    pub webhook_token: Option<String>,
    #[serde(default)]
    pub notify_telegram: bool,
    pub telegram_chat_id: Option<String>,
    pub last_run_at: Option<String>,
    pub last_status: Option<String>,
    pub last_error: Option<String>,
    #[serde(default)]
    pub run_count: u64,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineExecutionLog {
    pub log_id: String,
    pub routine_id: String,
    pub triggered_at: String,
    pub completed_at: String,
    pub status: String,
    pub output: String,
    pub error: Option<String>,
    pub duration_ms: u64,
}
