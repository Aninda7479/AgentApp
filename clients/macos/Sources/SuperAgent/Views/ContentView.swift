//
// ContentView.swift
// SuperAgent
//
// Native macOS split view interface with sidebar session management,
// chat message feed, thought disclosures, and streaming feedback.
//

import SwiftUI
import AppKit

public struct ContentView: View {
    @EnvironmentObject private var appState: AppState
    @State private var isThoughtExpanded: Bool = true

    public init() {}

    public var body: some View {
        NavigationSplitView {
            sidebarView
        } detail: {
            detailChatView
        }
        .navigationSplitViewStyle(.balanced)
        .onAppear {
            appState.start()
        }
    }

    // MARK: - Sidebar View

    private var sidebarView: some View {
        VStack(spacing: 0) {
            // New Chat and Search Bar
            VStack(spacing: 10) {
                Button {
                    _ = appState.createSession(title: "New Chat")
                } label: {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                            .foregroundColor(.accentColor)
                        Text("New Chat")
                            .fontWeight(.medium)
                        Spacer()
                        Text("⌘N")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(Color(NSColor.controlBackgroundColor))
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)

                // Search field
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                        .font(.system(size: 12))
                    TextField("Search chats...", text: $appState.searchText)
                        .textFieldStyle(.plain)
                        .font(.system(size: 12))
                    if !appState.searchText.isEmpty {
                        Button {
                            appState.searchText = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                                .font(.system(size: 11))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Color(NSColor.controlBackgroundColor).opacity(0.8))
                .cornerRadius(6)
            }
            .padding(12)

            Divider()

            // Session List
            List(appState.filteredSessions, selection: Binding(
                get: { appState.activeSessionId },
                set: { if let id = $0 { appState.selectSession(id: id) } }
            )) { session in
                SessionRow(session: session)
                    .tag(session.id)
                    .contextMenu {
                        Button(role: .destructive) {
                            appState.deleteSession(id: session.id)
                        } label: {
                            Label("Delete Chat", systemImage: "trash")
                        }
                    }
            }
            .listStyle(.sidebar)

            Divider()

            // Daemon status footer
            HStack(spacing: 8) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 8, height: 8)
                Text(appState.connectionStatus.title)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                Spacer()
                Text("Port \(appState.daemonClient.currentPort)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.secondary.opacity(0.8))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(NSColor.windowBackgroundColor))
        }
        .frame(minWidth: 220, idealWidth: 260)
    }

    // MARK: - Detail Chat Feed View

    private var detailChatView: some View {
        VStack(spacing: 0) {
            // Top Navigation Header
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(currentSessionTitle)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                    Text("SuperAgent Core v2 Daemon")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }

                Spacer()

                // Reconnect action button
                if appState.connectionStatus != .connected {
                    Button {
                        appState.reconnect()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.clockwise")
                            Text("Reconnect")
                        }
                        .font(.system(size: 11))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.accentColor.opacity(0.15))
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color(NSColor.windowBackgroundColor))

            Divider()

            // Scrollable Message Feed
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 16) {
                        ForEach(appState.activeMessages) { message in
                            MessageRow(message: message)
                        }

                        // Live Streaming Thought Card
                        if !appState.streamingThoughtBuffer.isEmpty && appState.isGenerating {
                            StreamingThoughtCard(
                                thoughtText: appState.streamingThoughtBuffer,
                                isExpanded: $isThoughtExpanded
                            )
                        }

                        // Live Active Tool Call Card
                        if let toolCall = appState.activeToolCall {
                            ActiveToolCard(toolCall: toolCall)
                        }

                        // Live Streaming Assistant Bubble
                        if !appState.streamingTokenBuffer.isEmpty && appState.isGenerating {
                            StreamingAssistantBubble(tokenText: appState.streamingTokenBuffer)
                        }

                        Color.clear
                            .frame(height: 1)
                            .id("feedBottomAnchor")
                    }
                    .padding(16)
                }
                .onChange(of: appState.streamingTokenBuffer) { _ in
                    proxy.scrollTo("feedBottomAnchor", anchor: .bottom)
                }
                .onChange(of: appState.streamingThoughtBuffer) { _ in
                    proxy.scrollTo("feedBottomAnchor", anchor: .bottom)
                }
                .onChange(of: appState.activeMessages.count) { _ in
                    proxy.scrollTo("feedBottomAnchor", anchor: .bottom)
                }
            }

            Divider()

            // Composer Bar
            ComposerBar()
        }
        .frame(minWidth: 480)
        .background(Color(NSColor.textBackgroundColor))
    }

    private var currentSessionTitle: String {
        if let activeId = appState.activeSessionId,
           let session = appState.sessions.first(where: { $0.id == activeId }) {
            return session.title
        }
        return "New Chat"
    }

    private var statusColor: Color {
        switch appState.connectionStatus {
        case .connected: return .green
        case .connecting: return .yellow
        case .disconnected: return .gray
        case .error: return .red
        }
    }
}

