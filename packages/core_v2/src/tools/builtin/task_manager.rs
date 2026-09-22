use anyhow::{anyhow, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;

const MAX_OUTPUT_LINES: usize = 150;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Running,
    Completed { exit_code: i32 },
    Failed { error: String },
    Terminated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSnapshot {
    pub id: String,
    pub command: String,
    pub cwd: String,
    pub status: TaskStatus,
    pub elapsed_secs: u64,
    pub started_at_timestamp: u64,
    pub output_tail: String,
}

struct ManagedTask {
    id: String,
    command: String,
    cwd: PathBuf,
    started_at: Instant,
    started_at_timestamp: u64,
    status: TaskStatus,
    output_lines: Vec<String>,
    kill_tx: Option<oneshot::Sender<()>>,
}

/// Shared TaskManager tracking asynchronous background commands and processes.
pub struct TaskManager {
    tasks: Arc<RwLock<HashMap<String, ManagedTask>>>,
    counter: AtomicU64,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
            counter: AtomicU64::new(1),
        }
    }

    /// Spawns a command in the background, logging its output lines in memory.
    pub fn spawn_background(&self, command_str: &str, working_dir: PathBuf) -> Result<String> {
        let task_num = self.counter.fetch_add(1, Ordering::SeqCst);
        let task_id = format!("task-{}", task_num);
        let now_ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::ZERO)
            .as_secs();

        let (kill_tx, mut kill_rx) = oneshot::channel::<()>();

        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("powershell");
            #[cfg(target_os = "windows")]
            c.creation_flags(0x08000000);
            c.args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                command_str,
            ]);
            if let Ok(path_var) = std::env::var("PATH") {
                let mut custom_path = path_var;
                if let Ok(userprofile) = std::env::var("USERPROFILE") {
                    let sa_bin = format!("{}\\.superagent", userprofile);
                    let win_apps =
                        format!("{}\\AppData\\Local\\Microsoft\\WindowsApps", userprofile);
                    if !custom_path.contains(&sa_bin) {
                        custom_path = format!("{};{}", sa_bin, custom_path);
                    }
                    if !custom_path.contains(&win_apps) {
                        custom_path = format!("{};{}", win_apps, custom_path);
                    }
                }
                c.env("PATH", custom_path);
            }
            c
        } else {
            let mut c = Command::new("sh");
            c.args(["-c", command_str]);
            c
        };

        cmd.current_dir(&working_dir)
            .kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            anyhow!(
                "Failed to spawn background command '{}': {}",
                command_str,
                e
            )
        })?;

        let managed = ManagedTask {
            id: task_id.clone(),
            command: command_str.to_string(),
            cwd: working_dir,
            started_at: Instant::now(),
            started_at_timestamp: now_ts,
            status: TaskStatus::Running,
            output_lines: Vec::new(),
            kill_tx: Some(kill_tx),
        };

        self.tasks.write().insert(task_id.clone(), managed);

        let tasks_clone = Arc::clone(&self.tasks);
        let task_id_clone = task_id.clone();

        tokio::spawn(async move {
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            let tasks_for_out = Arc::clone(&tasks_clone);
            let id_for_out = task_id_clone.clone();

            let stdout_handle = tokio::spawn(async move {
                if let Some(out) = stdout {
                    let mut reader = BufReader::new(out).lines();
                    while let Ok(Some(line)) = reader.next_line().await {
                        let mut lock = tasks_for_out.write();
                        if let Some(t) = lock.get_mut(&id_for_out) {
                            if t.output_lines.len() >= MAX_OUTPUT_LINES {
                                t.output_lines.remove(0);
                            }
                            t.output_lines.push(line);
                        }
                    }
                }
            });

            let tasks_for_err = Arc::clone(&tasks_clone);
            let id_for_err = task_id_clone.clone();

            let stderr_handle = tokio::spawn(async move {
                if let Some(err) = stderr {
                    let mut reader = BufReader::new(err).lines();
                    while let Ok(Some(line)) = reader.next_line().await {
                        let mut lock = tasks_for_err.write();
                        if let Some(t) = lock.get_mut(&id_for_err) {
                            if t.output_lines.len() >= MAX_OUTPUT_LINES {
                                t.output_lines.remove(0);
                            }
                            t.output_lines.push(format!("[stderr] {}", line));
                        }
                    }
                }
            });

            tokio::select! {
                res = child.wait() => {
                    let _ = stdout_handle.await;
                    let _ = stderr_handle.await;
                    let mut lock = tasks_clone.write();
                    if let Some(t) = lock.get_mut(&task_id_clone) {
                        match res {
                            Ok(status) => {
                                t.status = TaskStatus::Completed {
                                    exit_code: status.code().unwrap_or(-1),
                                };
                            }
                            Err(e) => {
                                t.status = TaskStatus::Failed { error: e.to_string() };
                            }
                        }
                    }
                }
                _ = &mut kill_rx => {
                    let _ = child.kill().await;
                    let mut lock = tasks_clone.write();
                    if let Some(t) = lock.get_mut(&task_id_clone) {
                        t.status = TaskStatus::Terminated;
                    }
                }
            }
        });

        Ok(task_id)
    }

    /// Peeks into a specific task or all tasks.
    pub fn peek(&self, task_id: Option<&str>) -> Vec<TaskSnapshot> {
        let lock = self.tasks.read();
        let now = Instant::now();

        if let Some(id) = task_id {
            if let Some(t) = lock.get(id) {
                vec![TaskSnapshot {
                    id: t.id.clone(),
                    command: t.command.clone(),
                    cwd: t.cwd.to_string_lossy().to_string(),
                    status: t.status.clone(),
                    elapsed_secs: now.duration_since(t.started_at).as_secs(),
                    started_at_timestamp: t.started_at_timestamp,
                    output_tail: t.output_lines.join("\n"),
                }]
            } else {
                Vec::new()
            }
        } else {
            let mut list: Vec<TaskSnapshot> = lock
                .values()
                .map(|t| TaskSnapshot {
                    id: t.id.clone(),
                    command: t.command.clone(),
                    cwd: t.cwd.to_string_lossy().to_string(),
                    status: t.status.clone(),
                    elapsed_secs: now.duration_since(t.started_at).as_secs(),
                    started_at_timestamp: t.started_at_timestamp,
                    output_tail: t
                        .output_lines
                        .iter()
                        .rev()
                        .take(10)
                        .cloned()
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect::<Vec<_>>()
                        .join("\n"),
                })
                .collect();
            list.sort_by_key(|t| t.started_at_timestamp);
            list
        }
    }

    /// Kills a running background task.
    pub fn kill(&self, task_id: &str) -> Result<()> {
        let mut lock = self.tasks.write();
        if let Some(t) = lock.get_mut(task_id) {
            if let Some(tx) = t.kill_tx.take() {
                let _ = tx.send(());
                t.status = TaskStatus::Terminated;
                Ok(())
            } else {
                Err(anyhow!(
                    "Task '{}' is not currently running or cannot be stopped",
                    task_id
                ))
            }
        } else {
            Err(anyhow!("Task '{}' not found", task_id))
        }
    }
}

