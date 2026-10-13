//
// AppState.swift
// SuperAgent
//
// Central reactive state store managing sessions, conversation history,
// streaming thought/token buffers, and daemon lifecycle.
//

import Foundation
import Combine
import SwiftUI

// MARK: - Models

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
        let isFirst = sessions.isEmpty

        let item = SessionItem(
            id: newId,
            title: title,
            updatedAt: Date(),
            isActive: true
        )

        // Mark existing inactive
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

        // Update session timestamp & auto-title if first message
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
}
