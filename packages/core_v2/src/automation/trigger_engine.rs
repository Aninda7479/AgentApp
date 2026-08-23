use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use anyhow::{anyhow, Result};
use chrono::Utc;
use cron::Schedule;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

use crate::orchestrator::SubagentRunner;
use crate::storage::settings::get_superagent_dir;
use crate::types::{RoutineExecutionLog, RoutineTrigger, RoutineTriggerType};

const ROUTINES_FILE: &str = "routines.json";

#[derive(Clone)]
pub struct TriggerEngine {
    file_path: PathBuf,
    routines: Arc<RwLock<HashMap<String, RoutineTrigger>>>,
    subagent_runner: Arc<SubagentRunner>,
}

impl TriggerEngine {
    pub fn new(user_data: &Path, subagent_runner: Arc<SubagentRunner>) -> Self {
        let file_path = user_data.join(ROUTINES_FILE);
        let routines = Arc::new(RwLock::new(HashMap::new()));
        let engine = Self {
            file_path,
            routines,
            subagent_runner,
        };
        engine.load_from_disk();
        engine
    }

    pub fn default_engine(subagent_runner: Arc<SubagentRunner>) -> Self {
        let dir = get_superagent_dir();
        Self::new(&dir, subagent_runner)
    }

    fn load_from_disk(&self) {
        if self.file_path.exists() {
            if let Ok(content) = fs::read_to_string(&self.file_path) {
                if let Ok(loaded) = serde_json::from_str::<Vec<RoutineTrigger>>(&content) {
                    if let Ok(mut lock) = self.routines.try_write() {
                        for r in loaded {
                            lock.insert(r.id.clone(), r);
                        }
                    }
                }
            }
        }
    }

