use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::json;
use tokio::sync::mpsc::{channel, Receiver};

use rand::Rng;

use crate::providers::LlmProvider;
use crate::types::{AgentEvent, ChatMessage, ContentBlock, ModelConfig, Role};

/// OpenCode Zen default base URL
pub const DEFAULT_OPENCODE_BASE_URL: &str = "https://opencode.ai/zen/v1";

/// Verified live-working free models hosted on OpenCode Zen
pub const OPENCODE_FREE_MODELS: &[&str] = &[
    "big-pickle",
    "mimo-v2.5-free",
    "nemotron-3-ultra-free",
    "nemotron-3.5-lightning-free",
    "ling-3.0-flash-fin-free",
];

const BASE62_CHARS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/// Generate a canonical OpenCode session ID: `ses_` + 12 lowercase hex + 14 Base62 chars (total 30 chars)
pub fn generate_opencode_session_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let hex_part = format!("{:012x}", timestamp_ms & 0xffff_ffff_ffff);
    let mut rng = rand::thread_rng();
    let mut base62_part = String::with_capacity(14);
    for _ in 0..14 {
        let idx = rng.gen_range(0..62);
        base62_part.push(BASE62_CHARS[idx] as char);
    }
    format!("ses_{}{}", hex_part, base62_part)
}

/// Generate a canonical OpenCode request ID: `msg_` + 12 lowercase hex + 14 Base62 chars (total 30 chars)
pub fn generate_opencode_request_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let hex_part = format!("{:012x}", timestamp_ms & 0xffff_ffff_ffff);
    let mut rng = rand::thread_rng();
    let mut base62_part = String::with_capacity(14);
    for _ in 0..14 {
        let idx = rng.gen_range(0..62);
        base62_part.push(BASE62_CHARS[idx] as char);
    }
    format!("msg_{}{}", hex_part, base62_part)
}

/// Standalone OpenCode provider implementing `LlmProvider`.
/// All OpenCode Zen specific headers, session affinity, and streaming logic
/// are self-contained in this single file for zero-friction future removal.
pub struct OpenCodeProvider {
    client: Client,
}

