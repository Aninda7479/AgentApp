use std::collections::HashMap;
use std::sync::Arc;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RecordedAction {
    Navigate {
        url: String,
        timestamp: String,
    },
    Click {
        selector: Option<String>,
        x: Option<i32>,
        y: Option<i32>,
        text: Option<String>,
        timestamp: String,
    },
    Type {
        selector: Option<String>,
        text: String,
        is_secret: bool,
        timestamp: String,
    },
    Command {
        cmd: String,
        output: Option<String>,
        timestamp: String,
    },
    Screenshot {
        description: Option<String>,
        timestamp: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemonstrationTrace {
    pub session_id: String,
    pub title: String,
    pub description: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub actions: Vec<RecordedAction>,
}

#[derive(Clone, Default)]
pub struct TraceRecorder {
    sessions: Arc<RwLock<HashMap<String, DemonstrationTrace>>>,
}

impl TraceRecorder {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn start_session(&self, title: &str, description: &str) -> String {
        let session_id = format!("trace_{}", Utc::now().timestamp_millis());
        let trace = DemonstrationTrace {
            session_id: session_id.clone(),
            title: title.to_string(),
            description: description.to_string(),
            started_at: Utc::now().to_rfc3339(),
            completed_at: None,
            actions: Vec::new(),
        };

        let mut lock = self.sessions.write().await;
        lock.insert(session_id.clone(), trace);
        session_id
    }

    pub async fn record_action(&self, session_id: &str, action: RecordedAction) -> bool {
        let mut lock = self.sessions.write().await;
        if let Some(trace) = lock.get_mut(session_id) {
            trace.actions.push(action);
            true
        } else {
            false
        }
    }

    pub async fn stop_session(&self, session_id: &str) -> Option<DemonstrationTrace> {
        let mut lock = self.sessions.write().await;
        if let Some(trace) = lock.get_mut(session_id) {
            trace.completed_at = Some(Utc::now().to_rfc3339());
            Some(trace.clone())
        } else {
            None
        }
    }

    pub async fn get_trace(&self, session_id: &str) -> Option<DemonstrationTrace> {
        let lock = self.sessions.read().await;
        lock.get(session_id).cloned()
    }
}
