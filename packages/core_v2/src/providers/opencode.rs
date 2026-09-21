use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::json;
use std::collections::HashMap;
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
    "jev-1.13-free",
    "deepseek-v4-flash-free",
    "muse-spark-1.3-contributor-free",
    "muse-spark-1.2-contributor-free",
];

/// Official OpenCode tool names recognized and whitelisted by OpenCode Zen's API gateway.
/// Sourced from upstream anomalyco/opencode `packages/opencode/src/tool/registry.ts`.
pub const OPENCODE_OFFICIAL_TOOLS: &[&str] = &[
    "bash",
    "read",
    "write",
    "edit",
    "glob",
    "grep",
    "lsp",
    "task",
    "question",
    "todo",
    "plan",
    "webfetch",
    "websearch",
    "patch",
    "apply_patch",
    "skill",
];

/// Returns whether a given model identifier belongs to OpenCode's free tier.
pub fn is_free_opencode_model(model_id: &str) -> bool {
    model_id.ends_with("-free") || OPENCODE_FREE_MODELS.contains(&model_id)
}

/// Returns the official 16 OpenCode tools declared in the OpenAI function format with rich parameter schemas.
pub fn get_official_opencode_tools() -> Vec<serde_json::Value> {
    OPENCODE_OFFICIAL_TOOLS
        .iter()
        .map(|name| {
            let (desc, schema) = match *name {
                "bash" => (
                    "Execute a bash or shell command in the system terminal",
                    json!({
                        "type": "object",
                        "properties": {
                            "command": { "type": "string", "description": "Command line to execute" }
                        },
                        "required": ["command"]
                    }),
                ),
                "read" => (
                    "Read the contents of a file from the workspace",
                    json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Path to the file to read" }
                        },
                        "required": ["path"]
                    }),
                ),
                "write" => (
                    "Write or overwrite content to a file",
                    json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Path to file to write" },
                            "content": { "type": "string", "description": "Content to write" }
                        },
                        "required": ["path", "content"]
                    }),
                ),
                "edit" => (
                    "Perform exact search-and-replace edits on a file",
                    json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Path to file to edit" },
                            "target_content": { "type": "string", "description": "Exact text to replace" },
                            "replacement_content": { "type": "string", "description": "Replacement text" }
                        },
                        "required": ["path", "target_content", "replacement_content"]
                    }),
                ),
                "glob" => (
                    "Find files matching a glob pattern",
                    json!({
                        "type": "object",
                        "properties": {
                            "pattern": { "type": "string", "description": "Glob pattern (e.g. **/*.rs)" }
                        },
                        "required": ["pattern"]
                    }),
                ),
                "grep" => (
                    "Search for text patterns across files in directory",
                    json!({
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "Search pattern or regex" }
                        },
                        "required": ["query"]
                    }),
                ),
                "lsp" => (
                    "Execute language server queries (diagnostics, definitions)",
                    json!({
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "LSP query term" }
                        }
                    }),
                ),
                "task" => (
                    "Spawn or manage background subtasks and workflows",
                    json!({
                        "type": "object",
                        "properties": {
                            "prompt": { "type": "string", "description": "Subagent prompt or task description" }
                        },
                        "required": ["prompt"]
                    }),
                ),
                "question" => (
                    "Ask the user one or more questions, clarification prompts, or quiz items",
                    json!({
                        "type": "object",
                        "properties": {
                            "question": { "type": "string", "description": "Single question text" },
                            "questions": {
                                "type": "array",
                                "description": "Array of question objects for multi-question surveys or quizzes",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "header": { "type": "string", "description": "Category or header" },
                                        "question": { "type": "string", "description": "Question text" },
                                        "options": {
                                            "type": "array",
                                            "description": "Selectable choices",
                                            "items": {
                                                "oneOf": [
                                                    { "type": "string" },
                                                    {
                                                        "type": "object",
                                                        "properties": {
                                                            "label": { "type": "string" },
                                                            "description": { "type": "string" }
                                                        },
                                                        "required": ["label"]
                                                    }
                                                ]
                                            }
                                        },
                                        "is_multi_select": { "type": "boolean" }
                                    },
                                    "required": ["question"]
                                }
                            },
                            "options": {
                                "type": "array",
                                "description": "Selectable choices for a single question",
                                "items": { "type": "string" }
                            }
                        }
                    }),
                ),
                "todo" => (
                    "Manage checklist and todo items for current session across multi-step tasks",
                    json!({
                        "type": "object",
                        "properties": {
                            "action": { "type": "string", "enum": ["add", "update", "list", "clear"] },
                            "task": { "type": "string", "description": "Task description" },
                            "items": { "type": "array", "items": { "type": "string" }, "description": "Batch tasks" },
                            "id": { "type": "integer", "description": "Task id to update" },
                            "status": { "type": "string", "enum": ["pending", "in_progress", "completed", "cancelled"] }
                        }
                    }),
                ),
                "plan" => (
                    "Create or update active execution roadmap and milestone steps ('a plan to go')",
                    json!({
                        "type": "object",
                        "properties": {
                            "action": { "type": "string", "enum": ["create", "update", "get", "clear"] },
                            "title": { "type": "string", "description": "Goal or plan title" },
                            "steps": { "type": "array", "items": { "type": "string" }, "description": "Sequential steps" },
                            "step_id": { "type": "integer", "description": "Step index to update" },
                            "status": { "type": "string", "enum": ["pending", "in_progress", "completed", "failed"] }
                        }
                    }),
                ),
                "webfetch" => (
                    "Fetch webpage content from a given URL",
                    json!({
                        "type": "object",
                        "properties": {
                            "url": { "type": "string", "description": "URL to fetch" }
                        },
                        "required": ["url"]
                    }),
                ),
                "websearch" => (
                    "Perform a web search query for information",
                    json!({
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "Search query" }
                        },
                        "required": ["query"]
                    }),
                ),
                "patch" => (
                    "Generate unified diff patch for file modifications",
                    json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "File path" }
                        }
                    }),
                ),
                "apply_patch" => (
                    "Apply unified diff patch to workspace files",
                    json!({
                        "type": "object",
                        "properties": {
                            "patch": { "type": "string", "description": "Diff patch text" }
                        }
                    }),
                ),
                "skill" => (
                    "Load and execute specialized agent skill instructions",
                    json!({
                        "type": "object",
                        "properties": {
                            "action": { "type": "string", "enum": ["list", "load"] },
                            "name": { "type": "string", "description": "Skill name or id to load" }
                        }
                    }),
                ),
                _ => ("OpenCode built-in tool", json!({ "type": "object", "properties": {} })),
            };

            json!({
                "type": "function",
                "function": {
                    "name": name,
                    "description": desc,
                    "parameters": schema,
                }
            })
        })
        .collect()
}