impl Default for OpenCodeProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl OpenCodeProvider {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .connect_timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { client }
    }

    /// Returns the engine directory for local OpenCode binaries: `~/.superagent/engines/opencode`
    pub fn get_opencode_engine_dir() -> std::path::PathBuf {
        crate::storage::settings::get_superagent_dir()
            .join("engines")
            .join("opencode")
    }

    /// Returns the platform-specific executable name
    pub fn get_opencode_binary_name() -> &'static str {
        if cfg!(target_os = "windows") {
            "opencode.exe"
        } else {
            "opencode"
        }
    }

    /// Locates an existing OpenCode binary across supported candidate directories and PATH
    pub fn find_opencode_binary() -> Option<std::path::PathBuf> {
        let exe_name = Self::get_opencode_binary_name();

        // 1. Check SuperAgent engines directory: ~/.superagent/engines/opencode/<exe>
        let engine_exe = Self::get_opencode_engine_dir().join(exe_name);
        if engine_exe.exists() {
            return Some(engine_exe);
        }

        // 2. Check SuperAgent root & bin: ~/.superagent/<exe> and ~/.superagent/bin/<exe>
        let superagent_dir = crate::storage::settings::get_superagent_dir();
        let superagent_root_exe = superagent_dir.join(exe_name);
        if superagent_root_exe.exists() {
            return Some(superagent_root_exe);
        }
        let superagent_bin_exe = superagent_dir.join("bin").join(exe_name);
        if superagent_bin_exe.exists() {
            return Some(superagent_bin_exe);
        }

        // 3. Check Windows AppData on Windows
        #[cfg(target_os = "windows")]
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let windows_apps_exe = std::path::PathBuf::from(&userprofile)
                .join("AppData\\Local\\Microsoft\\WindowsApps")
                .join(exe_name);
            if windows_apps_exe.exists() {
                return Some(windows_apps_exe);
            }
        }

        // 4. Check if available on system PATH
        #[cfg(target_os = "windows")]
        let check_cmd = std::process::Command::new("where").arg(exe_name).output();
        #[cfg(not(target_os = "windows"))]
        let check_cmd = std::process::Command::new("which").arg(exe_name).output();

        if let Ok(output) = check_cmd {
            if output.status.success() {
                let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if let Some(first_line) = out_str.lines().next() {
                    let p = std::path::PathBuf::from(first_line.trim());
                    if p.exists() {
                        return Some(p);
                    }
                }
                return Some(std::path::PathBuf::from(exe_name));
            }
        }

        None
    }

    /// Automatically downloads and provisions the official standalone OpenCode engine
    /// from upstream GitHub releases into `~/.superagent/engines/opencode`.
    pub async fn auto_provision_opencode(client: &Client) -> anyhow::Result<std::path::PathBuf> {
        let asset_name = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("windows", "x86_64") => "opencode-windows-x64.zip",
            ("windows", "aarch64") => "opencode-windows-arm64.zip",
            ("macos", "aarch64") => "opencode-darwin-arm64.zip",
            ("macos", "x86_64") => "opencode-darwin-x64.zip",
            ("linux", "x86_64") => "opencode-linux-x64.zip",
            ("linux", "aarch64") => "opencode-linux-arm64.zip",
            (os, arch) => anyhow::bail!(
                "Unsupported operating system or architecture for automatic OpenCode provisioning: {}/{}. \
                 Please install OpenCode manually (see https://opencode.ai).",
                os, arch
            ),
        };

        let download_url = format!(
            "https://github.com/anomalyco/opencode/releases/latest/download/{}",
            asset_name
        );

        tracing::info!(
            "Auto-provisioning OpenCode engine from {} for free Zen models...",
            download_url
        );

        let target_dir = Self::get_opencode_engine_dir();
        if !target_dir.exists() {
            std::fs::create_dir_all(&target_dir)?;
        }

        let resp = client
            .get(&download_url)
            .header("User-Agent", "SuperAgent-Core/1.0")
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to download OpenCode binary archive: {}", e))?;

        if !resp.status().is_success() {
            anyhow::bail!(
                "Failed to download OpenCode binary archive from {}: HTTP status {}",
                download_url,
                resp.status()
            );
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to read OpenCode archive bytes: {}", e))?;

        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| anyhow::anyhow!("Failed to open OpenCode zip archive: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i)?;
            let outpath = match file.enclosed_name() {
                Some(p) => target_dir.join(p),
                None => continue,
            };

            if file.is_dir() {
                std::fs::create_dir_all(&outpath)?;
            } else {
                if let Some(parent) = outpath.parent() {
                    if !parent.exists() {
                        std::fs::create_dir_all(parent)?;
                    }
                }
                let mut outfile = std::fs::File::create(&outpath)?;
                std::io::copy(&mut file, &mut outfile)?;
            }

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mode = file.unix_mode().unwrap_or(0o755);
                let _ = std::fs::set_permissions(&outpath, std::fs::Permissions::from_mode(mode));
            }
        }

        let binary_path = target_dir.join(Self::get_opencode_binary_name());
        if !binary_path.exists() {
            anyhow::bail!(
                "OpenCode extraction finished but binary was not found at expected path: {}",
                binary_path.display()
            );
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&binary_path, std::fs::Permissions::from_mode(0o755));
        }

        tracing::info!(
            "Successfully auto-provisioned OpenCode engine at {}",
            binary_path.display()
        );

        Ok(binary_path)
    }

    /// Ensures that the local `opencode serve` daemon is running and reachable.
    /// If not responding, automatically locates or provisions the binary and spawns it on port 4096.
    pub async fn ensure_opencode_server(client: &Client) -> anyhow::Result<String> {
        let port = std::env::var("OPENCODE_PORT").unwrap_or_else(|_| "4096".to_string());
        let base_url = format!("http://127.0.0.1:{}", port);
        let check_url = format!("{}/session", base_url);

        // 1. Quick check if already responding
        if let Ok(res) = client
            .get(&check_url)
            .timeout(std::time::Duration::from_millis(800))
            .send()
            .await
        {
            if res.status().is_success() {
                return Ok(base_url);
            }
        }

        // 2. Find binary or automatically provision it on demand (Zero-Install workflow)
        let binary_path = match Self::find_opencode_binary() {
            Some(path) => path,
            None => {
                tracing::info!(
                    "OpenCode CLI binary not found on system. Starting zero-install auto-provisioning..."
                );
                Self::auto_provision_opencode(client).await?
            }
        };

        // 3. Spawn opencode serve headless
        tracing::info!(
            "Starting OpenCode server on port {} using binary: {}",
            port,
            binary_path.display()
        );

        let mut child = std::process::Command::new(&binary_path);
        child.args(["serve", "--port", &port, "--hostname", "127.0.0.1"]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            child.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        match child.spawn() {
            Ok(_) => {
                // Wait up to 6s for server to initialize
                for _ in 0..30 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                    if let Ok(res) = client.get(&check_url).send().await {
                        if res.status().is_success() {
                            tracing::info!("OpenCode server successfully booted on {}", base_url);
                            return Ok(base_url);
                        }
                    }
                }
                anyhow::bail!(
                    "OpenCode server was spawned on port {} but did not become ready within 6 seconds. Check if port {} is occupied.",
                    port, port
                );
            }
            Err(e) => {
                anyhow::bail!(
                    "Failed to start OpenCode server using binary '{}': {}. \
                     To use OpenCode models (such as big-pickle), ensure port {} is free.",
                    binary_path.display(),
                    e,
                    port
                );
            }
        }
    }

    #[allow(dead_code)]
    fn format_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
        let mut formatted = Vec::new();
        for msg in messages {
            match msg.role {
                Role::System => {
                    formatted.push(json!({
                        "role": "system",
                        "content": msg.text_content()
                    }));
                }
                Role::User => {
                    let mut parts = Vec::new();
                    for block in &msg.content {
                        match block {
                            ContentBlock::Text { text } => {
                                parts.push(json!({
                                    "type": "text",
                                    "text": text
                                }));
                            }
                            ContentBlock::Image { media_type, data } => {
                                let url = if data.starts_with("data:") {
                                    data.clone()
                                } else {
                                    format!("data:{};base64,{}", media_type, data)
                                };
                                parts.push(json!({
                                    "type": "image_url",
                                    "image_url": {
                                        "url": url
                                    }
                                }));
                            }
                            _ => {}
                        }
                    }
                    if parts.len() == 1
                        && parts[0].get("type").and_then(|v| v.as_str()) == Some("text")
                    {
                        formatted.push(json!({
                            "role": "user",
                            "content": parts[0]["text"]
                        }));
                    } else if !parts.is_empty() {
                        formatted.push(json!({
                            "role": "user",
                            "content": parts
                        }));
                    } else {
                        formatted.push(json!({
                            "role": "user",
                            "content": msg.text_content()
                        }));
                    }
                }
                Role::Assistant => {
                    let mut tool_calls = Vec::new();
                    let mut text_parts = Vec::new();
                    for block in &msg.content {
                        match block {
                            ContentBlock::Text { text } => text_parts.push(text.clone()),
                            ContentBlock::ToolUse { id, name, input } => {
                                tool_calls.push(json!({
                                    "id": id,
                                    "type": "function",
                                    "function": {
                                        "name": name,
                                        "arguments": input.to_string()
                                    }
                                }));
                            }
                            _ => {}
                        }
                    }
                    let mut assistant_obj = serde_json::Map::new();
                    assistant_obj.insert("role".to_string(), json!("assistant"));
                    if !text_parts.is_empty() {
                        assistant_obj.insert("content".to_string(), json!(text_parts.join("")));
                    } else if tool_calls.is_empty() {
                        assistant_obj.insert("content".to_string(), json!(""));
                    }
                    if !tool_calls.is_empty() {
                        assistant_obj.insert("tool_calls".to_string(), json!(tool_calls));
                    }
                    formatted.push(serde_json::Value::Object(assistant_obj));
                }
                Role::Tool => {
                    for block in &msg.content {
                        if let ContentBlock::ToolResult {
                            tool_use_id,
                            content,
                            is_error: _,
                        } = block
                        {
                            formatted.push(json!({
                                "role": "tool",
                                "tool_call_id": tool_use_id,
                                "content": content
                            }));
                        }
                    }
                }
            }
        }
        formatted
    }
}