impl Default for TaskManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::current_dir;

    #[tokio::test]
    async fn test_task_manager_spawn_and_peek() {
        let tm = TaskManager::new();
        let cwd = current_dir().unwrap();

        let cmd = if cfg!(target_os = "windows") {
            "Write-Output 'hello background task'"
        } else {
            "echo 'hello background task'"
        };

        let task_id = tm.spawn_background(cmd, cwd).unwrap();
        assert!(task_id.starts_with("task-"));

        // Wait brief moment for process execution
        tokio::time::sleep(Duration::from_millis(500)).await;

        let snaps = tm.peek(Some(&task_id));
        assert_eq!(snaps.len(), 1);
        let snap = &snaps[0];
        assert_eq!(snap.id, task_id);
        assert!(snap.command.contains("hello background task"));

        let all_snaps = tm.peek(None);
        assert!(!all_snaps.is_empty());
    }

    #[tokio::test]
    async fn test_task_manager_kill() {
        let tm = TaskManager::new();
        let cwd = current_dir().unwrap();

        let cmd = if cfg!(target_os = "windows") {
            "Start-Sleep -Seconds 10"
        } else {
            "sleep 10"
        };

        let task_id = tm.spawn_background(cmd, cwd).unwrap();
        let res = tm.kill(&task_id);
        assert!(res.is_ok());

        let snaps = tm.peek(Some(&task_id));
        assert_eq!(snaps.len(), 1);
        assert!(matches!(snaps[0].status, TaskStatus::Terminated));
    }
}
