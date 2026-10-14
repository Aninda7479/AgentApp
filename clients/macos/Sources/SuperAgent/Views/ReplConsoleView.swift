//
// ReplConsoleView.swift
// SuperAgent
//
// Native macOS Interactive Scripting & In-Process NodeREPL Console.
// Features a 25,000-token virtualized terminal buffer, ANSI color parser,
// live variable/scope inspector tree, and session reset (js_reset).
//

import SwiftUI
import AppKit

public struct ReplConsoleView: View {
    @EnvironmentObject private var appState: AppState
    @State private var isAutoScroll: Bool = true
    @State private var commandInput: String = ""

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            toolbarSection
            Divider()

            GeometryReader { geometry in
                HStack(spacing: 0) {
                    // Left Main Panel: Virtualized Terminal Output Stream
                    terminalStreamColumn
                        .frame(maxWidth: .infinity)

                    Divider()

                    // Right Panel: Live Variable & Scope Tree Inspector (320px)
                    scopeInspectorColumn
                        .frame(width: 320)
                }
            }

            Divider()

            // Bottom Prompt Input Line
            promptInputBar
        }
        .background(Color(NSColor.windowBackgroundColor))
    }

    // MARK: - Toolbar Section

    private var toolbarSection: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color.cyan)
                    .frame(width: 8, height: 8)
                Text("In-Process REPL Console [cua-repl]")
                    .font(.system(.caption, design: .monospaced, weight: .semibold))
            }

            Spacer()

            Text("\(appState.replTokenCount) / \(appState.replMaxTokens) Tokens")
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(appState.replTokenCount > 20000 ? .orange : .secondary)

            Divider().frame(height: 14)

            Button {
                appState.resetReplSession()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.counterclockwise")
                    Text("Reset (js_reset)")
                }
                .font(.caption)
            }

            Button {
                appState.replLines.removeAll()
            } label: {
                Label("Clear", systemImage: "trash")
                    .font(.caption)
            }

            Toggle("Auto-Scroll", isOn: $isAutoScroll)
                .toggleStyle(.checkbox)
                .font(.caption)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color(NSColor.controlBackgroundColor))
    }

    // MARK: - Left Main Panel: Virtualized Terminal Output Stream

    private var terminalStreamColumn: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 3) {
                    // Truncation Notice
                    HStack(spacing: 6) {
                        Image(systemName: "info.circle")
                            .foregroundColor(.cyan)
                        Text("Ring Buffer Capacity: 25,000 output tokens. Oldest logs cleanly evicted upon limit.")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.secondary)
                    }
                    .padding(.bottom, 6)

                    ForEach(Array(appState.replLines.enumerated()), id: \.offset) { index, line in
                        AnsiLineView(rawText: line)
                            .id(index)
                    }
                }
                .padding(12)
            }
            .background(Color(red: 0.05, green: 0.07, blue: 0.12))
            .onChange(of: appState.replLines.count) { _ in
                if isAutoScroll, !appState.replLines.isEmpty {
                    withAnimation {
                        proxy.scrollTo(appState.replLines.count - 1, anchor: .bottom)
                    }
                }
            }
        }
    }

    // MARK: - Right Panel: Live Variable & Scope Tree Inspector

    private var scopeInspectorColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("LIVE VARIABLE & SCOPE INSPECTOR")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("Global (V8)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.cyan)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(appState.replScope) { node in
                        ScopeNodeView(node: node, depth: 0)
                    }
                }
                .padding(10)
            }
        }
        .background(Color(NSColor.controlBackgroundColor).opacity(0.4))
    }

    // MARK: - Bottom Prompt Input Bar

    private var promptInputBar: some View {
        HStack(spacing: 8) {
            Text(">")
                .font(.system(size: 13, design: .monospaced, weight: .bold))
                .foregroundColor(.cyan)

            TextField("Type javascript expression, cua, or sky command...", text: $commandInput)
                .textFieldStyle(.plain)
                .font(.system(size: 12, design: .monospaced))
                .onSubmit {
                    appState.runReplCommand(commandInput)
                    commandInput = ""
                }

            Button {
                appState.runReplCommand(commandInput)
                commandInput = ""
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .foregroundColor(.accentColor)
                    .font(.system(size: 16))
            }
            .buttonStyle(.plain)
            .disabled(commandInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(NSColor.controlBackgroundColor))
    }
}

// MARK: - Subviews: Scope Node & ANSI Line

struct ScopeNodeView: View {
    let node: ReplScopeNodeDemo
    let depth: Int
    @State private var isExpanded: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                if node.children != nil {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                        .frame(width: 12)
                        .onTapGesture {
                            isExpanded.toggle()
                        }
                } else {
                    Spacer().frame(width: 12)
                }

                Text(node.name + ":")
                    .font(.system(size: 11, design: .monospaced, weight: .medium))
                    .foregroundColor(.secondary)

                Text(node.valuePreview)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.primary)
                    .lineLimit(1)
            }
            .padding(.leading, CGFloat(depth * 12))

            if isExpanded, let children = node.children {
                ForEach(children) { child in
                    ScopeNodeView(node: child, depth: depth + 1)
                }
            }
        }
    }
}

// ANSI Escape Sequence Parser Component
struct AnsiLineView: View {
    let rawText: String

    var body: some View {
        let segments = parseAnsi(rawText)
        HStack(spacing: 0) {
            ForEach(0..<segments.count, id: \.self) { i in
                let seg = segments[i]
                Text(seg.text)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(seg.color)
            }
        }
    }

    private struct TextSegment {
        let text: String
        let color: Color
    }

    private func parseAnsi(_ input: String) -> [TextSegment] {
        var segments: [TextSegment] = []
        let parts = input.components(separatedBy: "\u{001B}[")

        if parts.count <= 1 {
            return [TextSegment(text: input, color: defaultColor(for: input))]
        }

        for (index, part) in parts.enumerated() {
            if index == 0 {
                if !part.isEmpty {
                    segments.append(TextSegment(text: part, color: .white))
                }
                continue
            }

            if let mIndex = part.firstIndex(of: "m") {
                let code = String(part[..<mIndex])
                let text = String(part[part.index(after: mIndex)...])

                let color: Color
                switch code {
                case "31": color = .red
                case "32": color = .green
                case "33": color = .orange
                case "34": color = .blue
                case "35": color = .purple
                case "36": color = .cyan
                case "0": color = .white
                default: color = .white
                }

                if !text.isEmpty {
                    segments.append(TextSegment(text: text, color: color))
                }
            } else {
                segments.append(TextSegment(text: part, color: .white))
            }
        }

        return segments.isEmpty ? [TextSegment(text: input, color: .white)] : segments
    }

    private func defaultColor(for line: String) -> Color {
        if line.starts(with: ">") {
            return .cyan
        } else if line.starts(with: "<") {
            return .green
        } else if line.contains("Error") || line.contains("ERR") {
            return .red
        }
        return Color(white: 0.88)
    }
}
