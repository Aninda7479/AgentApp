// Protocol.cs - SuperAgent Windows Native WinUI 3
// Canonical IPC command constants, WebSocket wire messages, and streaming event models
// mirroring packages/core_v2/src/protocol/.

using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace SuperAgent.Core;

#region Canonical Commands

/// <summary>
/// Canonical IPC channel and action identifiers matching packages/core_v2/src/protocol/commands.rs.
/// </summary>
public static class Commands
{
    // Agent Execution & Lifecycle
    public const string AgentRun = "agent-run";
    public const string AgentStop = "agent-stop";
    public const string AgentList = "agent-list";
    public const string AgentStatus = "agent-status";
    public const string AgentPermissionResponse = "agent-permission-response";
    public const string AgentCompact = "agent-compact";
    public const string AgentEvent = "agent-event";
    public const string ChatGenerateTitle = "chat-generate-title";
    public const string ChatName = "chat-name";

    // Settings & Stores
    public const string SettingsRead = "settings-read";
    public const string SettingsWrite = "settings-write";
    public const string ReadSettingsFile = "read_settings_file";
    public const string WriteSettingsFile = "write_settings_file";
    public const string StoreRead = "store-read";
    public const string StoreWrite = "store-write";

    // System & Diagnostics
    public const string SystemInfo = "system-info";
    public const string GetSystemInfo = "get_system_info";
    public const string AppVersion = "app_version";
    public const string GetAppVersion = "get_app_version";

    // Desktop Window Management
    public const string WindowMinimize = "minimize_window";
    public const string WindowMaximize = "window_maximize";
    public const string WindowClose = "close_window";
    public const string ToggleWindowMaximize = "toggle_window_maximize";

    // OS Autostart
    public const string AutostartEnable = "autostart_enable";
    public const string AutostartDisable = "autostart_disable";
    public const string AutostartIsEnabled = "autostart_is_enabled";

    // Chats, Projects & Media
    public const string ChatsRead = "chats-read";
    public const string ProjectsRead = "projects-read";
    public const string ChatStepsRead = "chat-steps-read";
    public const string CopyFileToChat = "copy-file-to-chat";
    public const string SaveChatMediaBuffer = "save-chat-media-buffer";
    public const string SelectProjectFolders = "select-project-folders";
    public const string SelectFiles = "select-files";
    public const string ReadFileBase64 = "read-file-base64";

    // Memory & Orchestrator Instructions
    public const string GlobalMemoryRead = "global-memory-read";
    public const string GlobalMemorySaveInstructions = "global-memory-save-instructions";
    public const string GlobalMemoryAddProfile = "global-memory-add-profile";
    public const string GlobalMemoryDeleteProfile = "global-memory-delete-profile";
    public const string GlobalMemoryAddInsight = "global-memory-add-insight";
    public const string GlobalMemoryDeleteInsight = "global-memory-delete-insight";
    public const string OrchestratorReadInstructions = "orchestrator-read-instructions";
    public const string OrchestratorWriteInstructions = "orchestrator-write-instructions";
    public const string OrchestratorUpdateInstructions = "orchestrator-update-instructions";
    public const string OrchestratorOptimizeInstructionsByAi = "orchestrator-optimize-instructions-by-ai";

    // Storage Explorer
    public const string StorageScan = "storage:scan";
    public const string StorageReadTextFile = "storage:read-text-file";
    public const string StorageOpenFolder = "storage:open-folder";
    public const string StorageDeleteFile = "storage:delete-file";
    public const string StorageGetConversationFiles = "storage:get-conversation-files";
    public const string StorageGetMemoryIndex = "storage:get-memory-index";
    public const string ContextStorageRead = "context-storage-read";
    public const string SearchWorkspaceFiles = "search_workspace_files";
    public const string ReadTextFile = "read_text_file";
    public const string WriteTextFile = "write_text_file";
    public const string FileExists = "file_exists";

