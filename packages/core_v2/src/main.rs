use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;

use serde::{Deserialize, Serialize};

use superagent_core_v2::orchestrator::AgentEngine;
use superagent_core_v2::server::start_server;
use superagent_core_v2::tools::builtin::{
    EditFileTool, GrepSearchTool, ListDirTool, ReadFileTool, RunCommandTool, WriteFileTool,
};
use superagent_core_v2::tools::ToolRegistry;
use superagent_core_v2::types::{ModelConfig, ProviderType};

/// Incoming JSON payload structure for agent execution requests.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRunRequest {
    pub provider: Option<ProviderType>,
    pub model_id: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<usize>,
    pub system_prompt: Option<String>,
    pub user_prompt: String,
    pub working_dir: Option<String>,
}

pub enum CliMode {
    Server {
        port: u16,
        host: String,
        workspace_root: PathBuf,
        ui_dir: Option<PathBuf>,
    },
    Run(AgentRunRequest),
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let args: Vec<String> = std::env::args().collect();
    let mode = parse_cli_mode(&args)?;

    match mode {
        CliMode::Server {
            port,
            host,
            workspace_root,
            ui_dir,
        } => {
            println!("================================================================");
            println!("🚀 SuperAgent Core v2 Daemon ignited at: http://{}:{}", if host == "0.0.0.0" { "localhost" } else { &host }, port);
            println!("⚡ Mode: Native Rust Axum Async Engine");
            println!("📂 Workspace: {}", workspace_root.display());
            if let Some(ref d) = ui_dir {
                println!("🌐 Static UI Bundle: {}", d.display());
            }
            println!("================================================================");

            start_server(port, &host, workspace_root, ui_dir).await?;
        }
        CliMode::Run(request) => {
            let provider = request.provider.unwrap_or(ProviderType::OpenAI);
            let model_id = request
                .model_id
                .unwrap_or_else(|| match provider {
                    ProviderType::Anthropic => "claude-3-5-sonnet-20241022".to_string(),
                    ProviderType::Gemini => "gemini-1.5-pro".to_string(),
                    ProviderType::Ollama => "llama3".to_string(),
                    _ => "gpt-4o".to_string(),
                });

            let mut model_config = ModelConfig::new(provider, model_id);
            model_config.api_key = request.api_key.or_else(|| match model_config.provider {
                ProviderType::OpenAI => std::env::var("OPENAI_API_KEY").ok(),
                ProviderType::Anthropic => std::env::var("ANTHROPIC_API_KEY").ok(),
                ProviderType::Gemini => std::env::var("GEMINI_API_KEY").ok(),
                ProviderType::OpenRouter => std::env::var("OPENROUTER_API_KEY").ok(),
                ProviderType::DeepSeek => std::env::var("DEEPSEEK_API_KEY").ok(),
                ProviderType::Groq => std::env::var("GROQ_API_KEY").ok(),
                _ => None,
            });
            model_config.base_url = request.base_url;
            model_config.temperature = request.temperature;
            model_config.max_tokens = request.max_tokens;

            let workspace_root = request
                .working_dir
                .map(PathBuf::from)
                .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

            // Register built-in workspace tools
            let mut registry = ToolRegistry::new();
            registry.register(ReadFileTool::new(workspace_root.clone()));
            registry.register(WriteFileTool::new(workspace_root.clone()));
            registry.register(EditFileTool::new(workspace_root.clone()));
            registry.register(ListDirTool::new(workspace_root.clone()));
            registry.register(RunCommandTool::new(workspace_root.clone()));
            registry.register(GrepSearchTool::new(workspace_root.clone()));

            // Multimodal Media Generation Tools
            registry.register(superagent_core_v2::media::GeneratePdfTool::new(workspace_root.clone()));
            registry.register(superagent_core_v2::media::GeneratePresentationTool::new(workspace_root.clone()));

            // Browser Automation & Search Tools
            registry.register(superagent_core_v2::automation::BrowserNavigateTool::new());
            registry.register(superagent_core_v2::automation::BrowserScreenshotTool::new(workspace_root.clone()));
            registry.register(superagent_core_v2::automation::WebSearchTool::new());

            let engine = AgentEngine::new(Arc::new(registry));

            let system_prompt = request.system_prompt.unwrap_or_default();

            let mut rx = engine
                .run_loop(&model_config, &system_prompt, &request.user_prompt)
                .await?;

            let stdout = io::stdout();
            let mut handle = stdout.lock();

            while let Some(event) = rx.recv().await {
                if let Ok(json_line) = serde_json::to_string(&event) {
                    let _ = writeln!(handle, "{}", json_line);
                    let _ = handle.flush();
                }
            }
        }
    }

