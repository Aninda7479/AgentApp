//
// DaemonClient.swift
// SuperAgent
//
// High-performance URLSession HTTP/2 and WebSocket client communicating
// with SuperAgent Core v2 Daemon on port 1469 (or dynamic discovery).
//

import Foundation
import Combine

// MARK: - Connection Status

public enum ConnectionStatus: String, Codable, Equatable {
    case disconnected
    case connecting
    case connected
    case error

    public var title: String {
        switch self {
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting..."
        case .connected: return "Connected"
        case .error: return "Error"
        }
    }
}

// MARK: - Client Errors

public enum DaemonError: LocalizedError, Equatable {
    case invalidUrl(String)
    case httpError(statusCode: Int, message: String)
    case ipcError(String)
    case webSocketClosed(reason: String)
    case decodingError(String)
    case notConnected
    case unknown(String)

    public var errorDescription: String? {
        switch self {
        case .invalidUrl(let url): return "Invalid URL: \(url)"
        case .httpError(let code, let msg): return "HTTP \(code): \(msg)"
        case .ipcError(let msg): return "IPC error: \(msg)"
        case .webSocketClosed(let reason): return "WebSocket closed: \(reason)"
        case .decodingError(let msg): return "Decoding error: \(msg)"
        case .notConnected: return "Not connected to Core v2 daemon"
        case .unknown(let msg): return "Error: \(msg)"
        }
    }
}

// MARK: - Discovery Service

public enum DaemonDiscovery {
    public static let defaultPort: UInt16 = 1469

    /// Dynamically discovers running SuperAgent core daemon port.
    /// Checks SUPERAGENT_PORT env var first, then ~/.superagent/web-server.lock
    /// and ~/.superagent/runtime/web-server.lock, falling back to 1469.
    public static func discoverPort() -> UInt16 {
        // 1. Env variable SUPERAGENT_PORT
        if let envPort = ProcessInfo.processInfo.environment["SUPERAGENT_PORT"],
           let port = UInt16(envPort.trimmingCharacters(in: .whitespacesAndNewlines)),
           port > 0 {
            return port
        }

        // 2. Lockfile paths
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            "\(home)/.superagent/web-server.lock",
            "\(home)/.superagent/runtime/web-server.lock",
            "./.superagent/web-server.lock",
            "./.superagent/runtime/web-server.lock"
        ]

        for path in candidates {
            if let data = FileManager.default.contents(atPath: path),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if let portNum = json["port"] as? Int, portNum > 0 && portNum <= 65535 {
                    return UInt16(portNum)
                }
                if let portStr = json["port"] as? String,
                   let portNum = UInt16(portStr.trimmingCharacters(in: .whitespacesAndNewlines)),
                   portNum > 0 {
                    return portNum
                }
            }
        }

        return defaultPort
    }

    /// Discovers authentication token from environment or local auth file.
    public static func discoverToken() -> String? {
        if let envToken = ProcessInfo.processInfo.environment["SUPERAGENT_TOKEN"], !envToken.isEmpty {
            return envToken
        }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let authPath = "\(home)/.superagent/auth.json"
        if let data = FileManager.default.contents(atPath: authPath),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let token = json["token"] as? String, !token.isEmpty {
            return token
        }
        return nil
    }
}

// MARK: - Daemon Configuration

public struct DaemonClientConfig: Equatable {
    public var httpBaseUrl: String
    public var wsBaseUrl: String
    public var sessionToken: String?

    public init(httpBaseUrl: String, wsBaseUrl: String, sessionToken: String? = nil) {
        self.httpBaseUrl = httpBaseUrl
        self.wsBaseUrl = wsBaseUrl
        self.sessionToken = sessionToken
    }

    public static func fromPort(_ port: UInt16, sessionToken: String? = nil) -> DaemonClientConfig {
        return DaemonClientConfig(
            httpBaseUrl: "http://127.0.0.1:\(port)",
            wsBaseUrl: "ws://127.0.0.1:\(port)/ws",
            sessionToken: sessionToken
        )
    }

    public static func fromServer(_ serverUrl: String, sessionToken: String? = nil) -> DaemonClientConfig {
        var base = serverUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        if base.hasSuffix("/") { base.removeLast() }

        let wsScheme = base.hasPrefix("https://") ? "wss://" : "ws://"
        let hostPart = base
            .replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "http://", with: "")

        return DaemonClientConfig(
            httpBaseUrl: base,
            wsBaseUrl: "\(wsScheme)\(hostPart)/ws",
            sessionToken: sessionToken
        )
    }

    public static func discover(server: String? = nil, port: UInt16? = nil, token: String? = nil) -> DaemonClientConfig {
        if let srv = server, !srv.isEmpty {
            return fromServer(srv, sessionToken: token ?? DaemonDiscovery.discoverToken())
        }
        let discoveredPort = port ?? DaemonDiscovery.discoverPort()
        return fromPort(discoveredPort, sessionToken: token ?? DaemonDiscovery.discoverToken())
    }
}

