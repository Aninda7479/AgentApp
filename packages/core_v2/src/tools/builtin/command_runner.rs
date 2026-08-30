use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::process::Command;
use tokio::time::timeout;

use crate::tools::builtin::file_ops::validate_path_in_workspace;
use crate::tools::r#trait::Tool;

/// Tool for executing shell commands asynchronously with working directory restriction, timeout, and output capture.
pub struct RunCommandTool {
    workspace_root: PathBuf,
    default_timeout_secs: u64,
    allowed_commands: Vec<String>,
}

impl RunCommandTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            workspace_root,
            default_timeout_secs: 60,
            allowed_commands: Vec::new(),
        }
    }

    pub fn with_timeout(workspace_root: PathBuf, default_timeout_secs: u64) -> Self {
        Self {
            workspace_root,
            default_timeout_secs,
            allowed_commands: Vec::new(),
        }
    }

    pub fn with_allowed_commands(workspace_root: PathBuf, allowed_commands: Vec<String>) -> Self {
        Self {
            workspace_root,
            default_timeout_secs: 60,
            allowed_commands,
        }
    }
}

#[async_trait]
impl Tool for RunCommandTool {
    fn name(&self) -> &str {
        "run_command"
    }

    fn description(&self) -> &str {
        "Executes a shell command asynchronously within the workspace with output capture and timeout control."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command line to execute"
                },
                "cwd": {
                    "type": "string",
                    "description": "Working directory relative to workspace root (optional, defaults to workspace root)"
                },
                "timeout_secs": {
                    "type": "integer",
                    "description": "Execution timeout in seconds (optional, default 60)"
                }
            },
            "required": ["command"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let command_str = input["command"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required string parameter 'command'"))?;

        // Enforce allowed_commands whitelist if configured
        if !self.allowed_commands.is_empty() {
            let cmd_base = command_str.split_whitespace().next().unwrap_or("").to_lowercase();
            let is_allowed = self.allowed_commands.iter().any(|allowed| {
                let a = allowed.trim().to_lowercase();
                a == "*" || a == cmd_base || command_str.to_lowercase().starts_with(&a)
            });
            if !is_allowed {
                anyhow::bail!(
                    "Security policy violation: Command '{}' is not in the allowed commands whitelist ({:?})",
                    command_str,
                    self.allowed_commands
                );
            }
        }

        let cwd_str = input["cwd"].as_str();
        let timeout_secs = input["timeout_secs"]
            .as_u64()
            .unwrap_or(self.default_timeout_secs);

        let working_dir = match cwd_str {
            Some(dir) => validate_path_in_workspace(dir, &self.workspace_root)?,
            None => self.workspace_root.clone(),
        };

        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("powershell");
            c.args(["-NoProfile", "-Command", command_str]);
            c
        } else {
            let mut c = Command::new("sh");
            c.args(["-c", command_str]);
            c
        };

        cmd.current_dir(&working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let child = cmd
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn command '{}': {}", command_str, e))?;

        let duration = Duration::from_secs(timeout_secs);
        let output_res = timeout(duration, child.wait_with_output()).await;

        match output_res {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                let exit_code = output.status.code().unwrap_or(-1);

                let mut result = format!("Exit Code: {}\n", exit_code);
                if !stdout.is_empty() {
                    result.push_str("--- STDOUT ---\n");
                    result.push_str(&stdout);
                    if !stdout.ends_with('\n') {
                        result.push('\n');
                    }
                }
                if !stderr.is_empty() {
                    result.push_str("--- STDERR ---\n");
                    result.push_str(&stderr);
                    if !stderr.ends_with('\n') {
                        result.push('\n');
                    }
                }

                Ok(result)
            }
            Ok(Err(e)) => Err(anyhow!("Command execution error: {}", e)),
            Err(_) => Err(anyhow!(
                "Command execution timed out after {} seconds",
                timeout_secs
            )),
        }
    }
}
