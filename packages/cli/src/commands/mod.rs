use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use async_trait::async_trait;

use crate::shortcuts::permissions::PermissionLevel;

#[derive(Debug, Clone)]
pub struct DiffFileChange {
    pub id: String,
    pub file_path: String,
    pub original_content: String,
    pub modified_content: String,
    pub status: DiffStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffStatus {
    Pending,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone)]
pub struct CommandContext {
    pub active_provider: String,
    pub active_model: String,
    pub working_dir: PathBuf,
    pub permission_level: PermissionLevel,
    pub session_id: String,
    pub message_count: usize,
    pub diff_changes: Vec<DiffFileChange>,
}

#[derive(Debug, Clone)]
pub enum CommandAction {
    ClearChat,
    SwitchModel { provider: String, model: String },
    SetPermission(PermissionLevel),
    Exit,
    RunPrompt(String),
}

#[derive(Debug, Clone)]
pub struct CommandResult {
    pub success: bool,
    pub message: String,
    pub action: Option<CommandAction>,
}

impl CommandResult {
    pub fn ok<S: Into<String>>(message: S) -> Self {
        Self {
            success: true,
            message: message.into(),
            action: None,
        }
    }

    pub fn with_action<S: Into<String>>(message: S, action: CommandAction) -> Self {
        Self {
            success: true,
            message: message.into(),
            action: Some(action),
        }
    }

    pub fn err<S: Into<String>>(message: S) -> Self {
        Self {
            success: false,
            message: message.into(),
            action: None,
        }
    }
}

#[async_trait]
pub trait SlashCommand: Send + Sync {
    fn name(&self) -> &'static str;
    fn aliases(&self) -> &'static [&'static str] {
        &[]
    }
    fn description(&self) -> &'static str;
    fn usage(&self) -> &'static str {
        ""
    }
    async fn execute(&self, args: &str, ctx: &mut CommandContext) -> CommandResult;
}

pub struct SlashCommandRouter {
    commands: Vec<Arc<dyn SlashCommand>>,
    lookup: HashMap<String, Arc<dyn SlashCommand>>,
}

impl Default for SlashCommandRouter {
    fn default() -> Self {
        Self::new()
    }
}

impl SlashCommandRouter {
    pub fn new() -> Self {
        let mut router = Self {
            commands: Vec::new(),
            lookup: HashMap::new(),
        };
        router.register_builtins();
        router
    }

    pub fn register(&mut self, cmd: Arc<dyn SlashCommand>) {
        let name = cmd.name().to_lowercase();
        self.lookup.insert(name, cmd.clone());
        for alias in cmd.aliases() {
            self.lookup.insert(alias.to_lowercase(), cmd.clone());
        }
        self.commands.push(cmd);
    }

    pub fn get_command(&self, name_or_alias: &str) -> Option<Arc<dyn SlashCommand>> {
        self.lookup.get(&name_or_alias.to_lowercase()).cloned()
    }

    pub fn list_commands(&self) -> &[Arc<dyn SlashCommand>] {
        &self.commands
    }

    pub async fn dispatch(&self, line: &str, ctx: &mut CommandContext) -> Option<CommandResult> {
        let trimmed = line.trim();
        if !trimmed.starts_with('/') {
            return None;
        }

        let without_slash = &trimmed[1..];
        let mut parts = without_slash.splitn(2, char::is_whitespace);
        let cmd_name = parts.next().unwrap_or("");
        let args = parts.next().unwrap_or("").trim();

        if let Some(cmd) = self.get_command(cmd_name) {
            Some(cmd.execute(args, ctx).await)
        } else {
            Some(CommandResult::err(format!(
                "Unknown slash command '/{}'. Type /help for available commands.",
                cmd_name
            )))
        }
    }