// MARK: - High-Performance Daemon Client

public final class DaemonClient: ObservableObject {
    @Published public private(set) var connectionStatus: ConnectionStatus = .disconnected
    @Published public private(set) var currentPort: UInt16 = 1469

    public let eventSubject = PassthroughSubject<AgentStreamEvent, Never>()
    public let syncSubject = PassthroughSubject<SessionSyncPayload, Never>()
    public let wireSubject = PassthroughSubject<WireMessage, Never>()

    public var config: DaemonClientConfig {
        didSet {
            currentPort = DaemonClient.extractPort(from: config.httpBaseUrl)
        }
    }

    private let urlSession: URLSession
    private var webSocketTask: URLSessionWebSocketTask?
    private var subscribedSessions: Set<String> = []
    private let subscriptionLock = NSLock()

    private var isExplicitDisconnect: Bool = false
    private var reconnectAttempt: Int = 0
    private var pingTimerTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?

    private let jsonDecoder = JSONDecoder()
    private let jsonEncoder = JSONEncoder()

    public init(config: DaemonClientConfig? = nil) {
        let activeConfig = config ?? DaemonClientConfig.discover()
        self.config = activeConfig
        self.currentPort = DaemonClient.extractPort(from: activeConfig.httpBaseUrl)

        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.httpAdditionalHeaders = [
            "Accept": "application/json",
            "User-Agent": "SuperAgent-macOS/2.0"
        ]
        sessionConfig.timeoutIntervalForRequest = 30
        sessionConfig.timeoutIntervalForResource = 300
        self.urlSession = URLSession(configuration: sessionConfig)
    }

    deinit {
        disconnect()
    }

    private static func extractPort(from urlString: String) -> UInt16 {
        if let url = URL(string: urlString), let port = url.port {
            return UInt16(port)
        }
        return DaemonDiscovery.defaultPort
    }

    // MARK: - WebSocket Connection Management

    public func connect() {
        isExplicitDisconnect = false
        reconnectTask?.cancel()
        reconnectTask = nil

        guard let wsUrl = URL(string: config.wsBaseUrl) else {
            DispatchQueue.main.async {
                self.connectionStatus = .error
            }
            return
        }

        DispatchQueue.main.async {
            self.connectionStatus = .connecting
        }

        var request = URLRequest(url: wsUrl)
        if let token = config.sessionToken, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let task = urlSession.webSocketTask(with: request)
        self.webSocketTask = task
        task.resume()

        startPingTimer()
        listenWebSocket()
    }

    public func disconnect() {
        isExplicitDisconnect = true
        reconnectTask?.cancel()
        reconnectTask = nil
        pingTimerTask?.cancel()
        pingTimerTask = nil

        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil

        DispatchQueue.main.async {
            self.connectionStatus = .disconnected
        }
    }

    private func listenWebSocket() {
        guard let task = webSocketTask else { return }

        task.receive { [weak self] result in
            guard let self = self else { return }

            switch result {
            case .success(let message):
                self.handleWebSocketMessage(message)
                self.listenWebSocket()

            case .failure(let error):
                if !self.isExplicitDisconnect {
                    DispatchQueue.main.async {
                        self.connectionStatus = .disconnected
                    }
                    self.scheduleReconnect(error: error)
                }
            }
        }
    }

    private func handleWebSocketMessage(_ message: URLSessionWebSocketTask.Message) {
        let rawData: Data
        switch message {
        case .string(let text):
            guard let data = text.data(using: .utf8) else { return }
            rawData = data
        case .data(let data):
            rawData = data
        @unknown default:
            return
        }

        do {
            let wire = try jsonDecoder.decode(WireMessage.self, from: rawData)

            DispatchQueue.main.async {
                if self.connectionStatus != .connected {
                    self.connectionStatus = .connected
                    self.reconnectAttempt = 0
                    self.resubscribeActiveSessions()
                }

                self.wireSubject.send(wire)

                switch wire {
                case .agentEvent(_, let event):
                    self.eventSubject.send(event)
                case .sessionSync(_, let payload):
                    self.syncSubject.send(payload)
                case .pong:
                    break
                case .channel, .action:
                    break
                }
            }
        } catch {
            // Silently ignore or debug log parse errors
        }
    }