#[async_trait]
impl LlmProvider for OpenCodeProvider {
    async fn chat_stream(
        &self,
        config: &ModelConfig,
        messages: &[ChatMessage],
        tools: &[serde_json::Value],
    ) -> anyhow::Result<Receiver<AgentEvent>> {
        // Route through local opencode serve daemon to ensure valid Zen credentials and avoid 403 errors
        let server_base = Self::ensure_opencode_server(&self.client).await?;

        // Create a dedicated session for this execution
        let session_create_url = format!("{}/session", server_base);
        let s_res = self
            .client
            .post(&session_create_url)
            .json(&json!({ "title": "SuperAgent Execution" }))
            .send()
            .await;

        let session_id = if let Ok(resp) = s_res {
            if let Ok(v) = resp.json::<serde_json::Value>().await {
                v.get("id")
                    .and_then(|id| id.as_str())
                    .unwrap_or("")
                    .to_string()
            } else {
                generate_opencode_session_id()
            }
        } else {
            generate_opencode_session_id()
        };

        // Construct system prompt and tools guide
        let mut system_text = String::new();
        let mut prompt_lines = Vec::new();

        for msg in messages {
            match msg.role {
                Role::System => {
                    if !system_text.is_empty() {
                        system_text.push('\n');
                    }
                    system_text.push_str(&msg.text_content());
                }
                Role::User => {
                    prompt_lines.push(msg.text_content());
                }
                Role::Assistant => {
                    prompt_lines.push(format!("[Assistant]: {}", msg.text_content()));
                }
                Role::Tool => {
                    for block in &msg.content {
                        if let ContentBlock::ToolResult {
                            tool_use_id,
                            content,
                            ..
                        } = block
                        {
                            prompt_lines
                                .push(format!("[Tool Result for {}]: {}", tool_use_id, content));
                        }
                    }
                }
            }
        }

        if !tools.is_empty() {
            let mut tools_guide =
                String::from("\n\nYou have access to the following execution tools:\n");
            for t in tools {
                let name = t
                    .get("name")
                    .or_else(|| t.get("function").and_then(|f| f.get("name")))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let desc = t
                    .get("description")
                    .or_else(|| t.get("function").and_then(|f| f.get("description")))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let params = t
                    .get("parameters")
                    .or_else(|| t.get("function").and_then(|f| f.get("parameters")))
                    .map(|p| p.to_string())
                    .unwrap_or_default();
                tools_guide.push_str(&format!("- {}({}): {}\n", name, params, desc));
            }
            tools_guide.push_str(
                "\nWhen you need to execute a tool, respond with a tool call in format:\n<｜DSML｜tool_calls>\n<｜DSML｜invoke name=\"tool_name\">\n<｜DSML｜parameter name=\"param_name\">value</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜tool_calls>\n"
            );
            system_text.push_str(&tools_guide);
        }

        let user_prompt = if prompt_lines.len() == 1 {
            prompt_lines.remove(0)
        } else {
            prompt_lines.join("\n\n")
        };

        let (tx, rx) = channel(100);

        let event_url = format!("{}/event", server_base);
        let msg_url = format!("{}/session/{}/message", server_base, session_id);
        let client_clone = self.client.clone();
        let target_session_id = session_id.clone();
        let model_id = config.model_id.clone();

        tokio::spawn(async move {
            use std::sync::atomic::{AtomicBool, Ordering};
            use std::sync::Arc;

            let streamed_any = Arc::new(AtomicBool::new(false));
            let streamed_any_clone = streamed_any.clone();
            let is_idle = Arc::new(AtomicBool::new(false));
            let is_idle_clone = is_idle.clone();

            // Subscribe to SSE events for live token streaming
            let sse_tx = tx.clone();
            let sse_sess_id = target_session_id.clone();
            let sse_client = client_clone.clone();

            let sse_task = tokio::spawn(async move {
                if let Ok(res) = sse_client.get(&event_url).send().await {
                    let mut stream = res.bytes_stream();
                    let mut buffer = String::new();
                    while let Some(item) = stream.next().await {
                        let bytes = match item {
                            Ok(b) => b,
                            Err(_) => break,
                        };
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        while let Some(pos) = buffer.find('\n') {
                            let line = buffer[..pos].trim_end_matches('\r').trim().to_string();
                            buffer.drain(..=pos);
                            if let Some(data_str) = line.strip_prefix("data: ") {
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(data_str)
                                {
                                    let msg_type =
                                        val.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                    let props = val.get("properties");
                                    let sid = props
                                        .and_then(|p| p.get("sessionID"))
                                        .and_then(|s| s.as_str())
                                        .unwrap_or("");

                                    if sid == sse_sess_id {
                                        if msg_type == "session.idle" {
                                            is_idle_clone.store(true, Ordering::Relaxed);
                                            return;
                                        }

                                        if msg_type == "message.part.delta" {
                                            if let Some(props) = props {
                                                let field = props
                                                    .get("field")
                                                    .and_then(|f| f.as_str())
                                                    .unwrap_or("");
                                                if field == "text" || field == "reasoning" {
                                                    if let Some(delta) =
                                                        props.get("delta").and_then(|d| d.as_str())
                                                    {
                                                        streamed_any_clone
                                                            .store(true, Ordering::Relaxed);
                                                        if sse_tx
                                                            .send(AgentEvent::Token {
                                                                text: delta.to_string(),
                                                            })
                                                            .await
                                                            .is_err()
                                                        {
                                                            return;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            // Post the message to opencode serve
            let payload = json!({
                "model": {
                    "providerID": "opencode",
                    "modelID": model_id
                },
                "system": system_text,
                "parts": [
                    { "type": "text", "text": user_prompt }
                ]
            });

            let post_res = client_clone.post(&msg_url).json(&payload).send().await;
            let resp_json: Option<serde_json::Value> = match post_res {
                Ok(resp) if resp.status().is_success() => {
                    resp.json::<serde_json::Value>().await.ok()
                }
                Ok(resp) => {
                    let err_text = resp.text().await.unwrap_or_default();
                    let _ = tx
                        .send(AgentEvent::Error {
                            message: format!("OpenCode server rejected message: {}", err_text),
                        })
                        .await;
                    let _ = tx
                        .send(AgentEvent::Finished {
                            stop_reason: "error".to_string(),
                        })
                        .await;
                    return;
                }
                Err(err) => {
                    let _ = tx
                        .send(AgentEvent::Error {
                            message: format!("Failed to send message to OpenCode server: {}", err),
                        })
                        .await;
                    let _ = tx
                        .send(AgentEvent::Finished {
                            stop_reason: "error".to_string(),
                        })
                        .await;
                    return;
                }
            };

            // Allow any in-flight SSE tokens to flush
            tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
            sse_task.abort();

            // If SSE did not stream tokens, emit the complete text from post response
            if !streamed_any.load(Ordering::Relaxed) {
                if let Some(json_val) = resp_json {
                    if let Some(parts) = json_val.get("parts").and_then(|p| p.as_array()) {
                        for p in parts {
                            if p.get("type").and_then(|t| t.as_str()) == Some("text") {
                                if let Some(t) = p.get("text").and_then(|txt| txt.as_str()) {
                                    if !t.is_empty() {
                                        let _ = tx
                                            .send(AgentEvent::Token {
                                                text: t.to_string(),
                                            })
                                            .await;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let _ = tx
                .send(AgentEvent::Finished {
                    stop_reason: "stop".to_string(),
                })
                .await;
        });

        Ok(rx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opencode_provider_creation() {
        let provider = OpenCodeProvider::new();
        assert!(provider
            .client
            .get("https://opencode.ai/zen/v1")
            .build()
            .is_ok());
    }

    #[test]
    fn test_opencode_free_models_list() {
        assert!(OPENCODE_FREE_MODELS.contains(&"big-pickle"));
        assert!(OPENCODE_FREE_MODELS.contains(&"mimo-v2.5-free"));
        assert!(OPENCODE_FREE_MODELS.contains(&"nemotron-3-ultra-free"));
    }

    #[test]
    fn test_canonical_session_generation() {
        let session = generate_opencode_session_id();
        assert!(session.starts_with("ses_"));
        assert_eq!(session.len(), 30);

        let request = generate_opencode_request_id();
        assert!(request.starts_with("msg_"));
        assert_eq!(request.len(), 30);
    }

    #[test]
    fn test_find_opencode_binary() {
        let binary_name = OpenCodeProvider::get_opencode_binary_name();
        assert!(binary_name == "opencode.exe" || binary_name == "opencode");
        let engine_dir = OpenCodeProvider::get_opencode_engine_dir();
        assert!(
            engine_dir.ends_with("engines\\opencode") || engine_dir.ends_with("engines/opencode")
        );
    }
}
