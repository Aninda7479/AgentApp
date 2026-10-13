//
// Protocol.swift
// SuperAgent
//
// Canonical IPC command constants, WebSocket wire messages, and streaming event models
// mirroring packages/core_v2/src/protocol/.
//

import Foundation

// MARK: - Canonical IPC Channel & Action Identifiers

public enum Commands {
    // Agent Execution & Lifecycle
    public static let agentRun = "agent-run"
    public static let agentStop = "agent-stop"
    public static let agentList = "agent-list"
    public static let agentStatus = "agent-status"
    public static let agentPermissionResponse = "agent-permission-response"
    public static let agentCompact = "agent-compact"
    public static let agentEvent = "agent-event"
    public static let chatGenerateTitle = "chat-generate-title"
    public static let chatName = "chat-name"

    // Settings & Stores
    public static let settingsRead = "settings-read"
    public static let settingsWrite = "settings-write"
    public static let readSettingsFile = "read_settings_file"
    public static let writeSettingsFile = "write_settings_file"
    public static let storeRead = "store-read"
    public static let storeWrite = "store-write"

    // System & Diagnostics
    public static let systemInfo = "system-info"
    public static let getSystemInfo = "get_system_info"
    public static let appVersion = "app_version"
    public static let getAppVersion = "get_app_version"

    // Desktop Window Management
    public static let windowMinimize = "minimize_window"
    public static let windowMaximize = "window_maximize"
    public static let windowClose = "close_window"
    public static let toggleWindowMaximize = "toggle_window_maximize"

    // OS Autostart
    public static let autostartEnable = "autostart_enable"
    public static let autostartDisable = "autostart_disable"
    public static let autostartIsEnabled = "autostart_is_enabled"

    // Chats, Projects & Media
    public static let chatsRead = "chats-read"
    public static let projectsRead = "projects-read"
    public static let chatStepsRead = "chat-steps-read"
    public static let copyFileToChat = "copy-file-to-chat"
    public static let saveChatMediaBuffer = "save-chat-media-buffer"
    public static let selectProjectFolders = "select-project-folders"
    public static let selectFiles = "select-files"
    public static let readFileBase64 = "read-file-base64"

    // Memory & Orchestrator Instructions
    public static let globalMemoryRead = "global-memory-read"
    public static let globalMemorySaveInstructions = "global-memory-save-instructions"
    public static let globalMemoryAddProfile = "global-memory-add-profile"
    public static let globalMemoryDeleteProfile = "global-memory-delete-profile"
    public static let globalMemoryAddInsight = "global-memory-add-insight"
    public static let globalMemoryDeleteInsight = "global-memory-delete-insight"
    public static let orchestratorReadInstructions = "orchestrator-read-instructions"
    public static let orchestratorWriteInstructions = "orchestrator-write-instructions"
    public static let orchestratorUpdateInstructions = "orchestrator-update-instructions"
    public static let orchestratorOptimizeInstructionsByAi = "orchestrator-optimize-instructions-by-ai"

    // Storage Explorer
    public static let storageScan = "storage:scan"
    public static let storageReadTextFile = "storage:read-text-file"
    public static let storageOpenFolder = "storage:open-folder"
    public static let storageDeleteFile = "storage:delete-file"
    public static let storageGetConversationFiles = "storage:get-conversation-files"
    public static let storageGetMemoryIndex = "storage:get-memory-index"
    public static let contextStorageRead = "context-storage-read"
    public static let searchWorkspaceFiles = "search_workspace_files"
    public static let readTextFile = "read_text_file"
    public static let writeTextFile = "write_text_file"
    public static let fileExists = "file_exists"

    // Voice & Dictation
    public static let voiceTranscribe = "voice-transcribe"
    public static let mediaTranscribe = "media-transcribe"
    public static let dictationTranscribe = "dictation-transcribe"
    public static let voiceDictationToggle = "voice_dictation_toggle"
    public static let whisperLocalStatus = "whisper-local-status"
    public static let whisperLocalDownload = "whisper-local-download"
    public static let whisperLocalDelete = "whisper-local-delete"
    public static let whisperLocalSetdir = "whisper-local-setdir"