    fn save_to_disk(&self, list: &[RoutineTrigger]) -> Result<()> {
        if let Some(parent) = self.file_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }
        let json = serde_json::to_string_pretty(list)?;
        fs::write(&self.file_path, json)?;
        Ok(())
    }

    pub async fn list(&self) -> Vec<RoutineTrigger> {
        let lock = self.routines.read().await;
        lock.values().cloned().collect()
    }

    pub async fn get(&self, id: &str) -> Option<RoutineTrigger> {
        let lock = self.routines.read().await;
        lock.get(id).cloned()
    }

    pub async fn save(&self, mut routine: RoutineTrigger) -> Result<RoutineTrigger> {
        routine.updated_at = Some(Utc::now().to_rfc3339());
        if routine.created_at.is_none() {
            routine.created_at = Some(Utc::now().to_rfc3339());
        }

        // Validate cron expression if trigger type is Cron
        if routine.trigger_type == RoutineTriggerType::Cron {
            if let Some(ref expr) = routine.cron_expression {
                // Ensure 6 or 7 part expression for the `cron` crate if 5 parts given
                let standard_expr = if expr.split_whitespace().count() == 5 {
                    format!("0 {}", expr)
                } else {
                    expr.clone()
                };
                Schedule::from_str(&standard_expr)
                    .map_err(|e| anyhow!("Invalid cron expression '{}': {}", expr, e))?;
            } else {
                return Err(anyhow!("Cron expression is required for cron trigger type"));
            }
        }

        let all_routines: Vec<RoutineTrigger> = {
            let mut lock = self.routines.write().await;
            lock.insert(routine.id.clone(), routine.clone());
            lock.values().cloned().collect()
        };

        self.save_to_disk(&all_routines)?;
        Ok(routine)
    }

    pub async fn delete(&self, id: &str) -> Result<bool> {
        let (deleted, all_routines): (bool, Vec<RoutineTrigger>) = {
            let mut lock = self.routines.write().await;
            let removed = lock.remove(id).is_some();
            (removed, lock.values().cloned().collect())
        };

        if deleted {
            self.save_to_disk(&all_routines)?;
        }
        Ok(deleted)
    }

    /// Manually or scheduled execution of a routine.
    pub async fn execute_routine(&self, id: &str) -> Result<RoutineExecutionLog> {
        let routine = self
            .get(id)
            .await
            .ok_or_else(|| anyhow!("Routine trigger '{}' not found", id))?;

        let triggered_at = Utc::now();
        let start_inst = std::time::Instant::now();

        info!(
            "▶ Executing scheduled routine '{}' ({}) via persona '{}'",
            routine.name, routine.id, routine.persona_id
        );

        let result = self
            .subagent_runner
            .execute_subagent(&routine.persona_id, &routine.prompt)
            .await;

        let completed_at = Utc::now();
        let duration_ms = start_inst.elapsed().as_millis() as u64;

        let (status, output, error_msg) = match result {
            Ok(out) => {
                info!("✔ Routine '{}' completed in {}ms", routine.name, duration_ms);
                ("success".to_string(), out, None)
            }
            Err(err) => {
                let msg = err.to_string();
                error!("✘ Routine '{}' failed: {}", routine.name, msg);
                ("error".to_string(), String::new(), Some(msg))
            }
        };

        // Update routine stats
        let all_routines: Vec<RoutineTrigger> = {
            let mut lock = self.routines.write().await;
            if let Some(r) = lock.get_mut(id) {
                r.last_run_at = Some(completed_at.to_rfc3339());
                r.last_status = Some(status.clone());
                r.last_error = error_msg.clone();
                r.run_count += 1;
            }
            lock.values().cloned().collect()
        };
        let _ = self.save_to_disk(&all_routines);

        let log = RoutineExecutionLog {
            log_id: format!("log_{}_{}", id, triggered_at.timestamp_millis()),
            routine_id: id.to_string(),
            triggered_at: triggered_at.to_rfc3339(),
            completed_at: completed_at.to_rfc3339(),
            status,
            output,
            error: error_msg,
            duration_ms,
        };

        Ok(log)
    }

    /// Spawns the background cron/interval runner ticker.
    pub fn start_scheduler(self: Arc<Self>) {
        tokio::spawn(async move {
            info!("⏰ Starting SuperAgent Routine Trigger Scheduler...");
            let mut ticker = tokio::time::interval(Duration::from_secs(30));

            loop {
                ticker.tick().await;
                let active_routines = self.list().await;
                let now = Utc::now();

                for routine in active_routines {
                    if !routine.enabled {
                        continue;
                    }

                    let should_run = match routine.trigger_type {
                        RoutineTriggerType::Interval => {
                            if let Some(interval_secs) = routine.interval_seconds {
                                if let Some(ref last) = routine.last_run_at {
                                    if let Ok(last_dt) = chrono::DateTime::parse_from_rfc3339(last) {
                                        (now - last_dt.with_timezone(&Utc)).num_seconds() >= interval_secs as i64
                                    } else {
                                        true
                                    }
                                } else {
                                    true
                                }
                            } else {
                                false
                            }
                        }
                        RoutineTriggerType::Cron => {
                            if let Some(ref expr) = routine.cron_expression {
                                let standard_expr = if expr.split_whitespace().count() == 5 {
                                    format!("0 {}", expr)
                                } else {
                                    expr.clone()
                                };
                                if let Ok(sched) = Schedule::from_str(&standard_expr) {
                                    if let Some(last_run) = routine.last_run_at.as_ref().and_then(|dt| chrono::DateTime::parse_from_rfc3339(dt).ok()) {
                                        let last_utc = last_run.with_timezone(&Utc);
                                        // Find upcoming time after last_run
                                        if let Some(next) = sched.after(&last_utc).next() {
                                            next <= now
                                        } else {
                                            false
                                        }
                                    } else {
                                        true
                                    }
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        }
                        RoutineTriggerType::Webhook => false,
                    };

                    if should_run {
                        let engine_ref = self.clone();
                        let r_id = routine.id.clone();
                        tokio::spawn(async move {
                            if let Err(e) = engine_ref.execute_routine(&r_id).await {
                                warn!("Routine execution error for '{}': {}", r_id, e);
                            }
                        });
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::roster::PersonaStore;
    use crate::tools::ToolRegistry;

    #[tokio::test]
    async fn test_routine_trigger_crud() {
        let temp_dir = std::env::temp_dir().join(format!("test_routines_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);

        let roster = Arc::new(PersonaStore::new(&temp_dir));
        let tools = Arc::new(ToolRegistry::new());
        let subagents = Arc::new(SubagentRunner::new(roster, tools));

        let engine = TriggerEngine::new(&temp_dir, subagents);

        let routine = RoutineTrigger {
            id: "daily-morning-scan".to_string(),
            name: "Morning Trend Radar".to_string(),
            description: Some("Scans feeds at 9 AM".to_string()),
            trigger_type: RoutineTriggerType::Cron,
            enabled: true,
            cron_expression: Some("0 9 * * 1-5".to_string()),
            interval_seconds: None,
            persona_id: "trend-radar".to_string(),
            prompt: "Summarize top 5 trends".to_string(),
            webhook_token: None,
            notify_telegram: false,
            telegram_chat_id: None,
            last_run_at: None,
            last_status: None,
            last_error: None,
            run_count: 0,
            created_at: None,
            updated_at: None,
        };

        let saved = engine.save(routine).await.unwrap();
        assert_eq!(saved.id, "daily-morning-scan");

        let fetched = engine.get("daily-morning-scan").await;
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().name, "Morning Trend Radar");

        let list = engine.list().await;
        assert_eq!(list.len(), 1);

        let deleted = engine.delete("daily-morning-scan").await.unwrap();
        assert!(deleted);

        let list_after = engine.list().await;
        assert_eq!(list_after.len(), 0);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}

