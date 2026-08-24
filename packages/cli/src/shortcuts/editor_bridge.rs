use std::fs;
use std::path::PathBuf;
use std::process::Command;
use anyhow::Result;

pub struct EditorBridge {
    editor_cmd: String,
}

impl Default for EditorBridge {
    fn default() -> Self {
        Self::new()
    }
}

impl EditorBridge {
    pub fn new() -> Self {
        let cmd = std::env::var("VISUAL")
            .or_else(|_| std::env::var("EDITOR"))
            .unwrap_or_else(|_| {
                if cfg!(target_os = "windows") {
                    "notepad.exe".to_string()
                } else {
                    "vim".to_string()
                }
            });
        Self { editor_cmd: cmd }
    }

    pub fn with_editor(cmd: String) -> Self {
        Self { editor_cmd: cmd }
    }

    /// Creates a temporary file, opens the external editor synchronously,
    /// and reads back the edited content.
    pub fn open_editor(&self, initial_content: &str) -> Result<String> {
        let temp_dir = std::env::temp_dir();
        let file_name = format!("superagent_prompt_{}_{}.txt", std::process::id(), uuid::Uuid::new_v4());
        let temp_path: PathBuf = temp_dir.join(file_name);

        fs::write(&temp_path, initial_content)?;

        let parts: Vec<&str> = self.editor_cmd.split_whitespace().collect();
        let (binary, args) = if parts.is_empty() {
            if cfg!(target_os = "windows") {
                ("notepad.exe", vec![])
            } else {
                ("vim", vec![])
            }
        } else {
            (parts[0], parts[1..].to_vec())
        };

        let mut cmd = Command::new(binary);
        for arg in args {
            cmd.arg(arg);
        }
        cmd.arg(&temp_path);

        let status = cmd.status()?;
        if !status.success() {
            let _ = fs::remove_file(&temp_path);
            anyhow::bail!("Editor exited with non-zero status code");
        }

        let edited = fs::read_to_string(&temp_path)?;
        let _ = fs::remove_file(&temp_path);
        Ok(edited)
    }
}
