//
// SettingsView.swift
// SuperAgent
//
// Native macOS Settings view with tabs for General, Server Connection,
// and Model Provider credentials.
//

import SwiftUI
import AppKit

public struct SettingsView: View {
    @EnvironmentObject private var appState: AppState

    @AppStorage("autostartEnabled") private var autostartEnabled: Bool = false
    @AppStorage("soundEffectsEnabled") private var soundEffectsEnabled: Bool = true
    @AppStorage("openaiApiKey") private var openaiApiKey: String = ""
    @AppStorage("anthropicApiKey") private var anthropicApiKey: String = ""
    @AppStorage("geminiApiKey") private var geminiApiKey: String = ""
    @AppStorage("groqApiKey") private var groqApiKey: String = ""
    @AppStorage("ollamaHost") private var ollamaHost: String = "http://localhost:11434"

    public init() {}

    public var body: some View {
        TabView {
            generalTab
                .tabItem {
                    Label("General", systemImage: "gearshape")
                }

            serverConnectionTab
                .tabItem {
                    Label("Server Connection", systemImage: "network")
                }

            modelProvidersTab
                .tabItem {
                    Label("Model Providers", systemImage: "cpu")
                }
        }
        .padding(20)
        .frame(width: 520, height: 380)
    }

    // MARK: - General Tab

    private var generalTab: some View {
        Form {
            Section {
                LabeledContent("App Version") {
                    Text("SuperAgent 2.0 (macOS Native)")
                        .foregroundColor(.secondary)
                }

                Toggle("Launch SuperAgent at login", isOn: $autostartEnabled)
                Toggle("Play sound effects for agent completion", isOn: $soundEffectsEnabled)
            } header: {
                Text("Application Preferences")
                    .font(.headline)
            }

            Section {
                Picker("Default Provider", selection: $appState.selectedProvider) {
                    Text("OpenAI").tag("openai")
                    Text("Anthropic").tag("anthropic")
                    Text("Google Gemini").tag("gemini")
                    Text("Groq").tag("groq")
                    Text("Local Ollama").tag("ollama")
                }

                Picker("Default Model", selection: $appState.selectedModel) {
                    Text("GPT-4o").tag("gpt-4o")
                    Text("Claude 3.5 Sonnet").tag("claude-3-5-sonnet-20241022")
                    Text("Gemini 1.5 Pro").tag("gemini-1.5-pro-latest")
                    Text("DeepSeek V3").tag("deepseek-chat")
                    Text("Llama 3 (Local)").tag("llama3:latest")
                }
            } header: {
                Text("Default Agent Engine")
                    .font(.headline)
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Server Connection Tab

    private var serverConnectionTab: some View {
        Form {
            Section {
                HStack {
                    Circle()
                        .fill(appState.connectionStatus == .connected ? Color.green : Color.red)
                        .frame(width: 10, height: 10)
                    Text(appState.connectionStatus.title)
                        .fontWeight(.medium)

                    Spacer()

                    Button("Reconnect") {
                        appState.reconnect()
                    }
                }

                LabeledContent("Discovered Daemon Port") {
                    Text("\(appState.daemonClient.currentPort)")
                        .font(.system(.body, design: .monospaced))
                }

                TextField("Custom Host URL", text: $appState.customServerUrl)
                    .textFieldStyle(.roundedBorder)

                SecureField("Session / Admin Token", text: $appState.customAuthToken)
                    .textFieldStyle(.roundedBorder)
            } header: {
                Text("Core v2 Daemon Protocol")
                    .font(.headline)
            } footer: {
                Text("SuperAgent automatically discovers port 1469 from ~/.superagent/web-server.lock or environment variables.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Model Providers Tab

    private var modelProvidersTab: some View {
        Form {
            Section {
                SecureField("OpenAI API Key", text: $openaiApiKey)
                    .textFieldStyle(.roundedBorder)

                SecureField("Anthropic API Key", text: $anthropicApiKey)
                    .textFieldStyle(.roundedBorder)

                SecureField("Gemini API Key", text: $geminiApiKey)
                    .textFieldStyle(.roundedBorder)

                SecureField("Groq API Key", text: $groqApiKey)
                    .textFieldStyle(.roundedBorder)
            } header: {
                Text("Cloud Providers")
                    .font(.headline)
            }

            Section {
                TextField("Ollama Base URL", text: $ollamaHost)
                    .textFieldStyle(.roundedBorder)
            } header: {
                Text("Local Inference")
                    .font(.headline)
            }
        }
        .formStyle(.grouped)
    }
}
