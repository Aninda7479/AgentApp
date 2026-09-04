use std::io::{self, IsTerminal, Read, Write};
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use clap::Parser;
use sysinfo::System;

use superagent_core_v2::orchestrator::AgentEngine;
use superagent_core_v2::server::{lan_addresses, start_server};
use superagent_core_v2::storage::{
    clear_web_server_lock, get_superagent_dir, is_lock_alive, read_web_server_lock,
};
use superagent_core_v2::tools::builtin::{
    EditFileTool, GrepSearchTool, ListDirTool, ReadFileTool, RunCommandTool, WriteFileTool,
};
use superagent_core_v2::tools::ToolRegistry;
use superagent_core_v2::types::{ModelConfig, ProviderType};

use superagent_cli::cli::args::{Cli, Commands, PasswordAction, PermissionLevelArg};
use superagent_cli::shortcuts::permissions::PermissionLevel;
use superagent_cli::tui::app::AppState;
use superagent_cli::tui::run_tui;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging / tracing if requested
    if std::env::var("RUST_LOG").is_ok() {
        tracing_subscriber::fmt::init();
    }

    let cli = Cli::parse();

    let workspace_root = cli
        .workspace
        .clone()
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));

    // 1. --models flag or models subcommand
    if cli.models || matches!(cli.command, Some(Commands::Models)) {
        print_models_list();
        return Ok(());
    }

    // 2. --stop-web flag or stop-web subcommand
    if cli.stop_web || matches!(cli.command, Some(Commands::StopWeb)) {
        handle_stop_web();
        return Ok(());
    }

    // 3. --web-status flag or web-status subcommand
    if cli.web_status || matches!(cli.command, Some(Commands::WebStatus)) {
        handle_web_status();
        return Ok(());
    }

    // 4. --status flag or status subcommand
    if cli.status || matches!(cli.command, Some(Commands::Status)) {
        print_system_status(&workspace_root).await;
        return Ok(());
    }

    // 5. doctor subcommand
    if matches!(cli.command, Some(Commands::Doctor)) {
        handle_doctor(&workspace_root);
        return Ok(());
    }

    // 6. init subcommand
    if matches!(cli.command, Some(Commands::Init)) {
        handle_init(&workspace_root)?;
        return Ok(());
    }

    // 7. startup subcommand
    if let Some(Commands::Startup { action, desktop, port }) = &cli.command {
        handle_startup(action, *desktop, *port).await?;
        return Ok(());
    }

    // 8. update subcommand
    if let Some(Commands::Update { check }) = &cli.command {
        handle_update(*check).await?;
        return Ok(());
    }

    // 9. password subcommand
    if let Some(Commands::Password { action }) = &cli.command {
        handle_password(action.as_ref())?;
        return Ok(());
    }

    // 10. --start-web / --serve / --server / serve subcommand daemon mode
    let is_serve_cmd = match &cli.command {
        Some(Commands::Serve { port, host, ui_dir, no_auth }) => Some((*port, host.clone(), ui_dir.clone(), *no_auth)),
        _ => None,
    };

    if cli.start_web || cli.server || is_serve_cmd.is_some() {
        let (port, host, custom_ui_dir, no_auth) = if let Some((p, h, u, na)) = is_serve_cmd {
            (p, h, u, na || cli.no_auth)
        } else {
            (cli.web_port, cli.host.clone(), cli.ui_dir.clone(), cli.no_auth)
        };

        if no_auth {
            std::env::set_var("SUPERAGENT_DISABLE_AUTH", "true");
        }

        println!("================================================================");
        println!(
            "🚀 SuperAgent Core v2 Daemon ignited at: http://{}:{}",
            if host == "0.0.0.0" { "localhost" } else { &host },
            port
        );
        if host == "0.0.0.0" || host == "::" {
            for addr in lan_addresses() {
                println!("🌐 Network (LAN) URL:              http://{}:{}", addr, port);
            }
        } else if host != "127.0.0.1" && host != "localhost" {
            println!("🌐 Network URL:                    http://{}:{}", host, port);
        }
        println!("⚡ Engine: Native Pure Rust Axum + WebSocket Server");
        println!("📂 Workspace: {}", workspace_root.display());
        if let Some(ref d) = custom_ui_dir {
            println!("🌐 Static UI Bundle: {}", d.display());
        }
        println!("PID {} — press Ctrl+C to stop.", std::process::id());
        println!("================================================================");

        start_server(port, &host, workspace_root, custom_ui_dir).await?;
        return Ok(());
    }

    // 8. One-shot script execution mode (exec subcommand, non-interactive prompt, or piped input)
    let is_interactive = io::stdin().is_terminal() && io::stdout().is_terminal();

    let mut prompt_opt = match &cli.command {
        Some(Commands::Chat(args)) => args.prompt.clone().or_else(|| args.chat.clone()),
        Some(Commands::Exec { prompt, file }) => {
            if let Some(f) = file {
                std::fs::read_to_string(f).ok()
            } else {
                prompt.clone()
            }
        }
        _ => cli.chat.prompt.clone().or_else(|| cli.chat.chat.clone()),
    };

    // If no explicit prompt was provided and stdin is not a terminal (e.g. piped stdin), read from stdin
    if prompt_opt.is_none() && !io::stdin().is_terminal() {
        let mut buffer = String::new();
        if io::stdin().read_to_string(&mut buffer).is_ok() {
            let trimmed = buffer.trim();
            if !trimmed.is_empty() {
                prompt_opt = Some(trimmed.to_string());
            }
        }
    }

    if let Some(user_prompt) = prompt_opt {
        if !user_prompt.trim().is_empty() {
            run_one_shot(
                &workspace_root,
                cli.chat.provider.as_deref(),
                cli.chat.model.as_deref(),
                cli.chat.key.as_deref().or(cli.api_key.as_deref()),
                cli.base_url.as_deref(),
                cli.system.as_deref(),
                &user_prompt,
            )
            .await?;
            return Ok(());
        }
    }

    if !is_interactive {
        anyhow::bail!("Cannot launch interactive TUI: stdin and stdout must both be attached to a terminal (TTY). Provide a prompt or pipe input to run in non-interactive mode.");
    }

    // 9. Interactive TUI mode (Default)
    let permission = match cli.chat.permission {
        PermissionLevelArg::Auto => PermissionLevel::Auto,
        PermissionLevelArg::Ask => PermissionLevel::Ask,
        PermissionLevelArg::Deny => PermissionLevel::Deny,
    };

    let app = AppState::new(
        cli.chat.provider,
        cli.chat.model,
        cli.chat.key.or(cli.api_key),
        cli.base_url,
        permission,
        workspace_root,
        cli.chat.resume,
    );

    run_tui(app).await?;

    Ok(())
}

