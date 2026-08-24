use std::path::PathBuf;
use clap::{Args, Parser, Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};

#[derive(Parser, Debug, Clone)]
#[command(
    name = "superagent",
    about = "SuperAgent Terminal CLI & TUI — Pure Rust Native Application",
    version = "0.17.0",
    arg_required_else_help = false
)]
pub struct Cli {
    /// List all available model IDs for easy copying
    #[arg(long)]
    pub models: bool,

    /// Start the SuperAgent web server (same as `npm start:web`)
    #[arg(long, visible_alias = "serve")]
    pub start_web: bool,

    /// Stop the running SuperAgent web server
    #[arg(long)]
    pub stop_web: bool,

    /// Print whether the SuperAgent web server is running, and who started it
    #[arg(long)]
    pub web_status: bool,

    /// Print full SuperAgent system status
    #[arg(long)]
    pub status: bool,

    /// Port for the web server when using --start-web / --serve
    #[arg(long, visible_alias = "serve-port", default_value = "1469")]
    pub web_port: u16,

    /// Run as background HTTP/WebSocket daemon
    #[arg(short = 'd', long, visible_alias = "daemon")]
    pub server: bool,

    /// Host IP to bind to for daemon/server mode
    #[arg(long, default_value = "0.0.0.0")]
    pub host: String,

    /// Path to compiled static UI directory
    #[arg(long)]
    pub ui_dir: Option<PathBuf>,

    /// Disable authentication gate for the server
    #[arg(long)]
    pub no_auth: bool,

    /// Optional system prompt
    #[arg(short = 's', long)]
    pub system: Option<String>,

    /// API key override
    #[arg(long)]
    pub api_key: Option<String>,

    /// API base URL override
    #[arg(long)]
    pub base_url: Option<String>,

    /// Workspace root directory
    #[arg(short = 'w', long)]
    pub workspace: Option<PathBuf>,

    /// JSON payload string matching AgentRunRequest
    #[arg(long)]
    pub json: Option<String>,

    /// Specific subcommand to run
    #[command(subcommand)]
    pub command: Option<Commands>,

    /// Default interactive chat or one-shot prompt arguments (when no subcommand given)
    #[command(flatten)]
    pub chat: ChatArgs,
}

#[derive(Args, Debug, Clone, Default)]
pub struct ChatArgs {
    /// Positional user prompt instruction for one-shot execution
    pub prompt: Option<String>,

    /// Run a single prompt and exit (alias for positional prompt)
    #[arg(long)]
    pub chat: Option<String>,

    /// Specify AI provider (openai, anthropic, gemini, ollama, openrouter, deepseek, groq)
    #[arg(short = 'p', long)]
    pub provider: Option<String>,

    /// Specify model identifier
    #[arg(short = 'm', long)]
    pub model: Option<String>,

    /// Specify API key
    #[arg(short = 'k', long)]
    pub key: Option<String>,

    /// Enable verbose output
    #[arg(short = 'v', long, default_value_t = false)]
    pub verbose: bool,

    /// Execution permission level (ask, auto, deny)
    #[arg(long, default_value = "auto")]
    pub permission: PermissionLevelArg,

    /// Start interactive TUI session
    #[arg(short = 'i', long, default_value_t = true)]
    pub interactive: bool,

    /// Resume a previous session by its ID
    #[arg(long)]
    pub resume: Option<String>,
}

#[derive(Subcommand, Debug, Clone)]
pub enum Commands {
    /// Start interactive terminal chat session or execute single prompt
    Chat(ChatArgs),

    /// Display SuperAgent CLI version, web server status & port, and connected devices
    Status,

    /// Manage OS auto-start on boot (enable, disable, status)
    Startup {
        /// Action to perform: enable, disable, or status
        #[arg(default_value = "status")]
        action: String,

        /// Target Desktop application instead of CLI server
        #[arg(long, default_value_t = false)]
        desktop: bool,

        /// Custom port for CLI server
        #[arg(long, default_value = "1469")]
        port: u16,
    },

    /// Update the SuperAgent CLI to the latest version
    Update {
        /// Check for a newer version without installing
        #[arg(short = 'c', long, default_value_t = false)]
        check: bool,
    },

    /// Execute a standalone prompt or script
    Exec {
        /// Prompt instruction to execute
        #[arg(short = 'p', long)]
        prompt: Option<String>,

        /// Path to script file to execute
        #[arg(short = 'f', long)]
        file: Option<PathBuf>,
    },
}

#[derive(ValueEnum, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PermissionLevelArg {
    #[default]
    Auto,
    Ask,
    Deny,
}

impl std::fmt::Display for PermissionLevelArg {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PermissionLevelArg::Auto => write!(f, "auto"),
            PermissionLevelArg::Ask => write!(f, "ask"),
            PermissionLevelArg::Deny => write!(f, "deny"),
        }
    }
}