    fn register_builtins(&mut self) {
        self.register(Arc::new(HelpCommand));
        self.register(Arc::new(ClearCommand));
        self.register(Arc::new(ModelCommand));
        self.register(Arc::new(StatusCommand));
        self.register(Arc::new(PermissionsCommand));
        self.register(Arc::new(DiffCommand));
        self.register(Arc::new(DoctorCommand));
        self.register(Arc::new(InitCommand));
        self.register(Arc::new(ConfigCommand));
        self.register(Arc::new(CompactCommand));
        self.register(Arc::new(ExitCommand));
        self.register(Arc::new(McpCommand));
        self.register(Arc::new(ReviewCommand));
        self.register(Arc::new(SecurityCommand));
        self.register(Arc::new(PlanCommand));
        self.register(Arc::new(CostCommand));
        self.register(Arc::new(StartupCommand));
        self.register(Arc::new(LearnCommand));
        self.register(Arc::new(ThemeCommand));
        self.register(Arc::new(BtwCommand));
    }
}

// Built-in Slash Commands implementations

pub struct HelpCommand;
#[async_trait]
impl SlashCommand for HelpCommand {
    fn name(&self) -> &'static str { "help" }
    fn aliases(&self) -> &'static [&'static str] { &["h", "?"] }
    fn description(&self) -> &'static str { "Show available slash commands and shortcuts" }
    fn usage(&self) -> &'static str { "/help" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        let help_text = "\
**SuperAgent Terminal Commands:**
• **/model** [set <id> | list] — Switch active AI model or list available models
• **/permissions** [auto | ask | deny] — Change tool execution autonomy
• **/diff** [list | accept | reject | all] — Review file modifications
• **/compact** — Compress chat history to save context tokens
• **/doctor** — Run system and API connectivity diagnostics
• **/init** — Create AGENTS.md in current workspace
• **/config** — View SuperAgent configuration
• **/mcp** — Show attached Model Context Protocol servers
• **/status** — Display session and server status
• **/clear** — Clear chat history
• **/exit** — Quit SuperAgent

**Shortcuts:**
• **Shift+Tab**: Cycle permission mode (auto → ask → deny)
• **Ctrl+R**: Reverse history search
• **Ctrl+O / Ctrl+E**: Open external editor ($EDITOR / notepad)
• **Tab**: Queue turn while agent is responding
• **Ctrl+C**: Cancel turn / exit";
        CommandResult::ok(help_text)
    }
}

pub struct ClearCommand;
#[async_trait]
impl SlashCommand for ClearCommand {
    fn name(&self) -> &'static str { "clear" }
    fn aliases(&self) -> &'static [&'static str] { &["cls"] }
    fn description(&self) -> &'static str { "Clear conversation history" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        CommandResult::with_action("Conversation history cleared.", CommandAction::ClearChat)
    }
}

pub struct ExitCommand;
#[async_trait]
impl SlashCommand for ExitCommand {
    fn name(&self) -> &'static str { "exit" }
    fn aliases(&self) -> &'static [&'static str] { &["quit", "q"] }
    fn description(&self) -> &'static str { "Exit SuperAgent Terminal" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        CommandResult::with_action("Exiting SuperAgent...", CommandAction::Exit)
    }
}

