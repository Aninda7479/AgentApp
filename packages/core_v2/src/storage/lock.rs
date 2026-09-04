use std::fs;
use std::path::PathBuf;
use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::settings::get_runtime_dir;

/// Staleness threshold in milliseconds: 90 seconds.
pub const STALE_MS: u64 = 90 * 1000;

/// On-disk record describing the live web-server process.
/// Coordinates single-instance binding of port 1469 across CLI, Desktop, and Daemon.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WebServerLock {
    /// PID of the web-server process that owns the port.
    pub pid: u32,
    /// Bound TCP port (e.g. 1469).
    pub port: u16,
    /// Bound interface (e.g. 0.0.0.0 or 127.0.0.1).
    pub host: String,
    /// Which surface spawned it: "cli" | "desktop" | "standalone" | "daemon".
    pub started_by: String,
    /// When the server first came up (ms epoch).
    pub started_at: u64,
    /// Last heartbeat (ms epoch); refreshed periodically by the server.
    pub heartbeat: u64,
}

impl WebServerLock {
    pub fn new(port: u16, host: &str, started_by: &str) -> Self {
        let now = chrono::Utc::now().timestamp_millis() as u64;
        Self {
            pid: std::process::id(),
            port,
            host: host.to_string(),
            started_by: started_by.to_string(),
            started_at: now,
            heartbeat: now,
        }
    }
}

/// Absolute path to the shared lock file: `<runtime_dir>/web-server.lock`.
pub fn get_web_server_lock_path() -> PathBuf {
    get_runtime_dir().join("web-server.lock")
}

/// Reads and parses the lock file, or returns None if absent/unreadable.
pub fn read_web_server_lock() -> Option<WebServerLock> {
    let p = get_web_server_lock_path();
    let raw = fs::read_to_string(p).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Writes (or overwrites) the lock file. Best-effort.
pub fn write_web_server_lock(record: &WebServerLock) -> Result<()> {
    let p = get_web_server_lock_path();
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(record)?;
    fs::write(p, json)?;
    Ok(())
}

/// Removes the lock file. Idempotent; never fails.
pub fn clear_web_server_lock() {
    let p = get_web_server_lock_path();
    let _ = fs::remove_file(p);
}

/// Whether a lock record represents a live server based on heartbeat staleness.
pub fn is_lock_alive(lock: &WebServerLock) -> bool {
    let now = chrono::Utc::now().timestamp_millis() as u64;
    now.saturating_sub(lock.heartbeat) < STALE_MS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lock_staleness() {
        let now = chrono::Utc::now().timestamp_millis() as u64;
        let mut lock = WebServerLock {
            pid: 12345,
            port: 1469,
            host: "127.0.0.1".to_string(),
            started_by: "daemon".to_string(),
            started_at: now - 100_000,
            heartbeat: now - 10_000, // 10s old -> alive
        };
        assert!(is_lock_alive(&lock));

        lock.heartbeat = now - 100_000; // 100s old -> stale
        assert!(!is_lock_alive(&lock));
    }
}