fn handle_stop_web() {
    if let Some(lock) = read_web_server_lock() {
        println!("Stopping SuperAgent web server (PID {})...", lock.pid);
        let mut sys = System::new_all();
        sys.refresh_all();
        let pid = sysinfo::Pid::from_u32(lock.pid);
        if let Some(process) = sys.process(pid) {
            process.kill();
            clear_web_server_lock();
            println!("SuperAgent web server stopped.");
        } else {
            clear_web_server_lock();
            println!("SuperAgent web server was not actively running (cleaned stale lockfile).");
        }
    } else {
        println!("No SuperAgent web server is running.");
    }
}

fn handle_web_status() {
    if let Some(lock) = read_web_server_lock() {
        if is_lock_alive(&lock) {
            println!(
                "SuperAgent web server is RUNNING on http://{}:{} (PID {}, started by {}).",
                lock.host, lock.port, lock.pid, lock.started_by
            );
        } else {
            clear_web_server_lock();
            println!("SuperAgent web server is NOT running (cleaned stale lockfile).");
        }
    } else {
        println!("SuperAgent web server is NOT running.");
    }
}

fn calculate_dir_size(path: &std::path::Path) -> (u64, usize, usize) {
    let mut total_bytes: u64 = 0;
    let mut file_count: usize = 0;
    let mut dir_count: usize = 0;

    if path.exists() {
        for entry in walkdir::WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                if let Ok(metadata) = entry.metadata() {
                    total_bytes += metadata.len();
                    file_count += 1;
                }
            } else if entry.file_type().is_dir() {
                dir_count += 1;
            }
        }
    }

    (total_bytes, file_count, dir_count)
}

fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let b = bytes as f64;

    if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.2} MB", b / MB)
    } else if b >= KB {
        format!("{:.2} KB", b / KB)
    } else {
        format!("{} B", bytes)
    }
}

async fn print_system_status(workspace: &std::path::Path) {
    let mut sys = System::new_all();
    sys.refresh_all();

    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_ver = System::os_version().unwrap_or_default();
    let host_name = System::host_name().unwrap_or_else(|| "localhost".to_string());
    let cpus = sys.cpus().len();
    let total_mem_mb = sys.total_memory() / (1024 * 1024);
    let used_mem_mb = sys.used_memory() / (1024 * 1024);

    let sa_dir = get_superagent_dir();
    let (total_bytes, file_count, dir_count) = calculate_dir_size(&sa_dir);

    println!("======================================================");
    println!("              SUPERAGENT SYSTEM STATUS");
    println!("======================================================");
    println!("CLI Version:         v{} (Pure Rust Engine)", env!("CARGO_PKG_VERSION"));
    println!("OS Platform:         {} ({})", std::env::consts::OS, std::env::consts::ARCH);
    println!("Host System:         {} ({} {}, {} CPUs, {}/{} MB RAM)", host_name, os_name, os_ver, cpus, used_mem_mb, total_mem_mb);
    println!();

    // Global SuperAgent Directory
    println!("Global User Data (~/.superagent):");
    println!("  Location:          {}", sa_dir.display());
    println!("  Total Size:        {} ({} files, {} directories)", format_bytes(total_bytes), file_count, dir_count);

    let chats_dir = sa_dir.join("conversation").join("chats");
    let (chats_bytes, chats_files, _) = calculate_dir_size(&chats_dir);
    if chats_files > 0 {
        println!("  Conversations:     {} chats ({})", chats_files, format_bytes(chats_bytes));
    }

    let artifacts_dir = if sa_dir.join("artifacts").exists() {
        sa_dir.join("artifacts")
    } else {
        sa_dir.join("artifact")
    };
    let (artifacts_bytes, artifacts_files, _) = calculate_dir_size(&artifacts_dir);
    if artifacts_bytes > 0 || artifacts_files > 0 {
        let mut app_count = 0;
        if let Ok(entries) = std::fs::read_dir(&artifacts_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    app_count += 1;
                }
            }
        }
        if app_count == 0 && artifacts_files > 0 {
            app_count = 1;
        }
        let app_label = if app_count == 1 { "artifact" } else { "artifacts" };
        if artifacts_files > app_count {
            println!("  Artifacts:         {} {} ({} across {} files)", app_count, app_label, format_bytes(artifacts_bytes), artifacts_files);
        } else {
            println!("  Artifacts:         {} {} ({})", app_count, app_label, format_bytes(artifacts_bytes));
        }
    }

    let settings_file = sa_dir.join("settings.json");
    if settings_file.exists() {
        let sz = settings_file.metadata().map(|m| m.len()).unwrap_or(0);
        println!("  Settings:          Configured ({})", format_bytes(sz));
    } else {
        println!("  Settings:          Default (BYOK in settings)");
    }
    println!();

    // Web Server section
    println!("Web Server (--serve):");
    let lock_opt = read_web_server_lock();
    if let Some(lock) = lock_opt {
        if is_lock_alive(&lock) {
            println!("  Status:            RUNNING");
            println!("  Port:              {}", lock.port);
            println!("  Local URL:         http://localhost:{}", lock.port);
            for addr in lan_addresses() {
                println!("  Network (LAN) URL: http://{}:{}", addr, lock.port);
            }
            println!("  PID:               {}", lock.pid);
            println!("  Started By:        {}", lock.started_by);
            if lock.started_at > 0 {
                let dt = chrono::DateTime::from_timestamp_millis(lock.started_at as i64)
                    .map(|d| d.format("%Y-%m-%d %H:%M:%S UTC").to_string())
                    .unwrap_or_else(|| lock.started_at.to_string());
                println!("  Started At:        {}", dt);
            }
        } else {
            clear_web_server_lock();
            println!("  Status:            STOPPED");
            println!("  Tip:               Start anytime with 'superagent --serve'");
        }
    } else {
        println!("  Status:            STOPPED");
        println!("  Tip:               Start anytime with 'superagent --serve'");
    }
    println!();

    // Active Workspace section
    println!("Active Workspace:");
    println!("  Directory:         {}", workspace.display());
    let test_file = workspace.join(".superagent_write_test");
    let is_writable = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .open(&test_file)
        .map(|f| {
            drop(f);
            let _ = std::fs::remove_file(&test_file);
            true
        })
        .unwrap_or(false);
    println!("  Permissions:       {}", if is_writable { "Writable" } else { "Read-Only" });
    let agents_md = workspace.join("AGENTS.md").exists();
    println!("  AGENTS.md:         {}", if agents_md { "Found" } else { "Not found (run 'superagent init' to create)" });
    let is_git = workspace.join(".git").exists();
    if is_git {
        println!("  Git Repo:          Initialized");
    }
    println!();

    // Connected Devices section
    println!("Connected Devices:");
    let auth_store = superagent_core_v2::storage::auth::AuthStore::new(sa_dir.clone());
    let sessions = auth_store.list_sessions("admin");
    if !sessions.is_empty() {
        println!("  Total Active:      {} device{}", sessions.len(), if sessions.len() == 1 { "" } else { "s" });
        for (idx, s) in sessions.iter().enumerate() {
            let ua = s.user_agent.as_deref().unwrap_or("Web Client");
            let ip = s.ip.as_deref().unwrap_or("127.0.0.1");
            let last_active = if s.last_used.is_empty() { "Active" } else { &s.last_used };
            println!("  {}. {} ({}) — Last active: {}", idx + 1, ua, ip, last_active);
        }
    } else {
        println!("  Total Active:      0 devices connected");
    }
    println!();

    // Run on Startup section
    println!("Run on Startup:");
    let autostart_enabled = superagent_core_v2::startup::AutostartManager::is_enabled(
        superagent_core_v2::startup::AutostartTarget::Cli,
    ).await;
    println!("  Status:            {}", if autostart_enabled { "ENABLED (Runs --serve on boot)" } else { "DISABLED" });
    #[cfg(target_os = "windows")]
    println!("  Location:          HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\SuperAgentServe");
    #[cfg(target_os = "linux")]
    println!("  Location:          ~/.config/autostart/superagent-serve.desktop");
    #[cfg(target_os = "macos")]
    println!("  Location:          ~/Library/LaunchAgents/com.superagent.serve.plist");

    println!();

    // AI Configuration section
    println!("AI Configuration:");
    let settings_store = superagent_core_v2::storage::SettingsStore::new();
    let mut connected: Vec<String> = Vec::new();
    let mut default_model: Option<String> = None;

    if std::env::var("OPENAI_API_KEY").map(|k| !k.trim().is_empty()).unwrap_or(false) {
        connected.push("OpenAI".to_string());
    }
    if std::env::var("ANTHROPIC_API_KEY").map(|k| !k.trim().is_empty()).unwrap_or(false) {
        connected.push("Anthropic".to_string());
    }
    if std::env::var("GEMINI_API_KEY").map(|k| !k.trim().is_empty()).unwrap_or(false) {
        connected.push("Gemini".to_string());
    }
    if std::env::var("DEEPSEEK_API_KEY").map(|k| !k.trim().is_empty()).unwrap_or(false) {
        connected.push("DeepSeek".to_string());
    }
    if std::env::var("GROQ_API_KEY").map(|k| !k.trim().is_empty()).unwrap_or(false) {
        connected.push("Groq".to_string());
    }
    if std::env::var("OPENROUTER_API_KEY").map(|k| !k.trim().is_empty()).unwrap_or(false) {
        connected.push("OpenRouter".to_string());
    }

    if let Ok(settings_raw) = settings_store.load_raw() {
        if let Some(providers_arr) = settings_raw.get("providers").and_then(|v| v.as_array()) {
            for p in providers_arr {
                if let Some(name) = p.get("name").or_else(|| p.get("id")).and_then(|v| v.as_str()) {
                    if !connected.iter().any(|c| c.eq_ignore_ascii_case(name)) {
                        connected.push(name.to_string());
                    }
                }
            }
        }
        if let Some(model_str) = settings_raw.get("lastUsedModel").and_then(|m| m.get("model")).and_then(|v| v.as_str()) {
            default_model = Some(model_str.to_string());
        }
    }

    if !connected.is_empty() {
        println!("  Connected:         {}", connected.join(", "));
    } else {
        println!("  Connected:         None (BYOK in settings)");
    }
    if let Some(m) = default_model {
        println!("  Active Model:      {}", m);
    }
    println!("======================================================");
}