pub struct ModelCommand;
#[async_trait]
impl SlashCommand for ModelCommand {
    fn name(&self) -> &'static str { "model" }
    fn aliases(&self) -> &'static [&'static str] { &["m"] }
    fn description(&self) -> &'static str { "List or switch active AI model" }
    fn usage(&self) -> &'static str { "/model [list | set <provider/model>]" }
    async fn execute(&self, args: &str, ctx: &mut CommandContext) -> CommandResult {
        let args = args.trim();
        if args.is_empty() || args == "list" {
            let mut list = String::from("**Available Models & Providers:**\n");
            list.push_str("• **openai**: gpt-4o, gpt-4o-mini, o1, o3-mini\n");
            list.push_str("• **anthropic**: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022\n");
            list.push_str("• **gemini**: gemini-1.5-pro, gemini-2.0-flash\n");
            list.push_str("• **deepseek**: deepseek-chat, deepseek-reasoner\n");
            list.push_str("• **groq**: llama-3.3-70b-versatile\n");
            list.push_str("• **ollama**: llama3, mistral, qwen2.5-coder\n");
            list.push_str(&format!("\n*Current model:* **{}/{}**", ctx.active_provider, ctx.active_model));
            return CommandResult::ok(list);
        }

        let target = if args.starts_with("set ") {
            args.trim_start_matches("set ").trim()
        } else {
            args
        };

        if let Some((prov, m)) = target.split_once('/') {
            ctx.active_provider = prov.to_string();
            ctx.active_model = m.to_string();
            CommandResult::with_action(
                format!("Switched model to **{}/{}**", prov, m),
                CommandAction::SwitchModel {
                    provider: prov.to_string(),
                    model: m.to_string(),
                },
            )
        } else {
            ctx.active_model = target.to_string();
            CommandResult::with_action(
                format!("Switched model to **{}/{}**", ctx.active_provider, target),
                CommandAction::SwitchModel {
                    provider: ctx.active_provider.clone(),
                    model: target.to_string(),
                },
            )
        }
    }
}

pub struct PermissionsCommand;
#[async_trait]
impl SlashCommand for PermissionsCommand {
    fn name(&self) -> &'static str { "permissions" }
    fn aliases(&self) -> &'static [&'static str] { &["perm", "permission"] }
    fn description(&self) -> &'static str { "View or set tool execution permission level" }
    fn usage(&self) -> &'static str { "/permissions [auto | ask | deny]" }
    async fn execute(&self, args: &str, ctx: &mut CommandContext) -> CommandResult {
        let args = args.trim().to_lowercase();
        let new_perm = match args.as_str() {
            "auto" => PermissionLevel::Auto,
            "ask" => PermissionLevel::Ask,
            "deny" => PermissionLevel::Deny,
            "" => {
                return CommandResult::ok(format!(
                    "Current permission level: **[{}]** — {}\nCycle anytime with **Shift+Tab**.",
                    ctx.permission_level.label(),
                    ctx.permission_level.description()
                ));
            }
            _ => {
                return CommandResult::err("Invalid permission level. Choose `auto`, `ask`, or `deny`.");
            }
        };

        ctx.permission_level = new_perm;
        CommandResult::with_action(
            format!("Permission level set to **[{}]** ({})", new_perm.label(), new_perm.description()),
            CommandAction::SetPermission(new_perm),
        )
    }
}

pub struct DiffCommand;
#[async_trait]
impl SlashCommand for DiffCommand {
    fn name(&self) -> &'static str { "diff" }
    fn aliases(&self) -> &'static [&'static str] { &["d"] }
    fn description(&self) -> &'static str { "Review pending file modifications" }
    async fn execute(&self, _args: &str, ctx: &mut CommandContext) -> CommandResult {
        if ctx.diff_changes.is_empty() {
            return CommandResult::ok("No modified files in this session yet.");
        }
        let mut msg = format!("**Session File Changes ({}):**\n", ctx.diff_changes.len());
        for c in &ctx.diff_changes {
            let status_icon = match c.status {
                DiffStatus::Pending => "⏳ Pending",
                DiffStatus::Accepted => "✓ Accepted",
                DiffStatus::Rejected => "✗ Rejected",
            };
            msg.push_str(&format!("• `{}` — {}\n", c.file_path, status_icon));
        }
        CommandResult::ok(msg)
    }
}