    // Circle Search
    public static let circleSearchAnalyze = "circle-search-analyze"
    public static let circleSearchGetScreenImage = "circle-search-get-screen_image"
    public static let circleSearchCaptureArea = "circle-search-capture-area"
    public static let circleSearchShow = "circle-search-show"
    public static let circleSearchHide = "circle-search-hide"
    public static let circleSearchToggle = "circle-search-toggle"

    // Ollama Local Inference
    public static let ollamaStatus = "ollama_status"
    public static let checkOllamaPort = "check_ollama_port"
    public static let checkOllamaInstalled = "check_ollama_installed"
    public static let ollamaInstalledModels = "ollama_installed_models"
    public static let ollamaStart = "ollama_start"
    public static let startOllamaService = "start_ollama_service"
    public static let ollamaSettingsGet = "ollama-settings-get"
    public static let ollamaSettingsSave = "ollama-settings-save"

    // Providers
    public static let autoDetectProviders = "auto-detect-providers"
    public static let providerHealthDiagnostics = "provider-health-diagnostics"

    // Skills, MCP & Plugins
    public static let skillsCatalog = "skills-catalog"
    public static let mcpCatalog = "mcp_catalog"
    public static let pluginsCatalog = "plugins-catalog"
    public static let skillsList = "skills-list"
    public static let skillsSave = "skills-save"
    public static let skillsImportCheck = "skills-import-check"
    public static let skillsImportPerform = "skills-import-perform"

    // Kanban Board
    public static let kanbanLoad = "kanban-load"
    public static let kanbanSave = "kanban-save"

    // 3D VRM Companion Partners
    public static let partnerList = "partner-list"
    public static let partnerGet = "partner-get"
    public static let partnerGetActive = "partner-get-active"
    public static let partnerSetActive = "partner-set-active"
    public static let partnerRemove = "partner-remove"
    public static let partnerImportJson = "partner-import-json"
    public static let partnerExport = "partner-export"
    public static let partnerPickModelFile = "partner_pick_model_file"
    public static let partnerPickModelFolder = "partner_pick_model_folder"
    public static let petStatus = "pet-status"
    public static let petSetPartner = "pet-set-partner"

    // Web Daemon & VPS Admin
    public static let webStatus = "web-status"
    public static let webStart = "web-start"
    public static let webStop = "web-stop"
    public static let webChangePassword = "web-change-password"
    public static let webIsDefaultPassword = "web_is_default_password"

    // Telegram Bot Integration
    public static let telegramConfigGet = "telegram-config-get"
    public static let telegramConfigSave = "telegram-config-save"
    public static let telegramBotStart = "telegram-bot-start"
    public static let telegramBotStop = "telegram-bot-stop"
    public static let telegramBotStatus = "telegram-bot-status"
    public static let telegramTest = "telegram-test"
    public static let telegramSend = "telegram-send"

    // Triggers & Routines
    public static let triggersToggle = "triggers-toggle"

    // Usage & Cost Tracking
    public static let usageSummary = "usage-summary"
    public static let usageRecords = "usage-records"
    public static let usageClear = "usage-clear"
    public static let usagePricing = "usage-pricing"
    public static let usageTrack = "usage-track"

    // Micro-Apps (Artifacts)
    public static let artifactList = "artifact-list"
    public static let artifactStart = "artifact-start"
    public static let artifactStop = "artifact-stop"
    public static let artifactOpen = "artifact-open"
    public static let artifactToggleAutostart = "artifact-toggle-autostart"
    public static let artifactDelete = "artifact-delete"
    public static let artifactEnsureSeeds = "artifact-ensure-seeds"
    public static let artifactLogs = "artifact-logs"
    public static let artifactGetStorage = "artifact-get-storage"
    public static let artifactSetStorage = "artifact-set-storage"
    public static let artifactSetStorageKey = "artifact-set-storage-key"
    public static let artifactDeleteStorageKey = "artifact-delete-storage-key"
    public static let artifactClearStorage = "artifact-clear-storage"
    public static let artifactOpenFolder = "artifact-open-folder"
    public static let artifactsNativeToggle = "artifacts-native-toggle"