fn handle_doctor(workspace: &std::path::Path) {
    println!("================================================================");
    println!("SuperAgent Doctor Diagnostics");
    println!("================================================================");
    println!("✓ CLI Version:        v{} (Pure Native Rust Engine)", env!("CARGO_PKG_VERSION"));
    println!("✓ Workspace:          {} (Writable)", workspace.display());

    let sa_dir = get_superagent_dir();
    let (sa_bytes, sa_files, _) = calculate_dir_size(&sa_dir);
    println!("✓ Global Config Dir:  {} ({} across {} files)", sa_dir.display(), format_bytes(sa_bytes), sa_files);

    let settings_store = superagent_core_v2::storage::SettingsStore::new();
    if let Ok(raw) = settings_store.load_raw() {
        let count = raw.get("providers").and_then(|p| p.as_array()).map(|a| a.len()).unwrap_or(0);
        println!("✓ Saved AI Providers: {} configured", count);
    }

    if let Some(lock) = read_web_server_lock() {
        if is_lock_alive(&lock) {
            println!("✓ Web Server:         RUNNING on http://{}:{} (PID {})", lock.host, lock.port, lock.pid);
        } else {
            clear_web_server_lock();
            println!("✓ Web Server:         Stopped (Stale lock cleaned)");
        }
    } else {
        println!("✓ Web Server:         Stopped (Ready to start with 'superagent --serve')");
    }

    println!("✓ Engine Diagnostics: Healthy");
    println!("================================================================");
}

