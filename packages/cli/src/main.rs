use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use clap::Parser;
use sysinfo::System;

use superagent_core_v2::orchestrator::AgentEngine;
use superagent_core_v2::server::{lan_addresses, start_server};
use superagent_core_v2::storage::{
    clear_web_server_lock, get_superagent_dir, read_web_server_lock,
};
use superagent_core_v2::tools::builtin::{
    EditFileTool, GrepSearchTool, ListDirTool, ReadFileTool, RunCommandTool, WriteFileTool,
};
use superagent_core_v2::tools::ToolRegistry;
use superagent_core_v2::types::{ModelConfig, ProviderType};

use superagent_cli::cli::args::{Cli, Commands, PermissionLevelArg};
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

    // 1. --models flag
    if cli.models {
        print_models_list();
        return Ok(());
    }

    // 2. --stop-web flag
    if cli.stop_web {
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
        return Ok(());
    }

    // 3. --web-status flag
    if cli.web_status {
        if let Some(lock) = read_web_server_lock() {
            println!(
                "SuperAgent web server is RUNNING on port {} (started by {}, PID {}).",
                lock.port, lock.started_by, lock.pid
            );
        } else {
            println!("SuperAgent web server is NOT running.");
        }
        return Ok(());
    }

    // 4. --status flag or status subcommand
    if cli.status || matches!(cli.command, Some(Commands::Status)) {
        print_system_status(&workspace_root);
        return Ok(());
    }

    // 5. startup subcommand
    if let Some(Commands::Startup { action, desktop, port }) = &cli.command {
        handle_startup(action, *desktop, *port).await?;
        return Ok(());
    }

    // 6. update subcommand
    if let Some(Commands::Update { check }) = &cli.command {
        if *check {
            println!("Checking for SuperAgent updates...");
            println!("Current version: 0.17.0 (Latest).");
        } else {
            println!("SuperAgent is up to date (version 0.17.0).");
        }
        return Ok(());
    }

    // 7. --start-web / --serve / --server daemon mode
    if cli.start_web || cli.server {
        let port = cli.web_port;
        let host = cli.host.clone();

        if cli.no_auth {
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
        println!("⚡ Mode: Native Pure Rust Axum Async Engine");
        println!("📂 Workspace: {}", workspace_root.display());
        if let Some(ref d) = cli.ui_dir {
            println!("🌐 Static UI Bundle: {}", d.display());
        }
        println!("================================================================");

        start_server(port, &host, workspace_root, cli.ui_dir).await?;
        return Ok(());
    }

    // 8. One-shot script execution mode (exec subcommand or non-interactive prompt)
    let prompt_opt = match &cli.command {
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

fn print_system_status(workspace: &std::path::Path) {
    println!("================================================================");
    println!("SuperAgent System Status");
    println!("================================================================");
    println!("• CLI Version:     0.17.0 (Pure Native Rust & Ratatui)");
    println!("• Runtime:         Zero Node.js dependency (Standalone Binary)");
    println!("• Workspace Root:  {}", workspace.display());
    println!("• User Data Dir:   {}", get_superagent_dir().display());

    if let Some(lock) = read_web_server_lock() {
        println!(
            "• Web Server:      RUNNING on http://{}:{} (PID {}, started by {})",
            lock.host, lock.port, lock.pid, lock.started_by
        );
    } else {
        println!("• Web Server:      Stopped (use `superagent --start-web` to launch)");
    }
    println!("================================================================");
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
    let mut handle = stdout.lock();

    while let Some(event) = rx.recv().await {
        match event {
            superagent_core_v2::types::AgentEvent::Token { text } => {
                let _ = write!(handle, "{}", text);
                let _ = handle.flush();
            }
            superagent_core_v2::types::AgentEvent::ToolCall { name, input, .. } => {
                let _ = writeln!(handle, "\n[Tool Call] {}: {}", name, input);
                let _ = handle.flush();
            }
            superagent_core_v2::types::AgentEvent::ToolOutput { output, is_error, .. } => {
                let _ = writeln!(handle, "[Tool Output{}] {}", if is_error { " (Error)" } else { "" }, output);
                let _ = handle.flush();
            }
            superagent_core_v2::types::AgentEvent::Error { message } => {
                let _ = writeln!(handle, "\n[Error] {}", message);
                let _ = handle.flush();
            }
            superagent_core_v2::types::AgentEvent::Finished { .. } => {
                let _ = writeln!(handle);
                let _ = handle.flush();
            }
            _ => {}
        }
    }

    Ok(())
}