    Ok(())
}

/// Parses CLI flags into `CliMode`.
fn parse_cli_mode(args: &[String]) -> Result<CliMode> {
    let mut is_server = false;
    let mut server_port: u16 = 1469;
    let mut server_host = String::from("0.0.0.0");
    let mut ui_dir = None;
    let mut user_prompt = None;
    let mut system_prompt = None;
    let mut provider_str = None;
    let mut model_id = None;
    let mut api_key = None;
    let mut base_url = None;
    let mut json_raw = None;
    let mut working_dir = None;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "-h" | "--help" => {
                println!("SuperAgent Core v2 Daemon");
                println!();
                println!("USAGE:");
                println!("    superagent-core-daemon --server [--port 1469] [--host 0.0.0.0] [--ui-dir <PATH>]");
                println!("    superagent-core-daemon --prompt <PROMPT> [OPTIONS]");
                println!("    superagent-core-daemon --json '<JSON_STRING>'");
                println!();
                println!("OPTIONS:");
                println!("    -d, --server, --daemon      Run as background HTTP/WebSocket daemon");
                println!("    --port <PORT>               Port for the server (default: 1469)");
                println!("    --host <HOST>               Host IP to bind to (default: 0.0.0.0)");
                println!("    --ui-dir <PATH>             Path to compiled static UI directory");
                println!("    --no-auth                   Disable authentication gate");
                println!("    -p, --prompt <PROMPT>       User prompt instruction for one-shot execution");
                println!("    -s, --system <SYSTEM>       Optional system prompt");
                println!("    --provider <PROVIDER>       openai | anthropic | gemini | ollama | openrouter | deepseek | groq");
                println!("    -m, --model <MODEL_ID>      Model ID (e.g. gpt-4o, claude-3-5-sonnet-20241022)");
                println!("    --api-key <KEY>             API key override");
                println!("    --base-url <URL>            API base URL override");
                println!("    -w, --workspace <PATH>      Workspace root directory");
                println!("    --json <JSON_STRING>        JSON payload string matching AgentRunRequest");
                println!("    -h, --help                  Print help information");
                std::process::exit(0);
            }
            "--server" | "--daemon" | "-d" => {
                is_server = true;
            }
            "--port" => {
                if i + 1 < args.len() {
                    if let Ok(p) = args[i + 1].parse::<u16>() {
                        server_port = p;
                    }
                    i += 1;
                }
            }
            "--host" => {
                if i + 1 < args.len() {
                    server_host = args[i + 1].clone();
                    i += 1;
                }
            }
            "--ui-dir" => {
                if i + 1 < args.len() {
                    ui_dir = Some(PathBuf::from(&args[i + 1]));
                    i += 1;
                }
            }
            "--no-auth" => {
                std::env::set_var("SUPERAGENT_DISABLE_AUTH", "true");
            }
            "--json" => {
                if i + 1 < args.len() {
                    json_raw = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            "-p" | "--prompt" => {
                if i + 1 < args.len() {
                    user_prompt = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            "-s" | "--system" => {
                if i + 1 < args.len() {
                    system_prompt = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            "--provider" => {
                if i + 1 < args.len() {
                    provider_str = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            "-m" | "--model" => {
                if i + 1 < args.len() {
                    model_id = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            "--api-key" => {
                if i + 1 < args.len() {
                    api_key = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            "--base-url" => {
                if i + 1 < args.len() {
                    base_url = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            "-w" | "--workspace" => {
                if i + 1 < args.len() {
                    working_dir = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }

    let workspace = working_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    if is_server {
        return Ok(CliMode::Server {
            port: server_port,
            host: server_host,
            workspace_root: workspace,
            ui_dir,
        });
    }

    if let Some(raw) = json_raw {
        let req: AgentRunRequest = serde_json::from_str(&raw)?;
        return Ok(CliMode::Run(req));
    }

    if let Some(prompt) = user_prompt {
        let provider = provider_str.and_then(|p| {
            serde_json::from_value::<ProviderType>(serde_json::Value::String(p.to_lowercase())).ok()
        });

        return Ok(CliMode::Run(AgentRunRequest {
            provider,
            model_id,
            api_key,
            base_url,
            temperature: None,
            max_tokens: None,
            system_prompt,
            user_prompt: prompt,
            working_dir: Some(workspace.to_string_lossy().to_string()),
        }));
    }

    // Default to daemon server mode if no prompt provided
    Ok(CliMode::Server {
        port: server_port,
        host: server_host,
        workspace_root: workspace,
        ui_dir,
    })
}