fn handle_init(workspace: &std::path::Path) -> Result<()> {
    let agents_path = workspace.join("AGENTS.md");
    if agents_path.exists() {
        println!("`AGENTS.md` already exists in workspace ({}).", agents_path.display());
        return Ok(());
    }
    let template = r#"# Agent Instructions for this Workspace

## Overview
This workspace uses SuperAgent for autonomous development and automation tasks.

## Guidelines
- Follow existing architectural patterns and clean code standards.
- Run tests and verifications before completing tasks.
- Keep modifications clean, minimal, and well-documented.
"#;
    std::fs::write(&agents_path, template)?;
    println!("✓ Successfully initialized `AGENTS.md` in {}.", workspace.display());
    Ok(())
}

async fn handle_update(check_only: bool) -> Result<()> {
    let current_version = env!("CARGO_PKG_VERSION");
    println!("[update] Checking GitHub Releases for the latest version…");

    let client = reqwest::Client::builder()
        .user_agent("SuperAgent-CLI")
        .timeout(std::time::Duration::from_secs(6))
        .build()?;

    let latest_version = match fetch_latest_release_version(&client).await {
        Ok(v) => v,
        Err(e) => {
            println!("SuperAgent  current: v{}   (offline or check failed: {})", current_version, e);
            println!("Release page: https://github.com/Aninda7479/AgentApp/releases/latest");
            return Ok(());
        }
    };

    println!("SuperAgent  current: v{}   latest: v{}", current_version, latest_version);

    if compare_semver(current_version, &latest_version) >= 0 {
        println!("\n[update] SuperAgent is already up to date (v{}).", current_version);
        return Ok(());
    }

    let release_url = format!("https://github.com/Aninda7479/AgentApp/releases/tag/v{}", latest_version);

    if check_only {
        println!("\n[update] New version available: v{}", latest_version);
        println!("         Release page: {}", release_url);
        println!("         Run `superagent update` to update automatically.");
        return Ok(());
    }

    println!("\n[update] New version available: v{}", latest_version);
    println!("         Release page: {}\n", release_url);
    println!("[update] Automatically running install script to self update…\n");

    let is_win = cfg!(target_os = "windows");
    let mut cmd = if is_win {
        let mut c = std::process::Command::new("powershell.exe");
        c.args(["-ExecutionPolicy", "Bypass", "-Command", "irm https://aninda7479.github.io/AgentApp/install.ps1 | iex"]);
        c
    } else {
        let mut c = std::process::Command::new("sh");
        c.args(["-c", "curl -fsSL https://aninda7479.github.io/AgentApp/install.sh | sh"]);
        c
    };

    cmd.env("FORCE", "1");
    cmd.stdin(std::process::Stdio::inherit());
    cmd.stdout(std::process::Stdio::inherit());
    cmd.stderr(std::process::Stdio::inherit());

    match cmd.status() {
        Ok(status) if status.success() => {
            println!("\n[update] SuperAgent successfully updated to v{}!", latest_version);
        }
        _ => {
            println!("\n[update] Automatic installer failed or requires manual installation.");
            println!("Manual install:");
            if is_win {
                println!("    irm https://aninda7479.github.io/AgentApp/install.ps1 | iex");
            } else {
                println!("    curl -fsSL https://aninda7479.github.io/AgentApp/install.sh | sh");
            }
        }
    }

    Ok(())
}