    // 3D Workspace
    public static let threeDListModels = "three-d-list-models"
    public static let threeDGenerate = "three-d-generate"
    public static let threeDDeleteModel = "three-d-delete-model"

    // WebSocket Client Actions & Broadcast Channels
    public static let wsActionPing = "PING"
    public static let wsActionPong = "PONG"
    public static let wsActionSyncSession = "SYNC_SESSION"
    public static let wsActionSubscribeSession = "SUBSCRIBE_SESSION"
    public static let wsActionUnsubscribeSession = "UNSUBSCRIBE_SESSION"
    public static let wsActionClientToolResult = "CLIENT_TOOL_RESULT"
    public static let wsChannelSessionSync = "session-sync"
}

// Global convenience bindings
public let AGENT_RUN = Commands.agentRun
public let AGENT_STOP = Commands.agentStop
public let AGENT_LIST = Commands.agentList
public let AGENT_STATUS = Commands.agentStatus
public let AGENT_EVENT = Commands.agentEvent
public let SETTINGS_READ = Commands.settingsRead
public let SETTINGS_WRITE = Commands.settingsWrite
public let SYSTEM_INFO = Commands.systemInfo
public let CHATS_READ = Commands.chatsRead
public let WS_ACTION_PING = Commands.wsActionPing
public let WS_ACTION_PONG = Commands.wsActionPong
public let WS_ACTION_SYNC_SESSION = Commands.wsActionSyncSession
public let WS_ACTION_SUBSCRIBE_SESSION = Commands.wsActionSubscribeSession
public let WS_ACTION_UNSUBSCRIBE_SESSION = Commands.wsActionUnsubscribeSession
public let WS_ACTION_CLIENT_TOOL_RESULT = Commands.wsActionClientToolResult
public let WS_CHANNEL_SESSION_SYNC = Commands.wsChannelSessionSync

// MARK: - AnyCodable Dynamic Value Support

