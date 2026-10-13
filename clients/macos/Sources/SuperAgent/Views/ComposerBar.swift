//
// ComposerBar.swift
// SuperAgent
//
// Native macOS composer bar with text editing, attachment support,
// model switching, and Send / Stop generation controls.
//

import SwiftUI
import AppKit

public struct ComposerBar: View {
    @EnvironmentObject private var appState: AppState
    @State private var inputText: String = ""
    @FocusState private var isFocused: Bool

    private let availableModels = [
        ("gpt-4o", "OpenAI GPT-4o"),
        ("claude-3-5-sonnet-20241022", "Anthropic Claude 3.5 Sonnet"),
        ("gemini-1.5-pro-latest", "Google Gemini 1.5 Pro"),
        ("deepseek-chat", "DeepSeek V3"),
        ("llama3:latest", "Ollama Local Llama 3")
    ]

    public init() {}

    public var body: some View {
        VStack(spacing: 8) {
            // Model selector and attachments toolbar
            HStack(spacing: 12) {
                Menu {
                    ForEach(availableModels, id: \.0) { modelId, displayName in
                        Button {
                            appState.selectedModel = modelId
                        } label: {
                            HStack {
                                Text(displayName)
                                if appState.selectedModel == modelId {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "cpu")
                            .font(.system(size: 11))
                        Text(currentModelName)
                            .font(.system(size: 11, weight: .medium))
                        Image(systemName: "chevron.down")
                            .font(.system(size: 9))
                    }
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color(NSColor.controlBackgroundColor))
                    .cornerRadius(6)
                }
                .menuStyle(.borderlessButton)

                Spacer()

                Button {
                    openAttachmentPicker()
                } label: {
                    Image(systemName: "paperclip")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .help("Attach Files or Images")
            }
            .padding(.horizontal, 4)

            // Input card with TextEditor and Send/Stop button
            HStack(alignment: .bottom, spacing: 8) {
                ZStack(alignment: .topLeading) {
                    if inputText.isEmpty {
                        Text("Ask SuperAgent anything... (Cmd+Return to send)")
                            .font(.system(size: 13))
                            .foregroundColor(.secondary.opacity(0.7))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 6)
                    }

                    TextEditor(text: $inputText)
                        .font(.system(size: 13))
                        .lineSpacing(3)
                        .focused($isFocused)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 24, maxHeight: 120)
                        .padding(.horizontal, 2)
                        .padding(.vertical, 2)
                }

                if appState.isGenerating {
                    Button {
                        appState.stopGeneration()
                    } label: {
                        Image(systemName: "stop.circle.fill")
                            .font(.system(size: 24))
                            .foregroundColor(.red)
                    }
                    .buttonStyle(.plain)
                    .help("Stop Generation")
                } else {
                    Button {
                        handleSend()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 24))
                            .foregroundColor(canSend ? .accentColor : .secondary.opacity(0.4))
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSend)
                    .help("Send Message (Cmd+Return)")
                }
            }
            .padding(8)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isFocused ? Color.accentColor.opacity(0.6) : Color(NSColor.separatorColor), lineWidth: 1)
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(NSColor.windowBackgroundColor))
        .onAppear {
            isFocused = true
        }
    }

    private var currentModelName: String {
        availableModels.first(where: { $0.0 == appState.selectedModel })?.1 ?? appState.selectedModel
    }

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func handleSend() {
        guard canSend else { return }
        let textToSend = inputText
        inputText = ""
        appState.sendMessage(textToSend)
    }

    private func openAttachmentPicker() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canCreateDirectories = false
        panel.canChooseFiles = true

        if panel.runModal() == .OK {
            let files = panel.urls.map { $0.lastPathComponent }.joined(separator: ", ")
            if !files.isEmpty {
                if inputText.isEmpty {
                    inputText = "[Attached: \(files)] "
                } else {
                    inputText += "\n[Attached: \(files)] "
                }
            }
        }
    }
}
