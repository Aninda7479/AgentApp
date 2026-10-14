//
// AppState.swift
// SuperAgent
//
// Central reactive state store managing sessions, conversation history,
// streaming thought/token buffers, and all 10 SuperAgent workspaces.
//

import Foundation
import Combine
import SwiftUI

// MARK: - Core Workspace Enums & Models

public enum WorkspaceCategory: String, CaseIterable, Identifiable {
    case chat = "chat"
    case computerUse = "computer_use"
    case browserLeasing = "browser_leasing"
    case securityGuardian = "security_guardian"
    case replConsole = "repl_console"
    case companion = "companion"
    case creativeStudio = "creative_studio"
    case pcbEcad = "pcb_ecad"
    case tasks = "tasks"
    case settings = "settings"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .chat: return "Agent Chat"
        case .computerUse: return "Computer Use"
        case .browserLeasing: return "Browser Leasing"
        case .securityGuardian: return "Security Guardian"
        case .replConsole: return "REPL Console"
        case .companion: return "3D Companion"
        case .creativeStudio: return "Creative Studio"
        case .pcbEcad: return "PCB & ECAD"
        case .tasks: return "Tasks & Routines"
        case .settings: return "Settings & Doctor"
        }
    }

    public var systemIcon: String {
        switch self {
        case .chat: return "bubble.left.and.bubble.right.fill"
        case .computerUse: return "display.2"
        case .browserLeasing: return "globe"
        case .securityGuardian: return "shield.checkered"
        case .replConsole: return "terminal.fill"
        case .companion: return "sparkles.rectangle.stack.fill"
        case .creativeStudio: return "photo.on.rectangle.angled"
        case .pcbEcad: return "cpu"
        case .tasks: return "checklist"
        case .settings: return "gearshape.2.fill"
        }
    }
}

public struct SessionItem: Identifiable, Codable, Equatable {
    public let id: String
    public var title: String
    public var updatedAt: Date
    public var isActive: Bool

    public init(id: String, title: String, updatedAt: Date = Date(), isActive: Bool = false) {
        self.id = id
        self.title = title
        self.updatedAt = updatedAt
        self.isActive = isActive
    }
}

public struct ToolCallInfo: Codable, Equatable {
    public let id: String
    public let name: String
    public let args: String

    public init(id: String, name: String, args: String) {
        self.id = id
        self.name = name
        self.args = args
    }
}

public struct ToolResultInfo: Codable, Equatable {
    public let id: String
    public let result: String
    public let isError: Bool

    public init(id: String, result: String, isError: Bool = false) {
        self.id = id
        self.result = result
        self.isError = isError
    }
}

public struct ChatMessage: Identifiable, Codable, Equatable {
    public let id: String
    public let role: String // "user", "assistant", "thought", "system"
    public var content: String
    public let sessionId: String
    public let timestamp: Date
    public var isStreaming: Bool
    public var toolCall: ToolCallInfo?
    public var toolResult: ToolResultInfo?

    public init(
        id: String = UUID().uuidString,
        role: String,
        content: String,
        sessionId: String,
        timestamp: Date = Date(),
        isStreaming: Bool = false,
        toolCall: ToolCallInfo? = nil,
        toolResult: ToolResultInfo? = nil
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.sessionId = sessionId
        self.timestamp = timestamp
        self.isStreaming = isStreaming
        self.toolCall = toolCall
        self.toolResult = toolResult
    }

    public static func user(sessionId: String, content: String) -> ChatMessage {
        ChatMessage(
            id: "usr-\(Int(Date().timeIntervalSince1970 * 1000))",
            role: "user",
            content: content,
            sessionId: sessionId
        )
    }

    public static func assistant(sessionId: String, content: String, isStreaming: Bool = false) -> ChatMessage {
        ChatMessage(
            id: "asst-\(Int(Date().timeIntervalSince1970 * 1000))",
            role: "assistant",
            content: content,
            sessionId: sessionId,
            isStreaming: isStreaming
        )
    }