async fn fetch_latest_release_version(client: &reqwest::Client) -> Result<String> {
    // 1. Try redirect on releases/latest
    let head_res = client
        .head("https://github.com/Aninda7479/AgentApp/releases/latest")
        .send()
        .await;

    if let Ok(res) = head_res {
        let final_url = res.url().as_str();
        if let Some(tag_pos) = final_url.rfind("/tag/") {
            let tag = &final_url[tag_pos + 5..];
            let clean_ver = tag.trim_start_matches('v').trim();
            if !clean_ver.is_empty() {
                return Ok(clean_ver.to_string());
            }
        }
    }

    // 2. Fallback to GitHub API
    let api_res = client
        .get("https://api.github.com/repos/Aninda7479/AgentApp/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?;

    let json: serde_json::Value = api_res.json().await?;
    if let Some(tag) = json.get("tag_name").and_then(|v| v.as_str()) {
        return Ok(tag.trim_start_matches('v').to_string());
    }

    anyhow::bail!("Could not parse release tag name")
}

fn compare_semver(a: &str, b: &str) -> i32 {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.')
            .map(|part| part.chars().take_while(|c| c.is_ascii_digit()).collect::<String>())
            .filter_map(|p| p.parse().ok())
            .collect()
    };
    let va = parse(a);
    let vb = parse(b);
    for i in 0..std::cmp::max(va.len(), vb.len()) {
        let ai = va.get(i).copied().unwrap_or(0);
        let bi = vb.get(i).copied().unwrap_or(0);
        if ai < bi {
            return -1;
        } else if ai > bi {
            return 1;
        }
    }
    0
}

fn print_models_list() {
    println!("=== Available AI Model IDs ===");
    println!();
    println!("[Provider: openai]");
    println!("  gpt-4o                               (GPT-4o Multimodal)");
    println!("  gpt-4o-mini                          (GPT-4o Mini Fast)");
    println!("  o1                                   (o1 Deep Reasoning)");
    println!("  o3-mini                              (o3-mini Fast Reasoning)");
    println!();
    println!("[Provider: anthropic]");
    println!("  claude-3-5-sonnet-20241022           (Claude 3.5 Sonnet)");
    println!("  claude-3-5-haiku-20241022            (Claude 3.5 Haiku)");
    println!();
    println!("[Provider: gemini]");
    println!("  gemini-2.0-flash                     (Gemini 2.0 Flash)");
    println!("  gemini-1.5-pro                       (Gemini 1.5 Pro 2M ctx)");
    println!();
    println!("[Provider: deepseek]");
    println!("  deepseek-chat                        (DeepSeek V3)");
    println!("  deepseek-reasoner                    (DeepSeek R1 Reasoning)");
    println!();
    println!("[Provider: groq]");
    println!("  llama-3.3-70b-versatile              (Llama 3.3 70B Fast)");
    println!();
    println!("[Provider: ollama]");
    println!("  qwen2.5-coder                        (Qwen 2.5 Coder Local)");
    println!("  llama3                               (Llama 3 Local)");
    println!();
    println!("Usage:");
    println!("  superagent -p openai -m gpt-4o --chat \"Your prompt\"");
}

