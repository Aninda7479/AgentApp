//
// App.swift
// SuperAgent
//
// Native macOS SwiftUI application entrypoint with unified window toolbar,
// system settings scenes, native keyboard commands, and workspace shortcuts.
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
                .frame(minWidth: 900, minHeight: 600)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified(showsTitle: true))
        .commands {
            // File -> New Chat (Cmd+N)
            CommandGroup(replacing: .newItem) {
                Button("New Chat") {
                    appState.activeWorkspace = .chat
                    _ = appState.createSession(title: "New Chat")
                }
                .keyboardShortcut("n", modifiers: .command)
            }

            // Workspaces Menu (Cmd+1 to Cmd+9, Cmd+,)
            CommandMenu("Workspaces") {
                Button("Agent Chat") { appState.activeWorkspace = .chat }
                    .keyboardShortcut("1", modifiers: .command)
                Button("Computer Use") { appState.activeWorkspace = .computerUse }
                    .keyboardShortcut("2", modifiers: .command)
                Button("Browser Leasing") { appState.activeWorkspace = .browserLeasing }
                    .keyboardShortcut("3", modifiers: .command)
                Button("Security Guardian") { appState.activeWorkspace = .securityGuardian }
                    .keyboardShortcut("4", modifiers: .command)
                Button("REPL Console") { appState.activeWorkspace = .replConsole }
                    .keyboardShortcut("5", modifiers: .command)
                Button("3D Companion") { appState.activeWorkspace = .companion }
                    .keyboardShortcut("6", modifiers: .command)
                Button("Creative Studio") { appState.activeWorkspace = .creativeStudio }
                    .keyboardShortcut("7", modifiers: .command)
                Button("PCB & ECAD") { appState.activeWorkspace = .pcbEcad }
                    .keyboardShortcut("8", modifiers: .command)
                Button("Tasks & Routines") { appState.activeWorkspace = .tasks }
                    .keyboardShortcut("9", modifiers: .command)
                Button("Settings & Doctor") { appState.activeWorkspace = .settings }
                    .keyboardShortcut(",", modifiers: .command)
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

                Button("Trigger Security Guardian") {
                    appState.isSecuritySheetPresented = true
                }
                .keyboardShortcut("g", modifiers: [.command, .shift])
            }

            // Command Palette / Search (Cmd+K)
            CommandGroup(after: .textEditing) {
                Button("Search Chats...") {
                    appState.activeWorkspace = .chat
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