    public static func thought(sessionId: String, content: String) -> ChatMessage {
        ChatMessage(
            id: "tht-\(Int(Date().timeIntervalSince1970 * 1000))",
            role: "thought",
            content: content,
            sessionId: sessionId
        )
    }
}

// MARK: - Central Application State

@MainActor
public final class AppState: ObservableObject {
    // Active Workspace Navigation
    @Published public var activeWorkspace: WorkspaceCategory = .chat

    // Chat Sessions & Feed
    @Published public var sessions: [SessionItem] = []
    @Published public var activeSessionId: String? = nil
    @Published public var messages: [String: [ChatMessage]] = [:]

    @Published public var streamingThoughtBuffer: String = ""
    @Published public var streamingTokenBuffer: String = ""
    @Published public var activeToolCall: ToolCallInfo? = nil

    @Published public var connectionStatus: ConnectionStatus = .disconnected
    @Published public var isGenerating: Bool = false
    @Published public var searchText: String = ""

    // Settings & Configuration
    @Published public var selectedModel: String = "gpt-4o"
    @Published public var selectedProvider: String = "openai"
    @Published public var customServerUrl: String = ""
    @Published public var customAuthToken: String = ""

    // MARK: - Computer Use Workspace State
    @Published public var windows: [WindowItemDemo] = DEMO_WINDOWS
    @Published public var selectedWindow: WindowItemDemo? = DEMO_WINDOWS.first
    @Published public var accessibilityTree: AccessibilityNodeDemo = DEMO_ACCESSIBILITY_TREE
    @Published public var captureMetadata: CaptureFrameMetadataDemo = DEMO_OCCLUDED_CAPTURE
    @Published public var settlingCountdownMs: Int = 1000
    @Published public var isSettlingActive: Bool = true

    // MARK: - Browser Leasing Workspace State
    @Published public var browserTabs: [BrowserTabDemo] = DEMO_CLAIMED_TABS
    @Published public var activeTab: BrowserTabDemo? = DEMO_CLAIMED_TABS.first
    @Published public var webMcpTools: [WebMcpToolDemo] = DEMO_WEBMCP_TOOLS
    @Published public var cdpEvents: [CdpEventDemo] = DEMO_CDP_EVENTS
    @Published public var inDomBadgeConnected: Bool = true

    // MARK: - Security Guardian Workspace State
    @Published public var isSecuritySheetPresented: Bool = false
    @Published public var securityConfirmations: [SecurityConfirmationDemo] = DEMO_SECURITY_CONFIRMATIONS
    @Published public var activeConfirmation: SecurityConfirmationDemo? = DEMO_SECURITY_CONFIRMATIONS.first
    @Published public var zoDecisions: [ZoDecisionBadgeDemo] = DEMO_ZO_DECISION_BADGES
    @Published public var isLockScreenShieldActive: Bool = false
    @Published public var vaultRecoveryBranches: [String] = DEMO_VAULT_RECOVERY_BRANCHES

    // MARK: - REPL Console Workspace State
    @Published public var replLines: [String] = DEMO_REPL_LOG_LINES
    @Published public var replScope: [ReplScopeNodeDemo] = DEMO_REPL_SCOPE
    @Published public var replPromptInput: String = ""
    @Published public var replTokenCount: Int = 14280
    @Published public var replMaxTokens: Int = 25000

    // MARK: - 3D Companion Workspace State
    @Published public var companionState: CompanionStateDemo = CompanionStateDemo()
    @Published public var selectedPhotoPreset: String = DEMO_PHOTO_PRESETS[0]

    // MARK: - Creative Studio Workspace State
    @Published public var imageParams: ImageGenParamsDemo = ImageGenParamsDemo()
    @Published public var filmstrip: [FilmstripItemDemo] = DEMO_FILMSTRIP_ITEMS
    @Published public var selectedFilmstripItem: FilmstripItemDemo? = DEMO_FILMSTRIP_ITEMS.first
    @Published public var videoJob: VideoJobDemo = DEMO_VIDEO_JOB
    @Published public var isEnhancingPrompt: Bool = false

