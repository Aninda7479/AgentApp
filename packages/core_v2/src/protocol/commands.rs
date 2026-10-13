//! Canonical IPC command and event channel identifiers across SuperAgent.
//!
//! Declares typed constants for every IPC channel, Tauri command, and WebSocket
//! action to eliminate stringly-typed channel drift across all client surfaces.

// ─── Agent Execution & Lifecycle ─────────────────────────────────────────────

pub const AGENT_RUN: &str = "agent-run";
pub const AGENT_STOP: &str = "agent-stop";
pub const AGENT_LIST: &str = "agent-list";
pub const AGENT_STATUS: &str = "agent-status";
pub const AGENT_PERMISSION_RESPONSE: &str = "agent-permission-response";
pub const AGENT_COMPACT: &str = "agent-compact";
pub const AGENT_EVENT: &str = "agent-event";
pub const CHAT_GENERATE_TITLE: &str = "chat-generate-title";
pub const CHAT_NAME: &str = "chat-name";

// ─── Settings & Stores ───────────────────────────────────────────────────────

pub const SETTINGS_READ: &str = "settings-read";
pub const SETTINGS_WRITE: &str = "settings-write";
pub const READ_SETTINGS_FILE: &str = "read_settings_file";
pub const WRITE_SETTINGS_FILE: &str = "write_settings_file";
pub const STORE_READ: &str = "store-read";
pub const STORE_WRITE: &str = "store-write";

// ─── System & Diagnostics ────────────────────────────────────────────────────

pub const SYSTEM_INFO: &str = "system-info";
pub const GET_SYSTEM_INFO: &str = "get_system_info";
pub const APP_VERSION: &str = "app_version";
pub const GET_APP_VERSION: &str = "get_app_version";

// ─── Desktop Window Management ───────────────────────────────────────────────

pub const WINDOW_MINIMIZE: &str = "minimize_window";
pub const WINDOW_MAXIMIZE: &str = "window_maximize";
pub const WINDOW_CLOSE: &str = "close_window";
pub const TOGGLE_WINDOW_MAXIMIZE: &str = "toggle_window_maximize";

// ─── OS Autostart ────────────────────────────────────────────────────────────

pub const AUTOSTART_ENABLE: &str = "autostart_enable";
pub const AUTOSTART_DISABLE: &str = "autostart_disable";
pub const AUTOSTART_IS_ENABLED: &str = "autostart_is_enabled";

// ─── Chats, Projects & Media ─────────────────────────────────────────────────

pub const CHATS_READ: &str = "chats-read";
pub const PROJECTS_READ: &str = "projects-read";
pub const CHAT_STEPS_READ: &str = "chat-steps-read";
pub const COPY_FILE_TO_CHAT: &str = "copy-file-to-chat";
pub const SAVE_CHAT_MEDIA_BUFFER: &str = "save-chat-media-buffer";
pub const SELECT_PROJECT_FOLDERS: &str = "select-project-folders";
pub const SELECT_FILES: &str = "select-files";
pub const READ_FILE_BASE64: &str = "read-file-base64";

// ─── Memory & Orchestrator Instructions ──────────────────────────────────────

pub const GLOBAL_MEMORY_READ: &str = "global-memory-read";
pub const GLOBAL_MEMORY_SAVE_INSTRUCTIONS: &str = "global-memory-save-instructions";
pub const GLOBAL_MEMORY_ADD_PROFILE: &str = "global-memory-add-profile";
pub const GLOBAL_MEMORY_DELETE_PROFILE: &str = "global-memory-delete-profile";
pub const GLOBAL_MEMORY_ADD_INSIGHT: &str = "global-memory-add-insight";
pub const GLOBAL_MEMORY_DELETE_INSIGHT: &str = "global-memory-delete-insight";
pub const ORCHESTRATOR_READ_INSTRUCTIONS: &str = "orchestrator-read-instructions";
pub const ORCHESTRATOR_WRITE_INSTRUCTIONS: &str = "orchestrator-write-instructions";
pub const ORCHESTRATOR_UPDATE_INSTRUCTIONS: &str = "orchestrator-update-instructions";
pub const ORCHESTRATOR_OPTIMIZE_INSTRUCTIONS_BY_AI: &str =
    "orchestrator-optimize-instructions-by-ai";

// ─── Storage Explorer ────────────────────────────────────────────────────────

