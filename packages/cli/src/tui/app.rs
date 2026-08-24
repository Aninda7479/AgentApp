use std::path::PathBuf;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use superagent_core_v2::orchestrator::AgentEngine;
use superagent_core_v2::tools::builtin::{
    EditFileTool, GrepSearchTool, ListDirTool, ReadFileTool, RunCommandTool, WriteFileTool,
};
use superagent_core_v2::tools::ToolRegistry;
use superagent_core_v2::types::{AgentEvent, ModelConfig, ProviderType};

use crate::commands::SlashCommandRouter;
use crate::session::{generate_session_id, load_session, save_session, SavedMessage};
use crate::shortcuts::history_search::HistorySearch;
use crate::shortcuts::permissions::PermissionLevel;
use crate::shortcuts::queue::TurnQueueManager;
use crate::skills::{get_runnable_skills, RunnableSkill};
use crate::tui::composer::Composer;
use crate::tui::diff_viewer::DiffViewerState;
use crate::tui::model_picker::ModelPickerState;
use crate::tui::palette::CommandPaletteState;

pub const SPINNER_FRAMES: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
pub const TIPS: &[&str] = &[
    "Ask SuperAgent to create subagents for specific tasks (e.g. Software Architect, Coder).",
    "Use Shift+Tab to cycle through permission modes (auto, ask, deny).",
    "You can run /diff to review all code modifications made during the session.",
    "Connect provider API keys or switch active models using the /model command.",
    "Run commands directly or type a prompt for the autonomous agent to solve.",
    "Type /help to see all available slash commands and key shortcuts.",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Normal,
    CommandPalette,
    ModelPicker,
    DiffReview,
    HistorySearch,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
    Tool,
}

#[derive(Debug, Clone)]
pub struct ToolCallRecord {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
    pub output: Option<String>,
    pub is_error: bool,
}

#[derive(Debug, Clone)]
pub struct UiMessage {
    pub id: String,
    pub role: MessageRole,
    pub content: String,
    pub tool_calls: Vec<ToolCallRecord>,
    pub is_streaming: bool,
    pub timestamp: DateTime<Utc>,
}

pub struct AppState {
    pub messages: Vec<UiMessage>,
    pub composer: Composer,
    pub mode: Mode,
    pub permission: PermissionLevel,
    pub provider: String,
    pub model: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub workspace_root: PathBuf,
    pub session_id: String,
    pub is_busy: bool,
    pub elapsed_secs: u64,
    pub spinner_frame: usize,
    pub tip_index: usize,
    pub scroll_offset: usize,
    pub auto_scroll: bool,
    pub token_usage: (usize, usize, usize), // (prompt, completion, total)
    pub palette_state: CommandPaletteState,
    pub model_picker_state: ModelPickerState,
    pub diff_viewer_state: DiffViewerState,
    pub history_search: HistorySearch,
    pub turn_queue: TurnQueueManager,
    pub router: SlashCommandRouter,
    pub engine: Arc<AgentEngine>,
    pub should_exit: bool,
    pub skills: Vec<RunnableSkill>,
    pub start_time: Option<std::time::Instant>,
}

use superagent_core_v2::storage::SettingsStore;

