//
// App.swift
// SuperAgent
//
// Native macOS SwiftUI application entrypoint with unified window toolbar,
// system settings scenes, and native keyboard commands.
//

import SwiftUI
import AppKit

@main
public struct SuperAgentApp: App {
    @StateObject private var appState = AppState()

    public init() {}

    public var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .frame(minWidth: 720, minHeight: 480)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified(showsTitle: true))
        .commands {
            // File -> New Chat (Cmd+N)
            CommandGroup(replacing: .newItem) {
                Button("New Chat") {
                    _ = appState.createSession(title: "New Chat")
                }
                .keyboardShortcut("n", modifiers: .command)
            }

            // Agent Menu
            CommandMenu("Agent") {
                Button("Stop Generation") {
                    appState.stopGeneration()
                }
                .keyboardShortcut(".", modifiers: .command)
                .disabled(!appState.isGenerating)

                Button("Reconnect Daemon") {
                    appState.reconnect()
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])
            }

            // Command Palette / Search (Cmd+K)
            CommandGroup(after: .textEditing) {
                Button("Search Chats...") {
                    // Activate search
                }
                .keyboardShortcut("k", modifiers: .command)
            }
        }

        // Native macOS Settings Window (Cmd+,)
        Settings {
            SettingsView()
                .environmentObject(appState)
        }
    }
}