    // Voice & Dictation
    public const string VoiceTranscribe = "voice-transcribe";
    public const string MediaTranscribe = "media-transcribe";
    public const string DictationTranscribe = "dictation-transcribe";
    public const string VoiceDictationToggle = "voice_dictation_toggle";
    public const string WhisperLocalStatus = "whisper-local-status";
    public const string WhisperLocalDownload = "whisper-local-download";
    public const string WhisperLocalDelete = "whisper-local-delete";
    public const string WhisperLocalSetdir = "whisper-local-setdir";

    // Circle Search
    public const string CircleSearchAnalyze = "circle-search-analyze";
    public const string CircleSearchGetScreenImage = "circle-search-get-screen_image";
    public const string CircleSearchCaptureArea = "circle-search-capture-area";
    public const string CircleSearchShow = "circle-search-show";
    public const string CircleSearchHide = "circle-search-hide";
    public const string CircleSearchToggle = "circle-search-toggle";

    // Ollama Local Inference
    public const string OllamaStatus = "ollama_status";
    public const string CheckOllamaPort = "check_ollama_port";
    public const string CheckOllamaInstalled = "check_ollama_installed";
    public const string OllamaInstalledModels = "ollama_installed_models";
    public const string OllamaStart = "ollama_start";
    public const string StartOllamaService = "start_ollama_service";
    public const string OllamaSettingsGet = "ollama-settings-get";
    public const string OllamaSettingsSave = "ollama-settings-save";

    // Providers
    public const string AutoDetectProviders = "auto-detect-providers";
    public const string ProviderHealthDiagnostics = "provider-health-diagnostics";

    // Skills, MCP & Plugins
    public const string SkillsCatalog = "skills-catalog";
    public const string McpCatalog = "mcp_catalog";
    public const string PluginsCatalog = "plugins-catalog";
    public const string SkillsList = "skills-list";
    public const string SkillsSave = "skills-save";
    public const string SkillsImportCheck = "skills-import-check";
    public const string SkillsImportPerform = "skills-import-perform";

    // Kanban Board
    public const string KanbanLoad = "kanban-load";
    public const string KanbanSave = "kanban-save";

    // 3D VRM Companion Partners
    public const string PartnerList = "partner-list";
    public const string PartnerGet = "partner-get";
    public const string PartnerGetActive = "partner-get-active";
    public const string PartnerSetActive = "partner-set-active";
    public const string PartnerRemove = "partner-remove";
    public const string PartnerImportJson = "partner-import-json";
    public const string PartnerExport = "partner-export";
    public const string PartnerPickModelFile = "partner_pick_model_file";
    public const string PartnerPickModelFolder = "partner_pick_model_folder";
    public const string PetStatus = "pet-status";
    public const string PetSetPartner = "pet-set-partner";

    // Web Daemon & VPS Admin
    public const string WebStatus = "web-status";
    public const string WebStart = "web-start";
    public const string WebStop = "web-stop";
    public const string WebChangePassword = "web-change-password";
    public const string WebIsDefaultPassword = "web_is_default_password";

    // Telegram Bot Integration
    public const string TelegramConfigGet = "telegram-config-get";
    public const string TelegramConfigSave = "telegram-config-save";
    public const string TelegramBotStart = "telegram-bot-start";
    public const string TelegramBotStop = "telegram-bot-stop";
    public const string TelegramBotStatus = "telegram-bot-status";
    public const string TelegramTest = "telegram-test";
    public const string TelegramSend = "telegram-send";

    // Triggers & Routines
    public const string TriggersToggle = "triggers-toggle";

    // Usage & Cost Tracking
    public const string UsageSummary = "usage-summary";
    public const string UsageRecords = "usage-records";
    public const string UsageClear = "usage-clear";
    public const string UsagePricing = "usage-pricing";
    public const string UsageTrack = "usage-track";