impl AppState {
    pub fn new(
        provider: Option<String>,
        model: Option<String>,
        api_key: Option<String>,
        base_url: Option<String>,
        permission: PermissionLevel,
        workspace_root: PathBuf,
        resume_id: Option<String>,
    ) -> Self {
        let (prov, mod_id, key, url) = {
            let settings = SettingsStore::new().load_raw().unwrap_or_default();
            let mut p = provider;
            let mut m = model;
            let mut k = api_key;
            let mut u = base_url;

            if p.is_none() || m.is_none() {
                if let Some(last_used) = settings.get("lastUsedModel") {
                    if p.is_none() {
                        p = last_used.get("provider").and_then(|v| v.as_str()).map(|s| s.to_string());
                    }
                    if m.is_none() {
                        m = last_used.get("model").and_then(|v| v.as_str()).map(|s| s.to_string());
                    }
                }
            }

            if p.is_none() {
                if let Some(prov_arr) = settings.get("providers").and_then(|v| v.as_array()) {
                    if let Some(first_prov) = prov_arr.first() {
                        p = first_prov.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                        if m.is_none() {
                            m = first_prov.get("defaultModel").and_then(|v| v.as_str()).map(|s| s.to_string());
                        }
                        if k.is_none() {
                            k = first_prov.get("apiKey").and_then(|v| v.as_str()).map(|s| s.to_string());
                        }
                        if u.is_none() {
                            u = first_prov.get("baseUrl").and_then(|v| v.as_str()).map(|s| s.to_string());
                        }
                    }
                }
            }

            (p.unwrap_or_default(), m.unwrap_or_default(), k, u)
        };

        let session_id = resume_id.clone().unwrap_or_else(generate_session_id);

        let skills = get_runnable_skills(&workspace_root);
        let palette_state = CommandPaletteState::new(&skills);
        let model_picker_state = ModelPickerState::new();
        let diff_viewer_state = DiffViewerState::new(Vec::new());
        let history_search = HistorySearch::new(Vec::new());
        let turn_queue = TurnQueueManager::new();
        let router = SlashCommandRouter::new();

        let mut registry = ToolRegistry::new();
        registry.register(ReadFileTool::new(workspace_root.clone()));
        registry.register(WriteFileTool::new(workspace_root.clone()));
        registry.register(EditFileTool::new(workspace_root.clone()));
        registry.register(ListDirTool::new(workspace_root.clone()));
        registry.register(RunCommandTool::new(workspace_root.clone()));
        registry.register(GrepSearchTool::new(workspace_root.clone()));

        // Media & Automation tools
        registry.register(superagent_core_v2::media::GeneratePdfTool::new(workspace_root.clone()));
        registry.register(superagent_core_v2::media::GeneratePresentationTool::new(workspace_root.clone()));
        registry.register(superagent_core_v2::automation::BrowserNavigateTool::new());
        registry.register(superagent_core_v2::automation::BrowserScreenshotTool::new(workspace_root.clone()));
        registry.register(superagent_core_v2::automation::WebSearchTool::new());

        let engine = Arc::new(AgentEngine::new(Arc::new(registry)));

        let mut messages = Vec::new();

        let has_model = !prov.is_empty() && !mod_id.is_empty();
        let welcome_text = if has_model {
            format!("Welcome to SuperAgent Terminal — {}/{}. Type a prompt or / for skills.", prov, mod_id)
        } else {
            "Welcome to SuperAgent Terminal — no model selected. Type a prompt, or / for skills & commands.\n⚠ No AI provider or model is connected. Run `/model` to pick a model or `/model set <provider/model>` (e.g. `/model set ollama/qwen2.5-coder`).".to_string()
        };

        // Check if resuming existing session
        if let Some(ref res_id) = resume_id {
            if let Some(saved) = load_session(res_id) {
                for (i, msg) in saved.into_iter().enumerate() {
                    let role = match msg.role.as_str() {
                        "user" => MessageRole::User,
                        "assistant" => MessageRole::Assistant,
                        "tool" => MessageRole::Tool,
                        _ => MessageRole::System,
                    };
                    messages.push(UiMessage {
                        id: format!("res-{}", i),
                        role,
                        content: msg.content,
                        tool_calls: Vec::new(),
                        is_streaming: false,
                        timestamp: Utc::now(),
                    });
                }
                messages.push(UiMessage {
                    id: "sys-resumed".to_string(),
                    role: MessageRole::System,
                    content: format!("↺ Resumed session `{}` with {} messages.", res_id, messages.len()),
                    tool_calls: Vec::new(),
                    is_streaming: false,
                    timestamp: Utc::now(),
                });
            } else {
                messages.push(UiMessage {
                    id: "sys-welcome".to_string(),
                    role: MessageRole::System,
                    content: welcome_text,
                    tool_calls: Vec::new(),
                    is_streaming: false,
                    timestamp: Utc::now(),
                });
            }
        } else {
            messages.push(UiMessage {
                id: "sys-welcome".to_string(),
                role: MessageRole::System,
                content: welcome_text,
                tool_calls: Vec::new(),
                is_streaming: false,
                timestamp: Utc::now(),
            });
        }

        Self {
            messages,
            composer: Composer::new(),
            mode: Mode::Normal,
            permission,
            provider: prov,
            model: mod_id,
            api_key: key,
            base_url: url,
            workspace_root,
            session_id,
            is_busy: false,
            elapsed_secs: 0,
            spinner_frame: 0,
            tip_index: 0,
            scroll_offset: 0,
            auto_scroll: true,
            token_usage: (0, 0, 0),
            palette_state,
            model_picker_state,
            diff_viewer_state,
            history_search,
            turn_queue,
            router,
            engine,
            should_exit: false,
            skills,
            start_time: None,
        }
    }

    pub fn tick(&mut self) {
        if self.is_busy {
            self.spinner_frame = (self.spinner_frame + 1) % SPINNER_FRAMES.len();
            if let Some(start) = self.start_time {
                self.elapsed_secs = start.elapsed().as_secs();
                if self.elapsed_secs > 0 && self.elapsed_secs % 6 == 0 {
                    self.tip_index = ((self.elapsed_secs / 6) as usize) % TIPS.len();
                }
            }
        }
    }