// MARK: - Subviews

struct SessionRow: View {
    let session: SessionItem

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "bubble.left.and.bubble.right")
                .foregroundColor(session.isActive ? .accentColor : .secondary)
                .font(.system(size: 13))

            VStack(alignment: .leading, spacing: 2) {
                Text(session.title)
                    .font(.system(size: 12, weight: session.isActive ? .semibold : .regular))
                    .lineLimit(1)
                Text(session.updatedAt, style: .time)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }
}

struct MessageRow: View {
    let message: ChatMessage

    var body: some View {
        switch message.role {
        case "user":
            HStack {
                Spacer(minLength: 48)
                VStack(alignment: .trailing, spacing: 4) {
                    Text(message.content)
                        .font(.system(size: 13))
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Color.accentColor)
                        .cornerRadius(14)
                }
            }

        case "assistant":
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "sparkles")
                    .foregroundColor(.accentColor)
                    .font(.system(size: 15))
                    .padding(6)
                    .background(Color.accentColor.opacity(0.12))
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 4) {
                    Text(message.content)
                        .font(.system(size: 13))
                        .lineSpacing(4)
                        .textSelection(.enabled)
                }
                Spacer(minLength: 48)
            }

        case "thought":
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Image(systemName: "lightbulb.fill")
                            .foregroundColor(.orange)
                            .font(.system(size: 11))
                        Text("Thought Process")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.secondary)
                    }

                    Text(message.content)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(.secondary)
                        .lineSpacing(3)
                        .textSelection(.enabled)
                }
                .padding(10)
                .background(Color(NSColor.controlBackgroundColor))
                .cornerRadius(8)
                Spacer(minLength: 48)
            }

        case "system":
            HStack {
                if let tool = message.toolCall {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            Image(systemName: "terminal.fill")
                                .foregroundColor(.cyan)
                                .font(.system(size: 11))
                            Text("Tool Invocation: \(tool.name)")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        Text(tool.args)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.secondary)
                    }
                    .padding(8)
                    .background(Color(NSColor.controlBackgroundColor))
                    .cornerRadius(8)
                } else if let result = message.toolResult {
                    HStack(spacing: 6) {
                        Image(systemName: result.isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                            .foregroundColor(result.isError ? .red : .green)
                            .font(.system(size: 11))
                        Text(result.result)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.secondary)
                    }
                    .padding(8)
                    .background(Color(NSColor.controlBackgroundColor))
                    .cornerRadius(8)
                } else {
                    Text(message.content)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.secondary)
                        .padding(.vertical, 2)
                }
                Spacer()
            }

        default:
            EmptyView()
        }
    }
}

struct StreamingThoughtCard: View {
    let thoughtText: String
    @Binding var isExpanded: Bool

    var body: some View {
        HStack {
            DisclosureGroup(isExpanded: $isExpanded) {
                Text(thoughtText)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(.secondary)
                    .lineSpacing(3)
                    .padding(.top, 4)
                    .textSelection(.enabled)
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "brain.head.profile")
                        .foregroundColor(.orange)
                        .font(.system(size: 12))
                    Text("Thinking...")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary)
                }
            }
            .padding(10)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(8)
            Spacer(minLength: 48)
        }
    }
}

struct ActiveToolCard: View {
    let toolCall: ToolCallInfo

    var body: some View {
        HStack {
            HStack(spacing: 8) {
                ProgressView()
                    .controlSize(.small)
                Text("Running tool: \(toolCall.name)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
            }
            .padding(8)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(8)
            Spacer()
        }
    }
}

struct StreamingAssistantBubble: View {
    let tokenText: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "sparkles")
                .foregroundColor(.accentColor)
                .font(.system(size: 15))
                .padding(6)
                .background(Color.accentColor.opacity(0.12))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .bottom, spacing: 4) {
                    Text(tokenText)
                        .font(.system(size: 13))
                        .lineSpacing(4)
                        .textSelection(.enabled)

                    // Pulsing typing cursor
                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 6, height: 6)
                        .padding(.bottom, 3)
                }
            }
            Spacer(minLength: 48)
        }
    }
}