    // MARK: - PCB & ECAD Workspace State
    @Published public var pcbComponents: [PcbComponentDemo] = DEMO_PCB_COMPONENTS
    @Published public var pcbNets: [PcbNetWireDemo] = DEMO_PCB_NETS
    @Published public var ercRules: [ErcRuleCheckDemo] = DEMO_ERC_RULES
    @Published public var pcbViewMode: String = "schematic" // "schematic", "layout", "3d"
    @Published public var hardwareCopilotPrompt: String = ""

    // MARK: - Tasks Workspace State
    @Published public var kanbanCards: [KanbanCardDemo] = DEMO_KANBAN_CARDS
    @Published public var routines: [CronRoutineDemo] = DEMO_ROUTINES
    @Published public var isRoutineModalPresented: Bool = false

    // MARK: - System Doctor & Governance State
    @Published public var doctorChecks: [DoctorCheckItemDemo] = DEMO_DOCTOR_CHECKS
    @Published public var isDoctorRunning: Bool = false

    public let daemonClient: DaemonClient
    private var cancellables = Set<AnyCancellable>()

    public init(daemonClient: DaemonClient? = nil) {
        let client = daemonClient ?? DaemonClient()
        self.daemonClient = client

        // Bind client connection status
        client.$connectionStatus
            .receive(on: DispatchQueue.main)
            .sink { [weak self] status in
                self?.connectionStatus = status
            }
            .store(in: &cancellables)

        // Bind streaming events
        client.eventSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.applyStreamEvent(event)
            }
            .store(in: &cancellables)