async fn handle_startup(action: &str, desktop: bool, _port: u16) -> Result<()> {
    let target = if desktop {
        superagent_core_v2::startup::AutostartTarget::Desktop
    } else {
        superagent_core_v2::startup::AutostartTarget::Cli
    };

    match action.to_lowercase().as_str() {
        "status" => {
            let enabled = superagent_core_v2::startup::AutostartManager::is_enabled(target).await;
            println!(
                "OS Autostart on boot for {}: {}",
                if desktop { "Desktop App" } else { "CLI Server" },
                if enabled { "ENABLED" } else { "DISABLED" }
            );
        }
        "enable" => {
            let current_exe = std::env::current_exe()?;
            superagent_core_v2::startup::AutostartManager::enable(
                target,
                &current_exe.to_string_lossy(),
            )
            .await?;
            println!(
                "OS Autostart on boot ENABLED for {}.",
                if desktop { "Desktop App" } else { "CLI Server" }
            );
        }
        "disable" => {
            superagent_core_v2::startup::AutostartManager::disable(target).await?;
            println!(
                "OS Autostart on boot DISABLED for {}.",
                if desktop { "Desktop App" } else { "CLI Server" }
            );
        }
        _ => {
            println!("Usage: superagent startup [enable | disable | status]");
        }
    }

    Ok(())
}

async fn run_one_shot(
    workspace_root: &std::path::Path,
    provider_str: Option<&str>,
    model_id_str: Option<&str>,
    api_key_str: Option<&str>,
    base_url_str: Option<&str>,
    system_prompt_str: Option<&str>,
    user_prompt: &str,
) -> Result<()> {
    let provider = match provider_str.unwrap_or("openai").to_lowercase().as_str() {
        "anthropic" => ProviderType::Anthropic,
        "gemini" => ProviderType::Gemini,
        "ollama" => ProviderType::Ollama,
        "openrouter" => ProviderType::OpenRouter,
        "deepseek" => ProviderType::DeepSeek,
        "groq" => ProviderType::Groq,
        _ => ProviderType::OpenAI,
    };

    let model_id = model_id_str
        .map(String::from)
        .unwrap_or_else(|| match provider {
            ProviderType::Anthropic => "claude-3-5-sonnet-20241022".to_string(),
            ProviderType::Gemini => "gemini-2.0-flash".to_string(),
            ProviderType::Ollama => "llama3".to_string(),
            _ => "gpt-4o".to_string(),
        });

    let mut model_config = ModelConfig::new(provider, model_id);
    model_config.api_key = api_key_str.map(String::from).or_else(|| match model_config.provider {
        ProviderType::OpenAI => std::env::var("OPENAI_API_KEY").ok(),
        ProviderType::Anthropic => std::env::var("ANTHROPIC_API_KEY").ok(),
        ProviderType::Gemini => std::env::var("GEMINI_API_KEY").ok(),
        ProviderType::OpenRouter => std::env::var("OPENROUTER_API_KEY").ok(),
        ProviderType::DeepSeek => std::env::var("DEEPSEEK_API_KEY").ok(),
        ProviderType::Groq => std::env::var("GROQ_API_KEY").ok(),
        _ => None,
    });
    model_config.base_url = base_url_str.map(String::from);

    let mut registry = ToolRegistry::new();
    registry.register(ReadFileTool::new(workspace_root.to_path_buf()));
    registry.register(WriteFileTool::new(workspace_root.to_path_buf()));
    registry.register(EditFileTool::new(workspace_root.to_path_buf()));
    registry.register(ListDirTool::new(workspace_root.to_path_buf()));
    registry.register(RunCommandTool::new(workspace_root.to_path_buf()));
    registry.register(GrepSearchTool::new(workspace_root.to_path_buf()));

    let engine = AgentEngine::new(Arc::new(registry));
    let system_prompt = system_prompt_str.unwrap_or_default();

    let mut rx = engine
        .run_loop(&model_config, system_prompt, user_prompt)
        .await?;

    let stdout = io::stdout();
    let mut out_handle = stdout.lock();
    let stderr = io::stderr();
    let mut err_handle = stderr.lock();
    let mut has_error = false;

    while let Some(event) = rx.recv().await {
        match event {
            superagent_core_v2::types::AgentEvent::Token { text } => {
                let _ = write!(out_handle, "{}", text);
                let _ = out_handle.flush();
            }
            superagent_core_v2::types::AgentEvent::ToolCall { name, input, .. } => {
                let _ = writeln!(err_handle, "\n[Tool Call] {}: {}", name, input);
                let _ = err_handle.flush();
            }
            superagent_core_v2::types::AgentEvent::ToolOutput { output, is_error, .. } => {
                let _ = writeln!(err_handle, "[Tool Output{}] {}", if is_error { " (Error)" } else { "" }, output);
                let _ = err_handle.flush();
            }
            superagent_core_v2::types::AgentEvent::Error { message } => {
                has_error = true;
                let _ = writeln!(err_handle, "\n[Error] {}", message);
                let _ = err_handle.flush();
            }
            superagent_core_v2::types::AgentEvent::Finished { .. } => {
                let _ = writeln!(out_handle);
                let _ = out_handle.flush();
            }
            _ => {}
        }
    }

    if has_error {
        std::process::exit(1);
    }

    Ok(())
}