    private func scheduleReconnect(error: Error? = nil) {
        guard !isExplicitDisconnect else { return }

        reconnectTask?.cancel()
        reconnectAttempt += 1

        let backoff = min(pow(1.5, Double(reconnectAttempt)) * 0.5, 12.0)
        let jitter = Double.random(in: 0.0...0.3)
        let delaySeconds = backoff + jitter

        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delaySeconds * 1_000_000_000))
            guard let self = self, !self.isExplicitDisconnect else { return }
            self.connect()
        }
    }

    private func startPingTimer() {
        pingTimerTask?.cancel()
        pingTimerTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 20_000_000_000) // 20s
                guard let self = self, let task = self.webSocketTask else { break }

                let ping = PongMessage(action: WS_ACTION_PING)
                if let pingData = try? self.jsonEncoder.encode(ping),
                   let pingStr = String(data: pingData, encoding: .utf8) {
                    task.send(.string(pingStr)) { _ in }
                }
            }
        }
    }

    // MARK: - Session Subscriptions

    public func subscribeSession(_ sessionId: String) {
        subscriptionLock.lock()
        subscribedSessions.insert(sessionId)
        subscriptionLock.unlock()

        sendWebSocketAction(action: WS_ACTION_SUBSCRIBE_SESSION, sessionId: sessionId)
    }

    public func unsubscribeSession(_ sessionId: String) {
        subscriptionLock.lock()
        subscribedSessions.remove(sessionId)
        subscriptionLock.unlock()

        sendWebSocketAction(action: WS_ACTION_UNSUBSCRIBE_SESSION, sessionId: sessionId)
    }

    public func syncSession(_ sessionId: String) {
        sendWebSocketAction(action: WS_ACTION_SYNC_SESSION, sessionId: sessionId)
    }

    private func resubscribeActiveSessions() {
        subscriptionLock.lock()
        let sessions = Array(subscribedSessions)
        subscriptionLock.unlock()

        for sid in sessions {
            sendWebSocketAction(action: WS_ACTION_SUBSCRIBE_SESSION, sessionId: sid)
            sendWebSocketAction(action: WS_ACTION_SYNC_SESSION, sessionId: sid)
        }
    }

    private func sendWebSocketAction(action: String, sessionId: String) {
        guard let task = webSocketTask else { return }
        let payload: [String: String] = [
            "action": action,
            "sessionId": sessionId
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let str = String(data: data, encoding: .utf8) {
            task.send(.string(str)) { _ in }
        }
    }

    // MARK: - HTTP/2 IPC Invocation

    public func invokeIpc<T: Codable, R: Codable>(channel: String, args: [T]) async throws -> R {
        guard let url = URL(string: "\(config.httpBaseUrl)/api/ipc/\(channel)") else {
            throw DaemonError.invalidUrl("\(config.httpBaseUrl)/api/ipc/\(channel)")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = config.sessionToken, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let envelope = IpcRequestEnvelope(channel: channel, args: args)
        request.httpBody = try jsonEncoder.encode(envelope)

        let (data, response) = try await urlSession.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw DaemonError.unknown("Invalid HTTP response")
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorMsg = String(data: data, encoding: .utf8) ?? "HTTP error \(httpResponse.statusCode)"
            throw DaemonError.httpError(statusCode: httpResponse.statusCode, message: errorMsg)
        }

        let resEnvelope = try jsonDecoder.decode(IpcResponseEnvelope<R>.self, from: data)

        if let err = resEnvelope.error {
            throw DaemonError.ipcError(err)
        }

        guard let resData = resEnvelope.data else {
            throw DaemonError.unknown("No data payload returned for IPC channel \(channel)")
        }

        return resData
    }

    // MARK: - High-Level Agent APIs

    public func runAgent(
        sessionId: String,
        prompt: String,
        model: String? = nil,
        provider: String? = nil,
        attachments: [AnyCodable]? = nil
    ) async throws {
        let config = AgentRunConfig(
            provider: provider,
            model: model,
            attachments: attachments
        )
        let req = AgentRunRequest(
            sessionId: sessionId,
            prompt: prompt,
            config: config
        )
        let _: AnyCodable = try await invokeIpc(channel: AGENT_RUN, args: [req])
    }

    public func stopAgent(sessionId: String) async throws {
        let req = AgentStopRequest(sessionId: sessionId)
        let _: AnyCodable = try await invokeIpc(channel: AGENT_STOP, args: [req])
    }

    public func getAgentStatus(sessionId: String) async throws -> AgentStatusResponse {
        let req = AgentStopRequest(sessionId: sessionId)
        return try await invokeIpc(channel: AGENT_STATUS, args: [req])
    }

    public func fetchChats() async throws -> AnyCodable {
        return try await invokeIpc(channel: CHATS_READ, args: [AnyCodable([String: Any]())])
    }

    public func fetchSystemInfo() async throws -> SystemInfoResponse {
        return try await invokeIpc(channel: SYSTEM_INFO, args: [AnyCodable([String: Any]())])
    }

    public func readSettings() async throws -> AnyCodable {
        return try await invokeIpc(channel: SETTINGS_READ, args: [AnyCodable([String: Any]())])
    }

    public func writeSettings(_ settings: AnyCodable) async throws {
        let _: AnyCodable = try await invokeIpc(channel: SETTINGS_WRITE, args: [settings])
    }
}