    // Micro-Apps (Artifacts)
    public const string ArtifactList = "artifact-list";
    public const string ArtifactStart = "artifact-start";
    public const string ArtifactStop = "artifact-stop";
    public const string ArtifactOpen = "artifact-open";
    public const string ArtifactToggleAutostart = "artifact-toggle-autostart";
    public const string ArtifactDelete = "artifact-delete";
    public const string ArtifactEnsureSeeds = "artifact-ensure-seeds";
    public const string ArtifactLogs = "artifact-logs";
    public const string ArtifactGetStorage = "artifact-get-storage";
    public const string ArtifactSetStorage = "artifact-set-storage";
    public const string ArtifactSetStorageKey = "artifact-set-storage-key";
    public const string ArtifactDeleteStorageKey = "artifact-delete-storage-key";
    public const string ArtifactClearStorage = "artifact-clear-storage";
    public const string ArtifactOpenFolder = "artifact-open-folder";
    public const string ArtifactsNativeToggle = "artifacts-native-toggle";

    // 3D Workspace
    public const string ThreeDListModels = "three-d-list-models";
    public const string ThreeDGenerate = "three-d-generate";
    public const string ThreeDDeleteModel = "three-d-delete-model";

    // WebSocket Actions & Channels
    public const string WsActionPing = "PING";
    public const string WsActionPong = "PONG";
    public const string WsActionSyncSession = "SYNC_SESSION";
    public const string WsActionSubscribeSession = "SUBSCRIBE_SESSION";
    public const string WsActionUnsubscribeSession = "UNSUBSCRIBE_SESSION";
    public const string WsActionClientToolResult = "CLIENT_TOOL_RESULT";
    public const string WsChannelSessionSync = "session-sync";
}

#endregion

#region Agent Stream Events

/// <summary>
/// Strongly typed polymorphic stream events emitted by core_v2 during generation and tool runs.
/// </summary>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(StartTurnEvent), "start_turn")]
[JsonDerivedType(typeof(TokenEvent), "token")]
[JsonDerivedType(typeof(ThoughtEvent), "thought")]
[JsonDerivedType(typeof(ToolCallEvent), "tool_call")]
[JsonDerivedType(typeof(ToolResultEvent), "tool_result")]
[JsonDerivedType(typeof(StepCompleteEvent), "step_complete")]
[JsonDerivedType(typeof(DoneEvent), "done")]
[JsonDerivedType(typeof(ErrorEvent), "error")]
[JsonDerivedType(typeof(AbortEvent), "abort")]
public abstract record AgentStreamEvent
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; init; } = string.Empty;
}

public record StartTurnEvent : AgentStreamEvent
{
    [JsonPropertyName("model")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Model { get; init; }
}

public record TokenEvent : AgentStreamEvent
{
    [JsonPropertyName("content")]
    public string Content { get; init; } = string.Empty;
}

public record ThoughtEvent : AgentStreamEvent
{
    [JsonPropertyName("content")]
    public string Content { get; init; } = string.Empty;
}

public record ToolCallEvent : AgentStreamEvent
{
    [JsonPropertyName("toolCallId")]
    public string ToolCallId { get; init; } = string.Empty;

    [JsonPropertyName("toolName")]
    public string ToolName { get; init; } = string.Empty;

    [JsonPropertyName("toolArgs")]
    public JsonElement ToolArgs { get; init; }
}

public record ToolResultEvent : AgentStreamEvent
{
    [JsonPropertyName("toolCallId")]
    public string ToolCallId { get; init; } = string.Empty;

    [JsonPropertyName("toolResult")]
    public JsonElement ToolResult { get; init; }

    [JsonPropertyName("isError")]
    public bool IsError { get; init; }
}

public record StepCompleteEvent : AgentStreamEvent
{
    [JsonPropertyName("stepIndex")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? StepIndex { get; init; }
}

public record DoneEvent : AgentStreamEvent
{
    [JsonPropertyName("stopReason")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? StopReason { get; init; }
}

public record ErrorEvent : AgentStreamEvent
{
    [JsonPropertyName("error")]
    public string Error { get; init; } = string.Empty;
}

public record AbortEvent : AgentStreamEvent
{
}

#endregion

#region Wire & WebSocket Models

public record PongMessage
{
    [JsonPropertyName("action")]
    public string Action { get; init; } = Commands.WsActionPong;