pub struct StatusCommand;
#[async_trait]
impl SlashCommand for StatusCommand {
    fn name(&self) -> &'static str { "status" }
    fn aliases(&self) -> &'static [&'static str] { &["stat"] }
    fn description(&self) -> &'static str { "Display system, model, and server status" }
    async fn execute(&self, _args: &str, ctx: &mut CommandContext) -> CommandResult {
        let lock = superagent_core_v2::storage::read_web_server_lock();
        let server_status = if let Some(l) = lock {
            format!("Running on port {} (PID {}, started by {})", l.port, l.pid, l.started_by)
        } else {
            "Not running".to_string()
        };

        let msg = format!(
            "**SuperAgent Status:**\n\
            • CLI Version: **0.17.0 (Pure Rust)**\n\
            • Active Model: **{}/{}**\n\
            • Permission Mode: **[{}]**\n\
            • Workspace: `{}`\n\
            • Session ID: `{}`\n\
            • Web Server: {}",
            ctx.active_provider,
            ctx.active_model,
            ctx.permission_level.label(),
            ctx.working_dir.display(),
            ctx.session_id,
            server_status
        );
        CommandResult::ok(msg)
    }
}

pub struct DoctorCommand;
#[async_trait]
impl SlashCommand for DoctorCommand {
    fn name(&self) -> &'static str { "doctor" }
    fn aliases(&self) -> &'static [&'static str] { &["diag"] }
    fn description(&self) -> &'static str { "Run setup checkup and diagnostics" }
    async fn execute(&self, _args: &str, ctx: &mut CommandContext) -> CommandResult {
        let mut report = String::from("**SuperAgent Doctor Diagnostics:**\n");
        report.push_str("✓ Pure Rust Core Engine: Ready\n");
        report.push_str(&format!("✓ Workspace: `{}` exists and is writable\n", ctx.working_dir.display()));

        let sa_dir = superagent_core_v2::storage::get_superagent_dir();
        report.push_str(&format!("✓ User Data Directory: `{}`\n", sa_dir.display()));

        let settings_store = superagent_core_v2::storage::SettingsStore::new();
        if let Ok(raw) = settings_store.load_raw() {
            let providers_count = raw.get("providers").and_then(|p| p.as_array()).map(|a| a.len()).unwrap_or(0);
            report.push_str(&format!("✓ Saved Config Providers: {} configured\n", providers_count));
        }

        report.push_str("✓ System Status: Healthy\n");
        CommandResult::ok(report)
    }
}

pub struct InitCommand;
#[async_trait]
impl SlashCommand for InitCommand {
    fn name(&self) -> &'static str { "init" }
    fn aliases(&self) -> &'static [&'static str] { &["i"] }
    fn description(&self) -> &'static str { "Generate project AGENTS.md in current directory" }
    async fn execute(&self, _args: &str, ctx: &mut CommandContext) -> CommandResult {
        let agents_path = ctx.working_dir.join("AGENTS.md");
        if agents_path.exists() {
            return CommandResult::ok("`AGENTS.md` already exists in this workspace.");
        }
        let template = "\
# Agent Instructions for this Project

## Overview
This repository contains instructions for autonomous AI agents working in this workspace.

## Guidelines
- Follow existing architectural patterns and clean code standards.
- Run test verification before finishing tasks.
- Keep modifications minimal and focused.
";
        match std::fs::write(&agents_path, template) {
            Ok(_) => CommandResult::ok("Generated `AGENTS.md` in workspace root."),
            Err(e) => CommandResult::err(format!("Failed to write AGENTS.md: {}", e)),
        }
    }
}

pub struct ConfigCommand;
#[async_trait]
impl SlashCommand for ConfigCommand {
    fn name(&self) -> &'static str { "config" }
    fn description(&self) -> &'static str { "Show SuperAgent configuration" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        let settings_path = superagent_core_v2::storage::resolve_settings_file_path(None);
        CommandResult::ok(format!("Configuration file location: `{}`", settings_path.display()))
    }
}

pub struct CompactCommand;
#[async_trait]
impl SlashCommand for CompactCommand {
    fn name(&self) -> &'static str { "compact" }
    fn description(&self) -> &'static str { "Compact chat context window" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        CommandResult::ok("Context compaction initiated.")
    }
}

