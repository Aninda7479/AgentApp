use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use superagent_core_v2::orchestrator::AgentEngine;
use superagent_core_v2::tools::builtin::{GrepSearchTool, ReadFileTool, RunCommandTool, WriteFileTool};
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

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing subscriber for logging
    tracing_subscriber::fmt::init();

    let args: Vec<String> = std::env::args().collect();
    let request = parse_request(&args)?;

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
    registry.register(RunCommandTool::new(workspace_root.clone()));
    registry.register(GrepSearchTool::new(workspace_root.clone()));

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

    Ok(())
}

/// Parses CLI flags or stdin JSON payload into an `AgentRunRequest`.
fn parse_request(args: &[String]) -> Result<AgentRunRequest> {
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
                println!("    superagent-core-daemon --prompt <PROMPT> [OPTIONS]");
                println!("    superagent-core-daemon --json '<JSON_STRING>'");
                println!("    cat request.json | superagent-core-daemon");
                println!();
                println!("OPTIONS:");
                println!("    -p, --prompt <PROMPT>       User prompt instruction for the agent");
                println!("    -s, --system <SYSTEM>       Optional system prompt");
                println!("    --provider <PROVIDER>       openai | anthropic | gemini | ollama | openrouter | deepseek | groq");
                println!("    -m, --model <MODEL_ID>      Model ID (e.g. gpt-4o, claude-3-5-sonnet-20241022, gemini-1.5-pro)");
                println!("    --api-key <KEY>             API key override");
                println!("    --base-url <URL>            API base URL override");
                println!("    -w, --workspace <PATH>      Workspace root directory");
                println!("    --json <JSON_STRING>        JSON payload string matching AgentRunRequest");
                println!("    -h, --help                  Print help information");
                std::process::exit(0);
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

    if let Some(raw) = json_raw {
        let req: AgentRunRequest = serde_json::from_str(&raw)?;
        return Ok(req);
    }

    if let Some(prompt) = user_prompt {
        let provider = provider_str.and_then(|p| {
            serde_json::from_value::<ProviderType>(serde_json::Value::String(p.to_lowercase())).ok()
        });

        return Ok(AgentRunRequest {
            provider,
            model_id,
            api_key,
            base_url,
            temperature: None,
            max_tokens: None,
            system_prompt,
            user_prompt: prompt,
            working_dir,
        });
    }

    Err(anyhow!(
        "No prompt or request provided. Run 'superagent-core-daemon --help' for usage instructions."
    ))
}