fn handle_password(action: Option<&PasswordAction>) -> Result<()> {
    let sa_dir = get_superagent_dir();
    let auth_store = superagent_core_v2::storage::auth::AuthStore::new(sa_dir.clone());
    let auth_file_path = superagent_core_v2::storage::auth::resolve_auth_file_path(Some(&sa_dir));

    match action {
        None | Some(PasswordAction::Status) => {
            println!("========================================================");
            println!("              SUPERAGENT PASSWORD STATUS");
            println!("========================================================");
            let is_set = auth_store.is_password_set();
            let username = auth_store.get_username();
            println!("Username:            {}", username);
            if is_set {
                println!("Password Status:     CONFIGURED (Custom password set)");
                println!("Auth File:           {}", auth_file_path.display());
                println!("Web UI Login:        http://localhost:1469/login");
                println!();
                println!("Tip: Use 'superagent password set' to change, or 'superagent password reset' to restore default.");
            } else {
                println!("Password Status:     DEFAULT (Using default 'admin' fallback)");
                println!("Auth File:           {}", auth_file_path.display());
                println!("Web UI Login:        http://localhost:1469/login (password: admin)");
                println!();
                println!("⚠️  Warning: Default password is in use.");
                println!("Run 'superagent password set' to set a strong custom password.");
            }
            println!("========================================================");
        }
        Some(PasswordAction::Set { password }) => {
            let pass = match password {
                Some(p) => p.clone(),
                None => {
                    let p1 = rpassword::prompt_password("Enter new SuperAgent Web UI password: ")?;
                    if p1.trim().is_empty() {
                        anyhow::bail!("Password cannot be empty.");
                    }
                    let p2 = rpassword::prompt_password("Confirm new password: ")?;
                    if p1 != p2 {
                        anyhow::bail!("Passwords do not match.");
                    }
                    p1
                }
            };

            let clean = pass.trim();
            if clean.len() < 6 {
                anyhow::bail!("Password must be at least 6 characters long.");
            }

            auth_store.set_password(clean, Some("admin"))?;
            println!("✓ SuperAgent Web UI password updated successfully.");
            println!("Saved to: {}", auth_file_path.display());
            println!("You can now sign in at http://localhost:1469/login with your new password.");
        }
        Some(PasswordAction::Reset) => {
            auth_store.set_password("admin", Some("admin"))?;
            println!("✓ SuperAgent Web UI password reset to default ('admin').");
            println!("Run 'superagent password set' anytime to configure a custom password.");
        }
    }

    Ok(())
}