    [JsonPropertyName("timestamp")]
    public long Timestamp { get; init; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}

public record SessionSyncPayload
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; init; } = string.Empty;

    [JsonPropertyName("isRunning")]
    public bool IsRunning { get; init; }

    [JsonPropertyName("replayEvents")]
    public List<JsonElement> ReplayEvents { get; init; } = new();

    [JsonPropertyName("fullAssistantText")]
    public string FullAssistantText { get; init; } = string.Empty;

    [JsonPropertyName("fullThoughtText")]
    public string FullThoughtText { get; init; } = string.Empty;

    [JsonPropertyName("pendingTool")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonElement? PendingTool { get; init; }
}

/// <summary>
/// Universal WebSocket envelope used by core_v2 hub (/ws).
/// </summary>
[JsonConverter(typeof(WireMessageConverter))]
public record WireMessage
{
    public string? Channel { get; init; }
    public string? Action { get; init; }
    public long? Timestamp { get; init; }
    public JsonElement? RawData { get; init; }
    public AgentStreamEvent? AgentEvent { get; init; }
    public SessionSyncPayload? SessionSync { get; init; }
    public Dictionary<string, JsonElement>? Extra { get; init; }

    public static WireMessage CreateAgentEvent(AgentStreamEvent ev) =>
        new() { Channel = Commands.AgentEvent, AgentEvent = ev };

    public static WireMessage CreateSessionSync(SessionSyncPayload payload) =>
        new() { Channel = Commands.WsChannelSessionSync, SessionSync = payload };

    public static WireMessage CreatePong() =>
        new() { Action = Commands.WsActionPong, Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() };

    public static WireMessage CreateChannel(string channel, JsonElement data) =>
        new() { Channel = channel, RawData = data };
}

public class WireMessageConverter : JsonConverter<WireMessage>
{
    public override WireMessage Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;

        string? channel = root.TryGetProperty("channel", out var chProp) ? chProp.GetString() : null;
        string? action = root.TryGetProperty("action", out var actProp) ? actProp.GetString() : null;
        long? timestamp = root.TryGetProperty("timestamp", out var tsProp) && tsProp.TryGetInt64(out var ts) ? ts : null;

        AgentStreamEvent? agentEvent = null;
        SessionSyncPayload? sessionSync = null;
        JsonElement? rawData = null;

        if (channel != null && root.TryGetProperty("data", out var dataProp))
        {
            rawData = dataProp.Clone();
            if (channel == Commands.AgentEvent)
            {
                agentEvent = JsonSerializer.Deserialize<AgentStreamEvent>(dataProp.GetRawText(), options);
            }
            else if (channel == Commands.WsChannelSessionSync)
            {
                sessionSync = JsonSerializer.Deserialize<SessionSyncPayload>(dataProp.GetRawText(), options);
            }
        }

        var extra = new Dictionary<string, JsonElement>();
        foreach (var prop in root.EnumerateObject())
        {
            if (prop.Name is not ("channel" or "action" or "timestamp" or "data"))
            {
                extra[prop.Name] = prop.Value.Clone();
            }
        }

        return new WireMessage
        {
            Channel = channel,
            Action = action,
            Timestamp = timestamp,
            RawData = rawData,
            AgentEvent = agentEvent,
            SessionSync = sessionSync,
            Extra = extra.Count > 0 ? extra : null
        };
    }