/// Prepares tools for OpenCode Zen free tier requests.
/// Upstream validates declared tool names against its official whitelist.
/// If tools are empty, injects the official 16 tools.
/// If tools are provided, maps known SuperAgent tool names to official OpenCode equivalents.
pub fn prepare_opencode_free_tier_tools(tools: &[serde_json::Value]) -> Vec<serde_json::Value> {
    if tools.is_empty() {
        return get_official_opencode_tools();
    }

    let mut prepared = Vec::new();
    let mut seen_names = std::collections::HashSet::new();

    for tool in tools {
        let original_name = tool
            .get("name")
            .or_else(|| tool.get("function").and_then(|f| f.get("name")))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let mapped_name = match original_name {
            "run_command" | "terminal" | "shell" | "bash" => "bash",
            "read_file" | "view_file" | "read" => "read",
            "write_to_file" | "write_file" | "write" => "write",
            "replace_file_content" | "edit_file" | "edit" => "edit",
            "find_by_name" | "find_files" | "glob" => "glob",
            "grep_search" | "search_files" | "grep" => "grep",
            "browser_navigate" | "read_url_content" | "fetch_web" | "webfetch" => "webfetch",
            "web_search" | "search_web" | "websearch" => "websearch",
            "ask_question" | "question" => "question",
            "run_subagent" | "invoke_subagent" | "manage_task" | "task" => "task",
            "skill" | "load_skill" => "skill",
            "plan" | "roadmap" => "plan",
            "todo" | "todowrite" => "todo",
            other if OPENCODE_OFFICIAL_TOOLS.contains(&other) => other,
            _ => continue, // Do not map non-whitelisted tools (e.g. create_artifact_app, generate_pdf) to avoid 403 FreeTierError and schema corruption
        };

        if seen_names.insert(mapped_name) {
            let t = if mapped_name == "task" {
                json!({
                    "type": "function",
                    "function": {
                        "name": "task",
                        "description": "Spawn or manage background subtasks and workflows",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "prompt": { "type": "string", "description": "Subagent prompt or task description" }
                            },
                            "required": ["prompt"]
                        }
                    }
                })
            } else if mapped_name == "question" {
                json!({
                    "type": "function",
                    "function": {
                        "name": "question",
                        "description": "Ask the user one or more questions, clarification prompts, or quiz items",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "question": { "type": "string", "description": "Single question text" },
                                "questions": {
                                    "type": "array",
                                    "description": "Array of question objects for multi-question surveys or quizzes",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "header": { "type": "string", "description": "Category or header" },
                                            "question": { "type": "string", "description": "Question text" },
                                            "options": {
                                                "type": "array",
                                                "description": "Selectable choices",
                                                "items": {
                                                    "oneOf": [
                                                        { "type": "string" },
                                                        {
                                                            "type": "object",
                                                            "properties": {
                                                                "label": { "type": "string" },
                                                                "description": { "type": "string" }
                                                            },
                                                            "required": ["label"]
                                                        }
                                                    ]
                                                }
                                            },
                                            "is_multi_select": { "type": "boolean" }
                                        },
                                        "required": ["question"]
                                    }
                                },
                                "options": {
                                    "type": "array",
                                    "description": "Selectable choices for a single question",
                                    "items": { "type": "string" }
                                }
                            }
                        }
                    }
                })
            } else {
                let mut base = tool.clone();
                if let Some(f) = base.get_mut("function") {
                    f["name"] = json!(mapped_name);
                } else if base.get("type").and_then(|tp| tp.as_str()) == Some("function") {
                    base["name"] = json!(mapped_name);
                } else {
                    base = json!({
                        "type": "function",
                        "function": {
                            "name": mapped_name,
                            "description": tool.get("description").unwrap_or(&json!("OpenCode tool")),
                            "parameters": tool.get("parameters").unwrap_or(&json!({"type": "object", "properties": {}}))
                        }
                    });
                }
                base
            };
            prepared.push(t);
        }
    }

    if prepared.is_empty() {
        get_official_opencode_tools()
    } else {
        prepared
    }
}

