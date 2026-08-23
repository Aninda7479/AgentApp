use anyhow::Result;


#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AutostartTarget {
    Desktop,
    Cli,
}

pub struct AutostartManager;

impl AutostartManager {
    const REG_KEY: &'static str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    const APP_NAME_DESKTOP: &'static str = "SuperAgentDesktop";
    const APP_NAME_CLI: &'static str = "SuperAgentServe";

    /// Checks whether autostart is enabled in the host operating system.
    pub async fn is_enabled(target: AutostartTarget) -> bool {
        #[cfg(target_os = "windows")]
        {
            let app_name = match target {
                AutostartTarget::Desktop => Self::APP_NAME_DESKTOP,
                AutostartTarget::Cli => Self::APP_NAME_CLI,
            };

            let output = tokio::process::Command::new("reg")
                .args(["query", Self::REG_KEY, "/v", app_name])
                .output()
                .await;

            if let Ok(out) = output {
                let stdout = String::from_utf8_lossy(&out.stdout);
                return stdout.contains(app_name);
            }
            false
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = target;
            false
        }
    }

    /// Enables system autostart for the specified binary executable.
    pub async fn enable(target: AutostartTarget, exec_path: &str) -> Result<()> {
        #[cfg(target_os = "windows")]
        {
            let app_name = match target {
                AutostartTarget::Desktop => Self::APP_NAME_DESKTOP,
                AutostartTarget::Cli => Self::APP_NAME_CLI,
            };

            let status = tokio::process::Command::new("reg")
                .args(["add", Self::REG_KEY, "/v", app_name, "/t", "REG_SZ", "/d", exec_path, "/f"])
                .status()
                .await?;

            if !status.success() {
                anyhow::bail!("Failed to write autostart entry to Windows Registry");
            }
            Ok(())
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = (target, exec_path);
            Ok(())
        }
    }

    /// Disables system autostart.
    pub async fn disable(target: AutostartTarget) -> Result<()> {
        #[cfg(target_os = "windows")]
        {
            let app_name = match target {
                AutostartTarget::Desktop => Self::APP_NAME_DESKTOP,
                AutostartTarget::Cli => Self::APP_NAME_CLI,
            };

            let _ = tokio::process::Command::new("reg")
                .args(["delete", Self::REG_KEY, "/v", app_name, "/f"])
                .status()
                .await;

            Ok(())
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = target;
            Ok(())
        }
    }
}