    pub fn add_user_message(&mut self, text: String) {
        self.messages.push(UiMessage {
            id: format!("user-{}", uuid::Uuid::new_v4()),
            role: MessageRole::User,
            content: text,
            tool_calls: Vec::new(),
            is_streaming: false,
            timestamp: Utc::now(),
        });
        self.persist_session();
    }

    pub fn add_system_message(&mut self, text: String) {
        self.messages.push(UiMessage {
            id: format!("sys-{}", uuid::Uuid::new_v4()),
            role: MessageRole::System,
            content: text,
            tool_calls: Vec::new(),
            is_streaming: false,
            timestamp: Utc::now(),
        });
    }

    pub fn start_assistant_turn(&mut self) {
        self.is_busy = true;
        self.start_time = Some(std::time::Instant::now());
        self.elapsed_secs = 0;
        self.messages.push(UiMessage {
            id: format!("asst-{}", uuid::Uuid::new_v4()),
            role: MessageRole::Assistant,
            content: String::new(),
            tool_calls: Vec::new(),
            is_streaming: true,
            timestamp: Utc::now(),
        });
    }

    pub fn finish_assistant_turn(&mut self) {
        if let Some(last) = self.messages.last_mut() {
            if last.role == MessageRole::Assistant {
                last.is_streaming = false;
            }
        }
        self.is_busy = false;
        self.start_time = None;
        self.persist_session();
    }

    pub fn handle_agent_event(&mut self, event: AgentEvent) {
        match event {
            AgentEvent::Token { text } => {
                if let Some(last) = self.messages.last_mut() {
                    if last.role == MessageRole::Assistant {
                        last.content.push_str(&text);
                    }
                }
            }
            AgentEvent::ToolCall { id, name, input } => {
                if let Some(last) = self.messages.last_mut() {
                    if last.role == MessageRole::Assistant {
                        last.tool_calls.push(ToolCallRecord {
                            id,
                            name,
                            input,
                            output: None,
                            is_error: false,
                        });
                    }
                }
            }
            AgentEvent::ToolOutput { tool_use_id, output, is_error } => {
                if let Some(last) = self.messages.last_mut() {
                    if last.role == MessageRole::Assistant {
                        if let Some(tc) = last.tool_calls.iter_mut().find(|t| t.id == tool_use_id) {
                            tc.output = Some(output);
                            tc.is_error = is_error;
                        }
                    }
                }
            }
            AgentEvent::Error { message } => {
                self.add_system_message(format!("⚠ Error: {}", message));
                self.finish_assistant_turn();
            }
            AgentEvent::Finished { .. } => {
                self.finish_assistant_turn();
            }
            _ => {}
        }
    }

    pub fn persist_session(&self) {
        let saved_messages: Vec<SavedMessage> = self
            .messages
            .iter()
            .filter(|m| m.role == MessageRole::User || m.role == MessageRole::Assistant)
            .map(|m| SavedMessage {
                role: match m.role {
                    MessageRole::User => "user".to_string(),
                    MessageRole::Assistant => "assistant".to_string(),
                    MessageRole::Tool => "tool".to_string(),
                    MessageRole::System => "system".to_string(),
                },
                content: m.content.clone(),
            })
            .collect();

        let title = self
            .messages
            .iter()
            .find(|m| m.role == MessageRole::User)
            .map(|m| {
                if m.content.len() > 50 {
                    format!("{}...", &m.content[..47])
                } else {
                    m.content.clone()
                }
            })
            .unwrap_or_else(|| self.session_id.clone());

        save_session(&self.session_id, &title, &saved_messages);
    }

    pub fn build_model_config(&self) -> ModelConfig {
        let provider_type = match self.provider.to_lowercase().as_str() {
            "anthropic" => ProviderType::Anthropic,
            "gemini" => ProviderType::Gemini,
            "ollama" => ProviderType::Ollama,
            "openrouter" => ProviderType::OpenRouter,
            "deepseek" => ProviderType::DeepSeek,
            "groq" => ProviderType::Groq,
            _ => ProviderType::OpenAI,
        };

        let mut config = ModelConfig::new(provider_type, self.model.clone());
        config.api_key = self.api_key.clone().or_else(|| match config.provider {
            ProviderType::OpenAI => std::env::var("OPENAI_API_KEY").ok(),
            ProviderType::Anthropic => std::env::var("ANTHROPIC_API_KEY").ok(),
            ProviderType::Gemini => std::env::var("GEMINI_API_KEY").ok(),
            ProviderType::OpenRouter => std::env::var("OPENROUTER_API_KEY").ok(),
            ProviderType::DeepSeek => std::env::var("DEEPSEEK_API_KEY").ok(),
            ProviderType::Groq => std::env::var("GROQ_API_KEY").ok(),
            _ => None,
        });
        config.base_url = self.base_url.clone();
        config
    }
}