pub const STORAGE_SCAN: &str = "storage:scan";
pub const STORAGE_READ_TEXT_FILE: &str = "storage:read-text-file";
pub const STORAGE_OPEN_FOLDER: &str = "storage:open-folder";
pub const STORAGE_DELETE_FILE: &str = "storage:delete-file";
pub const STORAGE_GET_CONVERSATION_FILES: &str = "storage:get-conversation-files";
pub const STORAGE_GET_MEMORY_INDEX: &str = "storage:get-memory-index";
pub const CONTEXT_STORAGE_READ: &str = "context-storage-read";
pub const SEARCH_WORKSPACE_FILES: &str = "search_workspace_files";
pub const READ_TEXT_FILE: &str = "read_text_file";
pub const WRITE_TEXT_FILE: &str = "write_text_file";
pub const FILE_EXISTS: &str = "file_exists";

// ─── Voice & Dictation ───────────────────────────────────────────────────────

pub const VOICE_TRANSCRIBE: &str = "voice-transcribe";
pub const MEDIA_TRANSCRIBE: &str = "media-transcribe";
pub const DICTATION_TRANSCRIBE: &str = "dictation-transcribe";
pub const VOICE_DICTATION_TOGGLE: &str = "voice_dictation_toggle";
pub const WHISPER_LOCAL_STATUS: &str = "whisper-local-status";
pub const WHISPER_LOCAL_DOWNLOAD: &str = "whisper-local-download";
pub const WHISPER_LOCAL_DELETE: &str = "whisper-local-delete";
pub const WHISPER_LOCAL_SETDIR: &str = "whisper-local-setdir";

// ─── Circle Search ───────────────────────────────────────────────────────────

pub const CIRCLE_SEARCH_ANALYZE: &str = "circle-search-analyze";
pub const CIRCLE_SEARCH_GET_SCREEN_IMAGE: &str = "circle-search-get-screen_image";
pub const CIRCLE_SEARCH_CAPTURE_AREA: &str = "circle-search-capture-area";
pub const CIRCLE_SEARCH_SHOW: &str = "circle-search-show";
pub const CIRCLE_SEARCH_HIDE: &str = "circle-search-hide";
pub const CIRCLE_SEARCH_TOGGLE: &str = "circle-search-toggle";

// ─── Ollama Local Inference ──────────────────────────────────────────────────

pub const OLLAMA_STATUS: &str = "ollama_status";
pub const CHECK_OLLAMA_PORT: &str = "check_ollama_port";
pub const CHECK_OLLAMA_INSTALLED: &str = "check_ollama_installed";
pub const OLLAMA_INSTALLED_MODELS: &str = "ollama_installed_models";
pub const OLLAMA_START: &str = "ollama_start";
pub const START_OLLAMA_SERVICE: &str = "start_ollama_service";
pub const OLLAMA_SETTINGS_GET: &str = "ollama-settings-get";
pub const OLLAMA_SETTINGS_SAVE: &str = "ollama-settings-save";

// ─── Providers ───────────────────────────────────────────────────────────────

pub const AUTO_DETECT_PROVIDERS: &str = "auto-detect-providers";
pub const PROVIDER_HEALTH_DIAGNOSTICS: &str = "provider-health-diagnostics";

// ─── Skills, MCP & Plugins ───────────────────────────────────────────────────

pub const SKILLS_CATALOG: &str = "skills-catalog";
pub const MCP_CATALOG: &str = "mcp_catalog";
pub const PLUGINS_CATALOG: &str = "plugins-catalog";
pub const SKILLS_LIST: &str = "skills-list";
pub const SKILLS_SAVE: &str = "skills-save";
pub const SKILLS_IMPORT_CHECK: &str = "skills-import-check";
pub const SKILLS_IMPORT_PERFORM: &str = "skills-import-perform";

// ─── Kanban Board ────────────────────────────────────────────────────────────

pub const KANBAN_LOAD: &str = "kanban-load";
pub const KANBAN_SAVE: &str = "kanban-save";

// ─── 3D VRM Companion Partners ───────────────────────────────────────────────

