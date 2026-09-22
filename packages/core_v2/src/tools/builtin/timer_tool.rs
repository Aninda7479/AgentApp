use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::time::Duration;
use tokio::time::sleep;

use crate::tools::r#trait::Tool;

/// Tool that pauses agent execution for a specified duration (e.g. 5s, 10s, 30s)
/// with a reason, preventing busy-polling loops when waiting for processes or external jobs.
pub struct SleepTimerTool {
    max_seconds: u64,
}

impl SleepTimerTool {
    pub fn new() -> Self {
        Self { max_seconds: 300 }
    }

    pub fn with_max_seconds(max_seconds: u64) -> Self {
        Self { max_seconds }
    }
}

impl Default for SleepTimerTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for SleepTimerTool {
    fn name(&self) -> &str {
        "sleep_timer"
    }

    fn description(&self) -> &str {
        "Pauses execution for a specified number of seconds before continuing. Use this when waiting for a background process, video download, rendering, or external job to finish, instead of polling rapidly in tight loops."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "seconds": {
                    "type": "integer",
                    "description": "Number of seconds to wait (e.g. 5, 10, 15, 30, 60). Maximum 300 seconds."
                },
                "reason": {
                    "type": "string",
                    "description": "Short explanation of what process or task you are waiting for (e.g. 'Waiting for yt-dlp to download YouTube Shorts video')."
                }
            },
            "required": ["seconds"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let requested_seconds = input["seconds"]
            .as_u64()
            .ok_or_else(|| anyhow!("Missing required integer parameter 'seconds'"))?;

        if requested_seconds == 0 {
            return Ok("Sleep timer duration was 0 seconds. Continued immediately.".to_string());
        }

        let seconds = requested_seconds.min(self.max_seconds);
        let reason = input["reason"]
            .as_str()
            .unwrap_or("Waiting for background task or process to make progress");

        sleep(Duration::from_secs(seconds)).await;

        Ok(format!(
            "Timer completed: waited {} second{} for '{}'. You may now inspect generated files, check background task status, or proceed.",
            seconds,
            if seconds == 1 { "" } else { "s" },
            reason
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sleep_timer_schema_and_name() {
        let tool = SleepTimerTool::new();
        assert_eq!(tool.name(), "sleep_timer");
        assert!(tool.description().contains("Pauses execution"));
        let schema = tool.parameters_schema();
        assert!(schema
            .get("properties")
            .and_then(|p| p.get("seconds"))
            .is_some());
    }

    #[tokio::test]
    async fn test_sleep_timer_zero_seconds() {
        let tool = SleepTimerTool::new();
        let res = tool
            .execute(json!({ "seconds": 0, "reason": "none" }))
            .await
            .unwrap();
        assert!(res.contains("0 seconds"));
    }

    #[tokio::test]
    async fn test_sleep_timer_short_duration() {
        let tool = SleepTimerTool::new();
        let res = tool
            .execute(json!({ "seconds": 1, "reason": "unit test" }))
            .await
            .unwrap();
        assert!(res.contains("waited 1 second"));
        assert!(res.contains("unit test"));
    }
}