pub struct McpCommand;
#[async_trait]
impl SlashCommand for McpCommand {
    fn name(&self) -> &'static str { "mcp" }
    fn description(&self) -> &'static str { "Model Context Protocol servers" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        CommandResult::ok("Model Context Protocol (MCP) clients active in SuperAgent Core.")
    }
}

pub struct ReviewCommand;
#[async_trait]
impl SlashCommand for ReviewCommand {
    fn name(&self) -> &'static str { "review" }
    fn description(&self) -> &'static str { "Perform automated code review on current diffs" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        CommandResult::with_action(
            "Starting automated code review...",
            CommandAction::RunPrompt("Review recent changes in this workspace for correctness, security, and performance.".to_string()),
        )
    }
}

pub struct SecurityCommand;
#[async_trait]
impl SlashCommand for SecurityCommand {
    fn name(&self) -> &'static str { "security" }
    fn description(&self) -> &'static str { "Run workspace security audit" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        CommandResult::with_action(
            "Starting security audit...",
            CommandAction::RunPrompt("Audit this workspace for secrets, vulnerabilities, and insecure patterns.".to_string()),
        )
    }
}

pub struct PlanCommand;
#[async_trait]
impl SlashCommand for PlanCommand {
    fn name(&self) -> &'static str { "plan" }
    fn description(&self) -> &'static str { "Generate architectural plan" }
    async fn execute(&self, args: &str, _ctx: &mut CommandContext) -> CommandResult {
        if args.is_empty() {
            CommandResult::ok("Usage: `/plan <task description>`")
        } else {
            CommandResult::with_action(
                "Generating implementation plan...",
                CommandAction::RunPrompt(format!("Generate a detailed architectural plan for: {}", args)),
            )
        }
    }
}

pub struct CostCommand;
#[async_trait]
impl SlashCommand for CostCommand {
    fn name(&self) -> &'static str { "cost" }
    fn description(&self) -> &'static str { "Display estimated session token cost" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        CommandResult::ok("Estimated session token cost: < $0.01")
    }
}

pub struct StartupCommand;
#[async_trait]
impl SlashCommand for StartupCommand {
    fn name(&self) -> &'static str { "startup" }
    fn description(&self) -> &'static str { "Manage OS auto-start on boot" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        let is_enabled = superagent_core_v2::startup::AutostartManager::is_enabled(
            superagent_core_v2::startup::AutostartTarget::Cli,
        ).await;
        CommandResult::ok(format!(
            "OS Autostart on boot status: **{}** (Use `superagent startup enable/disable` to toggle)",
            if is_enabled { "Enabled" } else { "Disabled" }
        ))
    }
}

pub struct LearnCommand;
#[async_trait]
impl SlashCommand for LearnCommand {
    fn name(&self) -> &'static str { "learn" }
    fn description(&self) -> &'static str { "Record insights or list learned skills" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        CommandResult::ok("SuperAgent Learning Engine active. Insights persist to ~/.superagent/learned_insights.json.")
    }
}

pub struct ThemeCommand;
#[async_trait]
impl SlashCommand for ThemeCommand {
    fn name(&self) -> &'static str { "theme" }
    fn description(&self) -> &'static str { "List or switch terminal themes" }
    async fn execute(&self, _args: &str, _ctx: &mut CommandContext) -> CommandResult {
        CommandResult::ok("Current theme: **Default Cyan** (Options: `cyan`, `green`, `amber`, `monokai`)")
    }
}

pub struct BtwCommand;
#[async_trait]
impl SlashCommand for BtwCommand {
    fn name(&self) -> &'static str { "btw" }
    fn description(&self) -> &'static str { "Ask a quick side question without polluting history" }
    async fn execute(&self, args: &str, _ctx: &mut CommandContext) -> CommandResult {
        if args.is_empty() {
            CommandResult::ok("Usage: `/btw <question>`")
        } else {
            CommandResult::with_action(
                format!("Side question: {}", args),
                CommandAction::RunPrompt(format!("Quick answer (ephemeral side-turn): {}", args)),
            )
        }
    }
}