public struct AnyCodable: Codable, Equatable, Hashable, CustomStringConvertible,
    ExpressibleByNilLiteral, ExpressibleByBooleanLiteral,
    ExpressibleByIntegerLiteral, ExpressibleByFloatLiteral,
    ExpressibleByStringLiteral, ExpressibleByArrayLiteral,
    ExpressibleByDictionaryLiteral {

    public let value: Any

    public init(_ value: Any) {
        if let anyCodable = value as? AnyCodable {
            self.value = anyCodable.value
        } else {
            self.value = value
        }
    }

    public init(nilLiteral: ()) {
        self.value = NSNull()
    }

    public init(booleanLiteral value: Bool) {
        self.value = value
    }

    public init(integerLiteral value: Int) {
        self.value = value
    }

    public init(floatLiteral value: Double) {
        self.value = value
    }

    public init(stringLiteral value: String) {
        self.value = value
    }

    public init(arrayLiteral elements: Any...) {
        self.value = elements
    }

    public init(dictionaryLiteral elements: (String, Any)...) {
        var dict: [String: Any] = [:]
        for (key, val) in elements {
            dict[key] = val
        }
        self.value = dict
    }

    public var description: String {
        switch self.value {
        case is NSNull:
            return "null"
        case let string as String:
            return string
        case let number as NSNumber:
            return number.stringValue
        case let array as [Any]:
            let items = array.map { AnyCodable($0).description }.joined(separator: ", ")
            return "[\(items)]"
        case let dict as [String: Any]:
            let entries = dict.map { "\"\($0.key)\": \(AnyCodable($0.value).description)" }.joined(separator: ", ")
            return "{\(entries)}"
        default:
            return String(describing: value)
        }
    }

    public static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        switch (lhs.value, rhs.value) {
        case is (NSNull, NSNull):
            return true
        case let (lhs as Bool, rhs as Bool):
            return lhs == rhs
        case let (lhs as Int, rhs as Int):
            return lhs == rhs
        case let (lhs as Int64, rhs as Int64):
            return lhs == rhs
        case let (lhs as Double, rhs as Double):
            return lhs == rhs
        case let (lhs as String, rhs as String):
            return lhs == rhs
        case let (lhs as [Any], rhs as [Any]):
            guard lhs.count == rhs.count else { return false }
            for (idx, item) in lhs.enumerated() {
                if AnyCodable(item) != AnyCodable(rhs[idx]) { return false }
            }
            return true
        case let (lhs as [String: Any], rhs as [String: Any]):
            guard lhs.count == rhs.count else { return false }
            for (k, v) in lhs {
                guard let rv = rhs[k], AnyCodable(v) == AnyCodable(rv) else { return false }
            }
            return true
        default:
            return false
        }
    }

    public func hash(into hasher: inout Hasher) {
        switch self.value {
        case is NSNull:
            hasher.combine(0)
        case let bool as Bool:
            hasher.combine(bool)
        case let int as Int:
            hasher.combine(int)
        case let double as Double:
            hasher.combine(double)
        case let string as String:
            hasher.combine(string)
        default:
            hasher.combine(String(describing: value))
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self.value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            self.value = bool
        } else if let int = try? container.decode(Int.self) {
            self.value = int
        } else if let double = try? container.decode(Double.self) {
            self.value = double
        } else if let string = try? container.decode(String.self) {
            self.value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            self.value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            self.value = dict.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "AnyCodable value cannot be decoded"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self.value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let int64 as Int64:
            try container.encode(int64)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            let context = EncodingError.Context(
                codingPath: container.codingPath,
                debugDescription: "Cannot encode AnyCodable value: \(self.value)"
            )
            throw EncodingError.invalidValue(self.value, context)
        }
    }
}

// MARK: - Agent Streaming Events

/// Strongly typed agent streaming event matching packages/core_v2/src/protocol/events.rs.
public enum AgentStreamEvent: Codable, Equatable {
    /// Indicates start of a new conversational turn or prompt response.
    case startTurn(sessionId: String, model: String?)
    /// Text token generated by the model.
    case token(sessionId: String, content: String)
    /// Extended thinking or chain-of-thought token generated by reasoning models.
    case thought(sessionId: String, content: String)
    /// Agent tool invocation call.
    case toolCall(sessionId: String, toolCallId: String, toolName: String, toolArgs: AnyCodable)
    /// Result received from a completed tool execution.
    case toolResult(sessionId: String, toolCallId: String, toolResult: AnyCodable, isError: Bool)
    /// Multi-turn or multi-step execution intermediate completion checkpoint.
    case stepComplete(sessionId: String, stepIndex: Int?)
    /// Agent run completed successfully.
    case done(sessionId: String, stopReason: String?)
    /// Error encountered during agent run.
    case error(sessionId: String, error: String)
    /// Agent execution aborted by user or timeout.
    case abort(sessionId: String)

    public var sessionId: String {
        switch self {
        case .startTurn(let id, _): return id
        case .token(let id, _): return id
        case .thought(let id, _): return id
        case .toolCall(let id, _, _, _): return id
        case .toolResult(let id, _, _, _): return id
        case .stepComplete(let id, _): return id
        case .done(let id, _): return id
        case .error(let id, _): return id
        case .abort(let id): return id
        }
    }

    public var eventType: String {
        switch self {
        case .startTurn: return "start_turn"
        case .token: return "token"
        case .thought: return "thought"
        case .toolCall: return "tool_call"
        case .toolResult: return "tool_result"
        case .stepComplete: return "step_complete"
        case .done: return "done"
        case .error: return "error"
        case .abort: return "abort"
        }
    }

    private enum CodingKeys: String, CodingKey {
        case type
        case sessionId
        case model
        case content
        case toolCallId
        case toolName
        case toolArgs
        case toolResult
        case isError
        case stepIndex
        case stopReason
        case error
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        let sessionId = (try? container.decode(String.self, forKey: .sessionId)) ?? ""