pub const PARTNER_LIST: &str = "partner-list";
pub const PARTNER_GET: &str = "partner-get";
pub const PARTNER_GET_ACTIVE: &str = "partner-get-active";
pub const PARTNER_SET_ACTIVE: &str = "partner-set-active";
pub const PARTNER_REMOVE: &str = "partner-remove";
pub const PARTNER_IMPORT_JSON: &str = "partner-import-json";
pub const PARTNER_EXPORT: &str = "partner-export";
pub const PARTNER_PICK_MODEL_FILE: &str = "partner_pick_model_file";
pub const PARTNER_PICK_MODEL_FOLDER: &str = "partner_pick_model_folder";
pub const PET_STATUS: &str = "pet-status";
pub const PET_SET_PARTNER: &str = "pet-set-partner";

// ─── Web Daemon & VPS Admin ──────────────────────────────────────────────────

pub const WEB_STATUS: &str = "web-status";
pub const WEB_START: &str = "web-start";
pub const WEB_STOP: &str = "web-stop";
pub const WEB_CHANGE_PASSWORD: &str = "web-change-password";
pub const WEB_IS_DEFAULT_PASSWORD: &str = "web_is_default_password";

// ─── Telegram Bot Integration ────────────────────────────────────────────────

pub const TELEGRAM_CONFIG_GET: &str = "telegram-config-get";
pub const TELEGRAM_CONFIG_SAVE: &str = "telegram-config-save";
pub const TELEGRAM_BOT_START: &str = "telegram-bot-start";
pub const TELEGRAM_BOT_STOP: &str = "telegram-bot-stop";
pub const TELEGRAM_BOT_STATUS: &str = "telegram-bot-status";
pub const TELEGRAM_TEST: &str = "telegram-test";
pub const TELEGRAM_SEND: &str = "telegram-send";

// ─── Triggers & Routines ──────────────────────────────────────────────────────

pub const TRIGGERS_TOGGLE: &str = "triggers-toggle";

// ─── Usage & Cost Tracking ───────────────────────────────────────────────────

pub const USAGE_SUMMARY: &str = "usage-summary";
pub const USAGE_RECORDS: &str = "usage-records";
pub const USAGE_CLEAR: &str = "usage-clear";
pub const USAGE_PRICING: &str = "usage-pricing";
pub const USAGE_TRACK: &str = "usage-track";

// ─── Micro-Apps (Artifacts) ──────────────────────────────────────────────────

pub const ARTIFACT_LIST: &str = "artifact-list";
pub const ARTIFACT_START: &str = "artifact-start";
pub const ARTIFACT_STOP: &str = "artifact-stop";
pub const ARTIFACT_OPEN: &str = "artifact-open";
pub const ARTIFACT_TOGGLE_AUTOSTART: &str = "artifact-toggle-autostart";
pub const ARTIFACT_DELETE: &str = "artifact-delete";
pub const ARTIFACT_ENSURE_SEEDS: &str = "artifact-ensure-seeds";
pub const ARTIFACT_LOGS: &str = "artifact-logs";
pub const ARTIFACT_GET_STORAGE: &str = "artifact-get-storage";
pub const ARTIFACT_SET_STORAGE: &str = "artifact-set-storage";
pub const ARTIFACT_SET_STORAGE_KEY: &str = "artifact-set-storage-key";
pub const ARTIFACT_DELETE_STORAGE_KEY: &str = "artifact-delete-storage-key";
pub const ARTIFACT_CLEAR_STORAGE: &str = "artifact-clear-storage";
pub const ARTIFACT_OPEN_FOLDER: &str = "artifact-open-folder";
pub const ARTIFACTS_NATIVE_TOGGLE: &str = "artifacts-native-toggle";

// ─── 3D Workspace ────────────────────────────────────────────────────────────

pub const THREE_D_LIST_MODELS: &str = "three-d-list-models";
pub const THREE_D_GENERATE: &str = "three-d-generate";
pub const THREE_D_DELETE_MODEL: &str = "three-d-delete-model";

// ─── WebSocket Client Actions & Broadcast Channels ───────────────────────────

pub const WS_ACTION_PING: &str = "PING";
pub const WS_ACTION_PONG: &str = "PONG";
pub const WS_ACTION_SYNC_SESSION: &str = "SYNC_SESSION";
pub const WS_ACTION_SUBSCRIBE_SESSION: &str = "SUBSCRIBE_SESSION";
pub const WS_ACTION_UNSUBSCRIBE_SESSION: &str = "UNSUBSCRIBE_SESSION";
pub const WS_ACTION_CLIENT_TOOL_RESULT: &str = "CLIENT_TOOL_RESULT";
pub const WS_CHANNEL_SESSION_SYNC: &str = "session-sync";