        // Bind session syncs
        client.syncSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.applySessionSync(payload)
            }
            .store(in: &cancellables)

        // Seed initial session if none
        if sessions.isEmpty {
            _ = createSession(title: "Welcome to SuperAgent")
        }
    }

    public func start() {
        daemonClient.connect()
    }

    public func reconnect() {
        daemonClient.disconnect()
        daemonClient.connect()
    }

    // MARK: - Session Management

    public func createSession(title: String = "New Chat") -> String {
        let newId = "session-\(Int(Date().timeIntervalSince1970 * 1000))"

        let item = SessionItem(
            id: newId,
            title: title,
            updatedAt: Date(),
            isActive: true
        )

        for i in 0..<sessions.count {
            sessions[i].isActive = false
        }

        sessions.insert(item, at: 0)
        activeSessionId = newId
        messages[newId] = []
        streamingTokenBuffer = ""
        streamingThoughtBuffer = ""
        activeToolCall = nil

        daemonClient.subscribeSession(newId)
        return newId
    }

    public func selectSession(id: String) {
        guard activeSessionId != id else { return }

        activeSessionId = id
        for i in 0..<sessions.count {
            sessions[i].isActive = (sessions[i].id == id)
        }

        streamingTokenBuffer = ""
        streamingThoughtBuffer = ""
        activeToolCall = nil

        daemonClient.subscribeSession(id)
        daemonClient.syncSession(id)
    }

    public func deleteSession(id: String) {
        daemonClient.unsubscribeSession(id)
        messages.removeValue(forKey: id)
        sessions.removeAll { $0.id == id }

        if activeSessionId == id {
            if let first = sessions.first {
                selectSession(id: first.id)
            } else {
                _ = createSession()
            }
        }
    }

    public var activeMessages: [ChatMessage] {
        guard let activeId = activeSessionId else { return [] }
        return messages[activeId] ?? []
    }

    public var currentSessionTitle: String {
        guard let id = activeSessionId else { return "SuperAgent" }
        return sessions.first(where: { $0.id == id })?.title ?? "SuperAgent"
    }

    public var filteredSessions: [SessionItem] {
        if searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return sessions
        }
        return sessions.filter {
            $0.title.localizedCaseInsensitiveContains(searchText)
        }
    }

    // MARK: - Prompt Execution & Streaming

    public func sendMessage(_ prompt: String) {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let sessionId = activeSessionId ?? createSession()

        // 1. Add user message
        let userMsg = ChatMessage.user(sessionId: sessionId, content: trimmed)
        var currentList = messages[sessionId] ?? []
        currentList.append(userMsg)
        messages[sessionId] = currentList

        // Update session timestamp & auto-title
        if let idx = sessions.firstIndex(where: { $0.id == sessionId }) {
            sessions[idx].updatedAt = Date()
            if sessions[idx].title == "New Chat" || sessions[idx].title == "Welcome to SuperAgent" {
                let shortTitle = trimmed.count > 30 ? String(trimmed.prefix(30)) + "..." : trimmed
                sessions[idx].title = shortTitle
            }
        }

        // 2. Clear streaming buffers
        streamingTokenBuffer = ""
        streamingThoughtBuffer = ""
        activeToolCall = nil
        isGenerating = true

        // 3. Dispatch to Daemon
        Task {
            do {
                try await daemonClient.runAgent(
                    sessionId: sessionId,
                    prompt: trimmed,
                    model: selectedModel,
                    provider: selectedProvider
                )
            } catch {
                await MainActor.run {
                    self.isGenerating = false
                    let errMsg = ChatMessage(
                        role: "system",
                        content: "Failed to dispatch prompt: \(error.localizedDescription)",
                        sessionId: sessionId
                    )
                    self.messages[sessionId]?.append(errMsg)
                }
            }
        }
    }

    public func stopGeneration() {
        guard let sessionId = activeSessionId, isGenerating else { return }
        Task {
            do {
                try await daemonClient.stopAgent(sessionId: sessionId)
            } catch {
                // Ignore stop errors
            }
            await MainActor.run {
                self.commitStreamingBuffers(sessionId: sessionId)
                self.isGenerating = false
            }
        }
    }

    // MARK: - Event Dispatch

    public func applyStreamEvent(_ event: AgentStreamEvent) {
        let sid = event.sessionId
        guard sid == activeSessionId || activeSessionId == nil else { return }

        switch event {
        case .startTurn:
            streamingTokenBuffer = ""
            streamingThoughtBuffer = ""
            activeToolCall = nil
            isGenerating = true

        case .token(_, let content):
            streamingTokenBuffer.append(content)

        case .thought(_, let content):
            streamingThoughtBuffer.append(content)

        case .toolCall(_, let toolCallId, let toolName, let toolArgs):
            let toolInfo = ToolCallInfo(id: toolCallId, name: toolName, args: toolArgs.description)
            activeToolCall = toolInfo
            let msg = ChatMessage(
                id: "tool-\(toolCallId)",
                role: "system",
                content: "Executing tool: \(toolName)",
                sessionId: sid,
                toolCall: toolInfo
            )
            messages[sid, default: []].append(msg)

        case .toolResult(_, let toolCallId, let toolResult, let isError):
            activeToolCall = nil
            let resInfo = ToolResultInfo(id: toolCallId, result: toolResult.description, isError: isError)
            let msg = ChatMessage(
                id: "res-\(toolCallId)",
                role: "system",
                content: isError ? "Tool execution error" : "Tool completed successfully",
                sessionId: sid,
                toolResult: resInfo
            )
            messages[sid, default: []].append(msg)

        case .stepComplete:
            break

        case .done:
            commitStreamingBuffers(sessionId: sid)
            isGenerating = false

        case .error(_, let err):
            commitStreamingBuffers(sessionId: sid)
            isGenerating = false
            let errMsg = ChatMessage(
                role: "system",
                content: "Error: \(err)",
                sessionId: sid
            )
            messages[sid, default: []].append(errMsg)

        case .abort:
            commitStreamingBuffers(sessionId: sid)
            isGenerating = false
            let abortMsg = ChatMessage(
                role: "system",
                content: "Generation aborted by user.",
                sessionId: sid
            )
            messages[sid, default: []].append(abortMsg)
        }
    }

    public func applySessionSync(_ payload: SessionSyncPayload) {
        guard payload.sessionId == activeSessionId else { return }
        isGenerating = payload.isRunning

        if !payload.fullThoughtText.isEmpty {
            streamingThoughtBuffer = payload.fullThoughtText
        }
        if !payload.fullAssistantText.isEmpty {
            streamingTokenBuffer = payload.fullAssistantText
        }
    }

    private func commitStreamingBuffers(sessionId: String) {
        if !streamingThoughtBuffer.isEmpty {
            let thoughtMsg = ChatMessage.thought(sessionId: sessionId, content: streamingThoughtBuffer)
            messages[sessionId, default: []].append(thoughtMsg)
            streamingThoughtBuffer = ""
        }

        if !streamingTokenBuffer.isEmpty {
            let asstMsg = ChatMessage.assistant(sessionId: sessionId, content: streamingTokenBuffer)
            messages[sessionId, default: []].append(asstMsg)
            streamingTokenBuffer = ""
        }

        activeToolCall = nil
    }

    // MARK: - Workspace-Specific Actions

    // Computer Use
    public func targetWindowForCua(_ window: WindowItemDemo) {
        selectedWindow = window
        settlingCountdownMs = 1000
        isSettlingActive = true
    }

    // Browser Leasing
    public func renewTabLease(id: String) {
        if let idx = browserTabs.firstIndex(where: { $0.id == id }) {
            browserTabs[idx].remainingSeconds = browserTabs[idx].totalSeconds
        }
    }

    public func releaseTabLease(id: String) {
        browserTabs.removeAll { $0.id == id }
        if activeTab?.id == id {
            activeTab = browserTabs.first
        }
    }

    // Security Guardian
    public func approveConfirmation(id: String) {
        securityConfirmations.removeAll { $0.id == id }
        activeConfirmation = securityConfirmations.first
    }

    public func declineConfirmation(id: String) {
        securityConfirmations.removeAll { $0.id == id }
        activeConfirmation = securityConfirmations.first
    }

    // REPL Console
    public func runReplCommand(_ command: String) {
        let trimmed = command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        replLines.append("> \(trimmed)")
        replPromptInput = ""
        // Simulate execution response
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.replLines.append("< \u{001B}[32m[Return] Expression evaluated successfully\u{001B}[0m")
            self.replTokenCount += 24
        }
    }

    public func resetReplSession() {
        replLines.removeAll()
        replLines.append("[14:25:00] \u{001B}[33mSession reset (js_reset). V8 context recycled.\u{001B}[0m")
        replTokenCount = 120
    }

    // Companion
    public func setCompanionMood(_ mood: CompanionMoodDemo) {
        companionState.currentMood = mood
    }

    public func toggleFloatingPet() {
        companionState.isFloatingPetActive.toggle()
    }

    // Creative Studio
    public func enhanceVideoPrompt() {
        isEnhancingPrompt = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            self.videoJob = VideoJobDemo(
                id: "vid-job-\(Int.random(in: 100...999))",
                prompt: "Cinematic 35mm anamorphic wide shot, high-contrast chiaroscuro lighting, subtle volumetric fog drifting across neon street reflective wet asphalt, 24fps motion blur",
                engine: "Wan2.1",
                status: "diffusing",
                progressPercent: 34
            )
            self.isEnhancingPrompt = false
        }
    }

    // PCB ECAD
    public func runErcCheck() {
        // Trigger verification
        ercRules = DEMO_ERC_RULES
    }

    // Tasks
    public func moveKanbanCard(id: String, toColumn: String) {
        if let idx = kanbanCards.firstIndex(where: { $0.id == id }) {
            kanbanCards[idx].column = toColumn
        }
    }

    public func toggleRoutine(id: String) {
        if let idx = routines.firstIndex(where: { $0.id == id }) {
            routines[idx].isEnabled.toggle()
        }
    }

    // System Doctor
    public func runDoctorDiagnostics() {
        isDoctorRunning = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            self.doctorChecks = DEMO_DOCTOR_CHECKS
            self.isDoctorRunning = false
        }
    }
}