    public override void Write(Utf8JsonWriter writer, WireMessage value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();

        if (value.Channel != null)
        {
            writer.WriteString("channel", value.Channel);
        }

        if (value.Action != null)
        {
            writer.WriteString("action", value.Action);
        }

        if (value.Timestamp.HasValue)
        {
            writer.WriteNumber("timestamp", value.Timestamp.Value);
        }

        if (value.AgentEvent != null)
        {
            writer.WritePropertyName("data");
            JsonSerializer.Serialize(writer, value.AgentEvent, options);
        }
        else if (value.SessionSync != null)
        {
            writer.WritePropertyName("data");
            JsonSerializer.Serialize(writer, value.SessionSync, options);
        }
        else if (value.RawData.HasValue)
        {
            writer.WritePropertyName("data");
            value.RawData.Value.WriteTo(writer);
        }

        if (value.Extra != null)
        {
            foreach (var kvp in value.Extra)
            {
                writer.WritePropertyName(kvp.Key);
                kvp.Value.WriteTo(writer);
            }
        }

        writer.WriteEndObject();
    }
}

#endregion

#region IPC DTOs & Envelopes

public record IpcRequestEnvelope<T>
{
    [JsonPropertyName("channel")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Channel { get; init; }

    [JsonPropertyName("args")]
    public List<T> Args { get; init; } = new();

    public static IpcRequestEnvelope<T> Create(string channel, T arg) =>
        new() { Channel = channel, Args = new List<T> { arg } };

    public static IpcRequestEnvelope<T> Create(string channel, List<T> args) =>
        new() { Channel = channel, Args = args };
}

public record IpcResponseEnvelope<T>
{
    [JsonPropertyName("data")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public T? Data { get; init; }

    [JsonPropertyName("error")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Error { get; init; }

    public bool IsSuccess => Error == null;
}

public record AgentRunConfig
{
    [JsonPropertyName("provider")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Provider { get; init; }

    [JsonPropertyName("model")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Model { get; init; }

    [JsonPropertyName("apiKey")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ApiKey { get; init; }

    [JsonPropertyName("baseUrl")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? BaseUrl { get; init; }

    [JsonPropertyName("instructions")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Instructions { get; init; }

    [JsonPropertyName("attachments")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<JsonElement>? Attachments { get; init; }
}

public record AgentRunRequest
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; init; } = "default-session";

    [JsonPropertyName("prompt")]
    public string Prompt { get; init; } = string.Empty;

    [JsonPropertyName("config")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public AgentRunConfig? Config { get; init; }

    [JsonPropertyName("currentAttachments")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<JsonElement>? CurrentAttachments { get; init; }
}

public record AgentStopRequest
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; init; } = string.Empty;
}

public record AgentStatusResponse
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; init; } = string.Empty;

    [JsonPropertyName("isRunning")]
    public bool IsRunning { get; init; }
}

public record ChatGenerateTitleRequest
{
    [JsonPropertyName("prompt")]
    public string Prompt { get; init; } = string.Empty;

    [JsonPropertyName("response")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Response { get; init; }

    [JsonPropertyName("provider")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Provider { get; init; }

    [JsonPropertyName("model")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Model { get; init; }

    [JsonPropertyName("apiKey")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ApiKey { get; init; }

    [JsonPropertyName("baseUrl")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? BaseUrl { get; init; }
}

public record ChatGenerateTitleResponse
{
    [JsonPropertyName("title")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Title { get; init; }
}

public record SubscribeSessionRequest
{
    [JsonPropertyName("action")]
    public string Action { get; init; } = Commands.WsActionSubscribeSession;

    [JsonPropertyName("sessionId")]
    public string SessionId { get; init; } = string.Empty;
}

public record UnsubscribeSessionRequest
{
    [JsonPropertyName("action")]
    public string Action { get; init; } = Commands.WsActionUnsubscribeSession;

    [JsonPropertyName("sessionId")]
    public string SessionId { get; init; } = string.Empty;
}

public record SyncSessionRequest
{
    [JsonPropertyName("action")]
    public string Action { get; init; } = Commands.WsActionSyncSession;

    [JsonPropertyName("sessionId")]
    public string SessionId { get; init; } = string.Empty;
}

#endregion