        switch type {
        case "start_turn", "startTurn":
            let model = try container.decodeIfPresent(String.self, forKey: .model)
            self = .startTurn(sessionId: sessionId, model: model)
        case "token":
            let content = try container.decode(String.self, forKey: .content)
            self = .token(sessionId: sessionId, content: content)
        case "thought":
            let content = try container.decode(String.self, forKey: .content)
            self = .thought(sessionId: sessionId, content: content)
        case "tool_call", "toolCall":
            let toolCallId = try container.decode(String.self, forKey: .toolCallId)
            let toolName = try container.decode(String.self, forKey: .toolName)
            let toolArgs = (try? container.decode(AnyCodable.self, forKey: .toolArgs)) ?? AnyCodable([String: Any]())
            self = .toolCall(sessionId: sessionId, toolCallId: toolCallId, toolName: toolName, toolArgs: toolArgs)
        case "tool_result", "toolResult":
            let toolCallId = try container.decode(String.self, forKey: .toolCallId)
            let toolResult = (try? container.decode(AnyCodable.self, forKey: .toolResult)) ?? AnyCodable("")
            let isError = (try? container.decode(Bool.self, forKey: .isError)) ?? false
            self = .toolResult(sessionId: sessionId, toolCallId: toolCallId, toolResult: toolResult, isError: isError)
        case "step_complete", "stepComplete":
            let stepIndex = try container.decodeIfPresent(Int.self, forKey: .stepIndex)
            self = .stepComplete(sessionId: sessionId, stepIndex: stepIndex)
        case "done":
            let stopReason = try container.decodeIfPresent(String.self, forKey: .stopReason)
            self = .done(sessionId: sessionId, stopReason: stopReason)
        case "error":
            let error = try container.decode(String.self, forKey: .error)
            self = .error(sessionId: sessionId, error: error)
        case "abort":
            self = .abort(sessionId: sessionId)
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unknown AgentStreamEvent type: \(type)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .startTurn(let sessionId, let model):
            try container.encode("start_turn", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encodeIfPresent(model, forKey: .model)
        case .token(let sessionId, let content):
            try container.encode("token", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encode(content, forKey: .content)
        case .thought(let sessionId, let content):
            try container.encode("thought", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encode(content, forKey: .content)
        case .toolCall(let sessionId, let toolCallId, let toolName, let toolArgs):
            try container.encode("tool_call", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encode(toolCallId, forKey: .toolCallId)
            try container.encode(toolName, forKey: .toolName)
            try container.encode(toolArgs, forKey: .toolArgs)
        case .toolResult(let sessionId, let toolCallId, let toolResult, let isError):
            try container.encode("tool_result", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encode(toolCallId, forKey: .toolCallId)
            try container.encode(toolResult, forKey: .toolResult)
            try container.encode(isError, forKey: .isError)
        case .stepComplete(let sessionId, let stepIndex):
            try container.encode("step_complete", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encodeIfPresent(stepIndex, forKey: .stepIndex)
        case .done(let sessionId, let stopReason):
            try container.encode("done", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encodeIfPresent(stopReason, forKey: .stopReason)
        case .error(let sessionId, let error):
            try container.encode("error", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
            try container.encode(error, forKey: .error)
        case .abort(let sessionId):
            try container.encode("abort", forKey: .type)
            try container.encode(sessionId, forKey: .sessionId)
        }
    }
}

// MARK: - Heartbeat & Sync Models

public struct PongMessage: Codable, Equatable {
    public let action: String
    public let timestamp: Int64

    public init(action: String = "PONG", timestamp: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) {
        self.action = action
        self.timestamp = timestamp
    }
}

public struct SessionSyncPayload: Codable, Equatable {
    public let sessionId: String
    public let isRunning: Bool
    public let replayEvents: [AnyCodable]
    public let fullAssistantText: String
    public let fullThoughtText: String
    public let pendingTool: AnyCodable?

    public init(
        sessionId: String,
        isRunning: Bool = false,
        replayEvents: [AnyCodable] = [],
        fullAssistantText: String = "",
        fullThoughtText: String = "",
        pendingTool: AnyCodable? = nil
    ) {
        self.sessionId = sessionId
        self.isRunning = isRunning
        self.replayEvents = replayEvents
        self.fullAssistantText = fullAssistantText
        self.fullThoughtText = fullThoughtText
        self.pendingTool = pendingTool
    }
}

// MARK: - Canonical Wire Message Envelope

public enum WireMessage: Codable, Equatable {
    case agentEvent(channel: String, data: AgentStreamEvent)
    case sessionSync(channel: String, data: SessionSyncPayload)
    case pong(PongMessage)
    case channel(channel: String, data: AnyCodable)
    case action(action: String, extra: [String: AnyCodable])

    private enum CodingKeys: String, CodingKey {
        case channel
        case action
        case data
        case timestamp
    }

    public init(from decoder: Decoder) throws {
        // 1. Check for PONG message
        if let container = try? decoder.container(keyedBy: CodingKeys.self),
           let action = try? container.decode(String.self, forKey: .action),
           action == "PONG" {
            let timestamp = (try? container.decode(Int64.self, forKey: .timestamp)) ?? 0
            self = .pong(PongMessage(action: action, timestamp: timestamp))
            return
        }

        // 2. Check for channel-based envelopes
        if let container = try? decoder.container(keyedBy: CodingKeys.self),
           let channel = try? container.decode(String.self, forKey: .channel) {
            if channel == "agent-event" {
                let data = try container.decode(AgentStreamEvent.self, forKey: .data)
                self = .agentEvent(channel: channel, data: data)
                return
            } else if channel == "session-sync" {
                let data = try container.decode(SessionSyncPayload.self, forKey: .data)
                self = .sessionSync(channel: channel, data: data)
                return
            } else {
                let data = try container.decode(AnyCodable.self, forKey: .data)
                self = .channel(channel: channel, data: data)
                return
            }
        }

        // 3. Action envelope
        if let container = try? decoder.container(keyedBy: CodingKeys.self),
           let action = try? container.decode(String.self, forKey: .action) {
            let single = try decoder.singleValueContainer()
            if let dict = try? single.decode([String: AnyCodable].self) {
                var extra = dict
                extra.removeValue(forKey: "action")
                self = .action(action: action, extra: extra)
                return
            }
            self = .action(action: action, extra: [:])
            return
        }

        throw DecodingError.dataCorrupted(
            DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unable to decode WireMessage")
        )
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .agentEvent(let channel, let data):
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(channel, forKey: .channel)
            try container.encode(data, forKey: .data)
        case .sessionSync(let channel, let data):
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(channel, forKey: .channel)
            try container.encode(data, forKey: .data)
        case .pong(let pong):
            try pong.encode(to: encoder)
        case .channel(let channel, let data):
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(channel, forKey: .channel)
            try container.encode(data, forKey: .data)
        case .action(let action, let extra):
            var dict: [String: AnyCodable] = extra
            dict["action"] = AnyCodable(action)
            var single = encoder.singleValueContainer()
            try single.encode(dict)
        }
    }
}

// MARK: - Generic IPC Envelopes

public struct IpcRequestEnvelope<T: Codable>: Codable {
    public var channel: String?
    public var args: [T]

    public init(channel: String? = nil, args: [T] = []) {
        self.channel = channel
        self.args = args
    }
}

public struct IpcResponseEnvelope<T: Codable>: Codable {
    public var data: T?
    public var error: String?

    public init(data: T? = nil, error: String? = nil) {
        self.data = data
        self.error = error
    }
}

// MARK: - Agent Execution DTOs

public struct AgentRunConfig: Codable, Equatable {
    public var provider: String?
    public var model: String?
    public var apiKey: String?
    public var baseUrl: String?
    public var instructions: String?
    public var attachments: [AnyCodable]?

    public init(
        provider: String? = nil,
        model: String? = nil,
        apiKey: String? = nil,
        baseUrl: String? = nil,
        instructions: String? = nil,
        attachments: [AnyCodable]? = nil
    ) {
        self.provider = provider
        self.model = model
        self.apiKey = apiKey
        self.baseUrl = baseUrl
        self.instructions = instructions
        self.attachments = attachments
    }
}

public struct AgentRunRequest: Codable, Equatable {
    public var sessionId: String
    public var prompt: String
    public var config: AgentRunConfig?
    public var currentAttachments: [AnyCodable]?

    public init(
        sessionId: String = "default-session",
        prompt: String,
        config: AgentRunConfig? = nil,
        currentAttachments: [AnyCodable]? = nil
    ) {
        self.sessionId = sessionId
        self.prompt = prompt
        self.config = config
        self.currentAttachments = currentAttachments
    }
}

public struct AgentStopRequest: Codable, Equatable {
    public var sessionId: String

    public init(sessionId: String) {
        self.sessionId = sessionId
    }
}

public struct AgentStatusResponse: Codable, Equatable {
    public var sessionId: String
    public var isRunning: Bool

    public init(sessionId: String, isRunning: Bool) {
        self.sessionId = sessionId
        self.isRunning = isRunning
    }
}

public struct ChatGenerateTitleRequest: Codable, Equatable {
    public var prompt: String
    public var response: String?
    public var provider: String?
    public var model: String?
    public var apiKey: String?
    public var baseUrl: String?

    public init(
        prompt: String,
        response: String? = nil,
        provider: String? = nil,
        model: String? = nil,
        apiKey: String? = nil,
        baseUrl: String? = nil
    ) {
        self.prompt = prompt
        self.response = response
        self.provider = provider
        self.model = model
        self.apiKey = apiKey
        self.baseUrl = baseUrl
    }
}

public struct ChatGenerateTitleResponse: Codable, Equatable {
    public var title: String?

    public init(title: String? = nil) {
        self.title = title
    }
}

// MARK: - WebSocket Session Subscriptions

public struct SubscribeSessionRequest: Codable, Equatable {
    public var action: String
    public var sessionId: String

    public init(sessionId: String) {
        self.action = WS_ACTION_SUBSCRIBE_SESSION
        self.sessionId = sessionId
    }
}

public struct UnsubscribeSessionRequest: Codable, Equatable {
    public var action: String
    public var sessionId: String

    public init(sessionId: String) {
        self.action = WS_ACTION_UNSUBSCRIBE_SESSION
        self.sessionId = sessionId
    }
}

public struct SyncSessionRequest: Codable, Equatable {
    public var action: String
    public var sessionId: String

    public init(sessionId: String) {
        self.action = WS_ACTION_SYNC_SESSION
        self.sessionId = sessionId
    }
}

// MARK: - System Diagnostics DTO

public struct SystemInfoResponse: Codable, Equatable {
    public var osName: String
    public var osVersion: String
    public var totalMemoryMb: UInt64
    public var usedMemoryMb: UInt64
    public var cpuCount: Int
    public var cpuUsagePercent: Float
    public var hostname: String

    enum CodingKeys: String, CodingKey {
        case osName = "os_name"
        case osVersion = "os_version"
        case totalMemoryMb = "total_memory_mb"
        case usedMemoryMb = "used_memory_mb"
        case cpuCount = "cpu_count"
        case cpuUsagePercent = "cpu_usage_percent"
        case hostname
    }

    public init(
        osName: String,
        osVersion: String,
        totalMemoryMb: UInt64,
        usedMemoryMb: UInt64,
        cpuCount: Int,
        cpuUsagePercent: Float,
        hostname: String
    ) {
        self.osName = osName
        self.osVersion = osVersion
        self.totalMemoryMb = totalMemoryMb
        self.usedMemoryMb = usedMemoryMb
        self.cpuCount = cpuCount
        self.cpuUsagePercent = cpuUsagePercent
        self.hostname = hostname
    }
}