/// Translates tool names emitted by OpenCode directly to SuperAgent's internal canonical tool registry.
pub fn map_opencode_tool_name_to_superagent(raw_name: &str) -> String {
    match raw_name {
        "telegram_telegram" => "telegram".to_string(),
        "bash" => "run_command".to_string(),
        "read" => "read_file".to_string(),
        "write" => "write_file".to_string(),
        "edit" => "edit_file".to_string(),
        "glob" => "glob".to_string(),
        "grep" => "grep_search".to_string(),
        "webfetch" => "browser_navigate".to_string(),
        "websearch" => "web_search".to_string(),
        "task" => "run_subagent".to_string(),
        "skill" => "skill".to_string(),
        "plan" => "plan".to_string(),
        "todo" => "todo".to_string(),
        "question" => "question".to_string(),
        "ask_question" => "question".to_string(),
        // Antigravity & legacy aliases
        "view_file" => "read_file".to_string(),
        "write_to_file" => "write_file".to_string(),
        "replace_file_content" => "edit_file".to_string(),
        "find_by_name" => "glob".to_string(),
        "read_url_content" => "browser_navigate".to_string(),
        "search_web" => "web_search".to_string(),
        "invoke_subagent" => "run_subagent".to_string(),
        _ => raw_name.to_string(),
    }
}

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
            .timeout(std::time::Duration::from_secs(45))
            .connect_timeout(std::time::Duration::from_secs(8))
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

    /// Finds an available local TCP port, starting with `default_port` and falling back to next available port.
    pub fn find_available_port(default_port: u16) -> u16 {
        if std::net::TcpListener::bind(("127.0.0.1", default_port)).is_ok() {
            return default_port;
        }
        for p in (default_port + 1)..=(default_port + 20) {
            if std::net::TcpListener::bind(("127.0.0.1", p)).is_ok() {
                return p;
            }
        }
        if let Ok(listener) = std::net::TcpListener::bind(("127.0.0.1", 0)) {
            if let Ok(addr) = listener.local_addr() {
                return addr.port();
            }
        }
        default_port
    }

    /// Ensures that the telegram MCP tool is dynamically registered on the OpenCode server
    pub async fn ensure_mcp_registered(client: &Client, base_url: &str) {
        let mcp_url = format!("{}/mcp", base_url);
        if let Ok(res) = client.get(&mcp_url).send().await {
            if let Ok(mcp_val) = res.json::<serde_json::Value>().await {
                if mcp_val.get("telegram").is_none() {
                    let sa_dir = crate::storage::settings::get_superagent_dir();
                    let root_mcp = sa_dir.join("telegram-mcp.js");
                    let user_bin = sa_dir.join("bin").join("telegram-mcp.js");
                    let node_bin = std::env::current_dir()
                        .unwrap_or_default()
                        .join("node_modules")
                        .join(".bin")
                        .join("telegram-mcp.js");
                    let fallback_bin = std::path::PathBuf::from(
                        "C:\\ProgramData\\SuperAgent\\bin\\telegram-mcp.js",
                    );

                    let resolved_path = if root_mcp.exists() {
                        root_mcp
                    } else if user_bin.exists() {
                        user_bin
                    } else if node_bin.exists() {
                        node_bin
                    } else if fallback_bin.exists() {
                        fallback_bin
                    } else {
                        root_mcp
                    };

                    let _ = client
                        .post(&mcp_url)
                        .json(&json!({
                            "name": "telegram",
                            "config": {
                                "type": "local",
                                "command": ["node", resolved_path.to_string_lossy()],
                                "enabled": true
                            }
                        }))
                        .send()
                        .await;
                }
            }
        }
    }

    /// Ensures that the local `opencode serve` daemon is running and reachable.
    /// If not responding, automatically locates or provisions the binary and spawns it on an available port.
    pub async fn ensure_opencode_server(client: &Client) -> anyhow::Result<String> {
        let requested_port = std::env::var("OPENCODE_PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(4096);

        let base_url = format!("http://127.0.0.1:{}", requested_port);
        let check_url = format!("{}/session", base_url);

        // 1. Quick check if already responding on requested port
        if let Ok(res) = client
            .get(&check_url)
            .timeout(std::time::Duration::from_millis(800))
            .send()
            .await
        {
            if res.status().is_success() {
                Self::ensure_mcp_registered(client, &base_url).await;
                return Ok(base_url);
            }
        }

        // Determine an available port (handles port 4096 in use by another app)
        let active_port = Self::find_available_port(requested_port);
        let active_port_str = active_port.to_string();
        let active_base_url = format!("http://127.0.0.1:{}", active_port);
        let active_check_url = format!("{}/session", active_base_url);

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
            active_port,
            binary_path.display()
        );

        let mut child = std::process::Command::new(&binary_path);
        child.args([
            "serve",
            "--port",
            &active_port_str,
            "--hostname",
            "127.0.0.1",
        ]);

        // Inject global and user bin directory into child environment
        let current_path = std::env::var("PATH").unwrap_or_default();
        let user_bin_dir = crate::storage::settings::get_superagent_dir().join("bin");
        let path_sep = if cfg!(windows) { ";" } else { ":" };
        let mut new_path = format!("{}{}{}", user_bin_dir.display(), path_sep, current_path);
        #[cfg(target_os = "windows")]
        {
            new_path = format!("C:\\ProgramData\\SuperAgent\\bin;{}", new_path);
        }
        child.env("PATH", new_path);

        // Dynamically resolve Telegram credentials from env or user settings store
        let (tg_bot_token, tg_chat_id) = {
            let env_token = std::env::var("TELEGRAM_BOT_TOKEN").ok();
            let env_chat = std::env::var("TELEGRAM_CHAT_ID").ok();
            if env_token.as_ref().is_some_and(|t| !t.trim().is_empty())
                || env_chat.as_ref().is_some_and(|c| !c.trim().is_empty())
            {
                (env_token.unwrap_or_default(), env_chat.unwrap_or_default())
            } else if let Ok(raw_settings) = crate::storage::SettingsStore::new().load_raw() {
                let tg_val = raw_settings.get("telegram").or_else(|| {
                    raw_settings
                        .get("integrations")
                        .and_then(|i| i.get("telegram"))
                });
                let token = tg_val
                    .and_then(|t| t.get("botToken").or_else(|| t.get("bot_token")))
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let chat = tg_val
                    .and_then(|t| t.get("chatId").or_else(|| t.get("chat_id")))
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                (token, chat)
            } else {
                (String::new(), String::new())
            }
        };

        if !tg_bot_token.trim().is_empty() {
            child.env("TELEGRAM_BOT_TOKEN", tg_bot_token);
        }
        if !tg_chat_id.trim().is_empty() {
            child.env("TELEGRAM_CHAT_ID", tg_chat_id);
        }
        if let Ok(cwd) = std::env::current_dir() {
            child.current_dir(cwd);
        }

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
                    if let Ok(res) = client.get(&active_check_url).send().await {
                        if res.status().is_success() {
                            tracing::info!(
                                "OpenCode server successfully booted on {}",
                                active_base_url
                            );
                            Self::ensure_mcp_registered(client, &active_base_url).await;
                            return Ok(active_base_url);
                        }
                    }
                }
                anyhow::bail!(
                    "OpenCode server was spawned on port {} but did not become ready within 6 seconds.",
                    active_port
                );
            }
            Err(e) => {
                anyhow::bail!(
                    "Failed to start OpenCode server using binary '{}' on port {}: {}.",
                    binary_path.display(),
                    active_port,
                    e
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

    /// Sends a direct HTTPS streaming chat completion request to OpenCode Zen API (`https://opencode.ai/zen/v1/chat/completions`)
    /// satisfying the 4 free-tier contract pillars (tool whitelist validation, mandatory stream, canonical headers, SSE delta parsing).
    pub async fn direct_keyless_chat_stream(
        &self,
        config: &ModelConfig,
        messages: &[ChatMessage],
        tools: &[serde_json::Value],
    ) -> anyhow::Result<Receiver<AgentEvent>> {
        let base_url = config.get_base_url();
        let base_trimmed = base_url.trim_end_matches('/');
        let url = if base_trimmed.ends_with("/chat/completions") {
            base_trimmed.to_string()
        } else if base_trimmed.is_empty() || base_trimmed == "https://api.openai.com/v1" {
            format!("{}/chat/completions", DEFAULT_OPENCODE_BASE_URL)
        } else {
            format!("{}/chat/completions", base_trimmed)
        };

        let prepared_tools = prepare_opencode_free_tier_tools(tools);
        let mut payload = json!({
            "model": config.model_id,
            "messages": Self::format_messages(messages),
            "stream": true,
            "tools": prepared_tools,
        });

        if let Some(temp) = config.temperature {
            payload["temperature"] = json!(temp);
        }
        if let Some(max_t) = config.max_tokens {
            payload["max_tokens"] = json!(max_t);
        }

        let session_id = generate_opencode_session_id();
        let request_id = generate_opencode_request_id();

        let req = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream")
            .header("User-Agent", "opencode/1.20.0")
            .header("x-opencode-session", session_id)
            .header("x-opencode-request", request_id)
            .header("x-opencode-client", "desktop")
            .header("x-opencode-project", "global")
            .timeout(std::time::Duration::from_secs(25))
            .json(&payload);

        let response = req
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("OpenCode direct connection error: {}", e))?;
        let status = response.status();

        if !status.is_success() {
            let err_body = response.text().await.unwrap_or_default();
            anyhow::bail!("OpenCode API error (HTTP {}): {}", status, err_body);
        }

        let (tx, rx) = channel(100);
        let mut stream = response.bytes_stream();

        tokio::spawn(async move {
            let mut buffer = String::new();
            let mut tool_calls_map: HashMap<usize, (String, String, String)> = HashMap::new();
            let mut in_thinking = false;
            let mut stop_reason = String::from("stop");

            while let Some(item) = stream.next().await {
                let bytes = match item {
                    Ok(b) => b,
                    Err(e) => {
                        let _ = tx
                            .send(AgentEvent::Error {
                                message: e.to_string(),
                            })
                            .await;
                        return;
                    }
                };

                buffer.push_str(&String::from_utf8_lossy(&bytes));

                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim_end_matches('\r').trim().to_string();
                    buffer.drain(..=pos);

                    if line.is_empty() || line.starts_with(':') {
                        continue;
                    }

                    if let Some(data_str) = line.strip_prefix("data: ") {
                        let data_str = data_str.trim();
                        if data_str == "[DONE]" {
                            break;
                        }

                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(data_str) {
                            if let Some(choice) = v.get("choices").and_then(|c| c.get(0)) {
                                if let Some(reason) =
                                    choice.get("finish_reason").and_then(|r| r.as_str())
                                {
                                    if !reason.is_empty() {
                                        stop_reason = reason.to_string();
                                    }
                                }

                                if let Some(delta) = choice.get("delta") {
                                    // Handle reasoning / thinking tokens (Nemotron, Mimo, Ling, Big-Pickle)
                                    let reasoning_token = delta
                                        .get("reasoning")
                                        .or_else(|| delta.get("reasoning_content"))
                                        .and_then(|r| r.as_str());

                                    if let Some(reason_text) = reasoning_token {
                                        if !reason_text.is_empty() {
                                            if !in_thinking {
                                                in_thinking = true;
                                                let _ = tx
                                                    .send(AgentEvent::Token {
                                                        text: "<think>\n".to_string(),
                                                    })
                                                    .await;
                                            }
                                            if tx
                                                .send(AgentEvent::Token {
                                                    text: reason_text.to_string(),
                                                })
                                                .await
                                                .is_err()
                                            {
                                                return;
                                            }
                                        }
                                    }

                                    // Handle regular text completion tokens
                                    if let Some(content) =
                                        delta.get("content").and_then(|c| c.as_str())
                                    {
                                        if !content.is_empty() {
                                            if in_thinking {
                                                in_thinking = false;
                                                let _ = tx
                                                    .send(AgentEvent::Token {
                                                        text: "\n</think>\n\n".to_string(),
                                                    })
                                                    .await;
                                            }
                                            if tx
                                                .send(AgentEvent::Token {
                                                    text: content.to_string(),
                                                })
                                                .await
                                                .is_err()
                                            {
                                                return;
                                            }
                                        }
                                    }

                                    // Handle tool calls
                                    if let Some(tcs) =
                                        delta.get("tool_calls").and_then(|t| t.as_array())
                                    {
                                        for tc in tcs {
                                            let idx = tc
                                                .get("index")
                                                .and_then(|i| i.as_u64())
                                                .unwrap_or(0)
                                                as usize;
                                            let entry =
                                                tool_calls_map.entry(idx).or_insert_with(|| {
                                                    (String::new(), String::new(), String::new())
                                                });

                                            if let Some(id) = tc.get("id").and_then(|i| i.as_str())
                                            {
                                                entry.0 = id.to_string();
                                            }
                                            if let Some(func) = tc.get("function") {
                                                if let Some(name) =
                                                    func.get("name").and_then(|n| n.as_str())
                                                {
                                                    entry.1.push_str(name);
                                                }
                                                if let Some(args) =
                                                    func.get("arguments").and_then(|a| a.as_str())
                                                {
                                                    entry.2.push_str(args);
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

            if in_thinking {
                let _ = tx
                    .send(AgentEvent::Token {
                        text: "\n</think>\n\n".to_string(),
                    })
                    .await;
            }

            let mut indices: Vec<_> = tool_calls_map.keys().cloned().collect();
            indices.sort_unstable();
            for idx in indices {
                if let Some((id, name, args_str)) = tool_calls_map.remove(&idx) {
                    let final_id = if id.trim().is_empty() {
                        format!("call_{}", uuid::Uuid::new_v4().simple())
                    } else {
                        id
                    };
                    let mapped_name = map_opencode_tool_name_to_superagent(&name);
                    let input: serde_json::Value = serde_json::from_str(&args_str)
                        .unwrap_or_else(|_| json!({ "raw": args_str }));
                    let _ = tx
                        .send(AgentEvent::ToolCall {
                            id: final_id,
                            name: mapped_name,
                            input,
                        })
                        .await;
                }
            }

            let _ = tx.send(AgentEvent::Finished { stop_reason }).await;
        });

        Ok(rx)
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
        // 1. Direct Cloud API Mode (Zero Download & No Local Port):
        // If the user has configured an OpenCode Zen API key in Settings, route directly
        // to https://opencode.ai/zen/v1 over pure HTTPS without spawning a local daemon or port.
        if let Some(ref key) = config.api_key {
            let trimmed = key.trim();
            if !trimmed.is_empty() && trimmed != "public" {
                tracing::info!(
                    "Routing directly to OpenCode Zen Cloud API via configured API key (no local daemon/port required)"
                );
                let mut cloud_config = config.clone();
                if cloud_config.base_url.is_none() {
                    cloud_config.base_url = Some(DEFAULT_OPENCODE_BASE_URL.to_string());
                }
                let openai = crate::providers::OpenAiProvider::new();
                return openai.chat_stream(&cloud_config, messages, tools).await;
            }
        }

        // 2. Direct Keyless Free-Tier Mode (Zero-Install & Direct HTTPS streaming):
        // Connect directly to OpenCode Zen API satisfying the 4 upstream contract pillars.
        match self
            .direct_keyless_chat_stream(config, messages, tools)
            .await
        {
            Ok(rx) => {
                tracing::info!(
                    "Successfully initiated direct keyless HTTPS stream for OpenCode model '{}'",
                    config.model_id
                );
                return Ok(rx);
            }
            Err(e) => {
                let err_str = e.to_string();
                tracing::warn!(
                    "Direct keyless OpenCode streaming failed for '{}': {}",
                    config.model_id,
                    err_str
                );

                // Fast-fail immediately if IP daily free tier usage limit is reached
                if err_str.contains("FreeUsageLimitError")
                    || err_str.contains("daily usage limit")
                    || err_str.contains("Rate limit exceeded")
                {
                    anyhow::bail!(
                        "OpenCode Zen free-tier daily usage limit reached: {}. Please configure an API key in Settings or switch model.",
                        err_str
                    );
                }

                // OmniRoute-style Free Tier Model Rotation / Failover:
                // When an upstream model hits a temporary glitch or 500, attempt failover
                // to healthy live free models with available capacity.
                if err_str.contains("429") || err_str.contains("500") {
                    let fallback_candidates = [
                        "nemotron-3.5-lightning-free",
                        "mimo-v2.5-free",
                        "deepseek-v4-flash-free",
                    ];
                    for fallback_model in fallback_candidates {
                        if fallback_model != config.model_id {
                            tracing::info!(
                                "Attempting automatic free-tier failover from '{}' to '{}'...",
                                config.model_id,
                                fallback_model
                            );
                            let mut fallback_config = config.clone();
                            fallback_config.model_id = fallback_model.to_string();
                            match self
                                .direct_keyless_chat_stream(&fallback_config, messages, tools)
                                .await
                            {
                                Ok(rx) => {
                                    tracing::info!(
                                        "Failover to '{}' succeeded with 100% pure keyless cloud streaming!",
                                        fallback_model
                                    );
                                    return Ok(rx);
                                }
                                Err(alt_err) => {
                                    let alt_err_str = alt_err.to_string();
                                    tracing::warn!(
                                        "Failover candidate '{}' unavailable: {}",
                                        fallback_model,
                                        alt_err_str
                                    );
                                    if alt_err_str.contains("FreeUsageLimitError")
                                        || alt_err_str.contains("daily usage limit")
                                        || alt_err_str.contains("Rate limit exceeded")
                                    {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                // 100% cloud-native: Never spawn localhost daemon or bind port 4096 per repository rules.
                anyhow::bail!(
                    "OpenCode Zen cloud streaming error for '{}': {}. All free tier fallback models exhausted.",
                    config.model_id,
                    e
                );
            }
        }
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

    #[test]
    fn test_opencode_official_tools_count() {
        assert_eq!(OPENCODE_OFFICIAL_TOOLS.len(), 16);
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"bash"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"read"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"write"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"edit"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"glob"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"grep"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"lsp"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"task"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"question"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"todo"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"plan"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"webfetch"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"websearch"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"patch"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"apply_patch"));
        assert!(OPENCODE_OFFICIAL_TOOLS.contains(&"skill"));
    }

    #[test]
    fn test_get_official_opencode_tools() {
        let tools = get_official_opencode_tools();
        assert_eq!(tools.len(), 16);
        for t in &tools {
            assert_eq!(t["type"], "function");
            let name = t["function"]["name"].as_str().unwrap();
            assert!(OPENCODE_OFFICIAL_TOOLS.contains(&name));
            assert!(!t["function"]["description"].as_str().unwrap().is_empty());
        }
    }

    #[test]
    fn test_prepare_opencode_free_tier_tools_empty() {
        let prepared = prepare_opencode_free_tier_tools(&[]);
        assert_eq!(prepared.len(), 16);
    }

    #[test]
    fn test_prepare_opencode_free_tier_tools_mapping() {
        let client_tools = vec![
            json!({
                "type": "function",
                "function": {
                    "name": "run_command",
                    "description": "Run shell command",
                    "parameters": {"type": "object", "properties": {}}
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "view_file",
                    "description": "View file content",
                    "parameters": {"type": "object", "properties": {}}
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "create_artifact_app",
                    "description": "Create artifact app",
                    "parameters": {"type": "object", "properties": {}}
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "ask_question",
                    "description": "Ask question",
                    "parameters": {"type": "object", "properties": {}}
                }
            }),
        ];
        let prepared = prepare_opencode_free_tier_tools(&client_tools);
        assert_eq!(prepared.len(), 3);
        assert_eq!(prepared[0]["function"]["name"], "bash");
        assert_eq!(prepared[1]["function"]["name"], "read");
        assert_eq!(prepared[2]["function"]["name"], "question");
    }

    #[test]
    fn test_map_opencode_tool_name_to_superagent() {
        assert_eq!(map_opencode_tool_name_to_superagent("bash"), "run_command");
        assert_eq!(map_opencode_tool_name_to_superagent("read"), "read_file");
        assert_eq!(map_opencode_tool_name_to_superagent("write"), "write_file");
        assert_eq!(map_opencode_tool_name_to_superagent("edit"), "edit_file");
        assert_eq!(map_opencode_tool_name_to_superagent("glob"), "glob");
        assert_eq!(map_opencode_tool_name_to_superagent("grep"), "grep_search");
        assert_eq!(
            map_opencode_tool_name_to_superagent("webfetch"),
            "browser_navigate"
        );
        assert_eq!(
            map_opencode_tool_name_to_superagent("websearch"),
            "web_search"
        );
        assert_eq!(map_opencode_tool_name_to_superagent("task"), "run_subagent");
        assert_eq!(map_opencode_tool_name_to_superagent("skill"), "skill");
        assert_eq!(map_opencode_tool_name_to_superagent("plan"), "plan");
        assert_eq!(map_opencode_tool_name_to_superagent("todo"), "todo");
        assert_eq!(map_opencode_tool_name_to_superagent("question"), "question");
        assert_eq!(
            map_opencode_tool_name_to_superagent("ask_question"),
            "question"
        );
        assert_eq!(
            map_opencode_tool_name_to_superagent("view_file"),
            "read_file"
        );
        assert_eq!(
            map_opencode_tool_name_to_superagent("custom_tool"),
            "custom_tool"
        );
    }

    #[test]
    fn test_is_free_opencode_model() {
        assert!(is_free_opencode_model("big-pickle"));
        assert!(is_free_opencode_model("mimo-v2.5-free"));
        assert!(is_free_opencode_model("nemotron-3.5-lightning-free"));
        assert!(is_free_opencode_model("custom-agent-free"));
        assert!(!is_free_opencode_model("claude-3-5-sonnet"));
        assert!(!is_free_opencode_model("gpt-4o"));
    }
}
