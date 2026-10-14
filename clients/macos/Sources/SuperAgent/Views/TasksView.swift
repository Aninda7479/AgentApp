//
// TasksView.swift
// SuperAgent
//
// Native macOS Tasks & Scheduled Routines Workspace.
// Features a 4-column Kanban board (To Do, In Progress, Blocked / Review, Done)
// and a cron routines automation modal with presets and Telegram notifications.
//

import SwiftUI
import AppKit

public struct TasksView: View {
    @EnvironmentObject private var appState: AppState
    @State private var activeTab: String = "Kanban" // "Kanban" or "Routines"
    @State private var isRoutineModalPresented: Bool = false
    @State private var newRoutineName: String = ""
    @State private var selectedCronPreset: String = "0 9 * * 1-5"
    @State private var telegramChatId: String = "@superagent_ops"
    @State private var notifyTelegram: Bool = true

    let kanbanColumns = [
        ("todo", "To Do", Color.blue),
        ("in_progress", "In Progress", Color.orange),
        ("blocked", "Blocked / Review", Color.red),
        ("done", "Done", Color.green)
    ]

    let cronPresets = [
        ("Every 15 Minutes", "*/15 * * * *"),
        ("Hourly", "0 * * * *"),
        ("Daily at 9 AM", "0 9 * * *"),
        ("Weekdays at 9 AM", "0 9 * * 1-5")
    ]

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            topControlBar
            Divider()

            if activeTab == "Kanban" {
                kanbanBoardView
            } else {
                routinesListView
            }
        }
        .background(Color(NSColor.windowBackgroundColor))
        .sheet(isPresented: $isRoutineModalPresented) {
            createRoutineSheet
        }
    }

    // MARK: - Top Control Bar

    private var topControlBar: some View {
        HStack(spacing: 16) {
            Picker("", selection: $activeTab) {
                Text("Kanban Board").tag("Kanban")
                Text("Scheduled Routines").tag("Routines")
            }
            .pickerStyle(.segmented)
            .frame(width: 260)

            Spacer()

            Button {
                isRoutineModalPresented = true
            } label: {
                Label("New Cron Routine", systemImage: "clock.badge.plus")
                    .font(.caption)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color(NSColor.controlBackgroundColor))
    }

    // MARK: - 4-Column Kanban Board View

    private var kanbanBoardView: some View {
        GeometryReader { geometry in
            let colWidth = (geometry.size.width - 40) / 4.0

            HStack(alignment: .top, spacing: 10) {
                ForEach(kanbanColumns, id: \.0) { colId, colTitle, colColor in
                    kanbanColumnView(id: colId, title: colTitle, color: colColor, width: colWidth)
                }
            }
            .padding(10)
        }
    }

    private func kanbanColumnView(id: String, title: String, color: Color, width: CGFloat) -> some View {
        let cards = appState.kanbanCards.filter { $0.column == id }

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                Spacer()
                Text("\(cards.count)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)

            ScrollView {
                VStack(spacing: 8) {
                    ForEach(cards) { card in
                        kanbanCardView(card)
                    }
                }
            }
        }
        .frame(width: max(200, width))
        .padding(6)
        .background(Color(NSColor.controlBackgroundColor).opacity(0.4))
        .cornerRadius(8)
    }

    private func kanbanCardView(_ card: KanbanCardDemo) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(card.priority)
                    .font(.system(size: 9, weight: .bold))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(card.priority == "High" ? Color.red.opacity(0.2) : Color.blue.opacity(0.2))
                    .foregroundColor(card.priority == "High" ? .red : .blue)
                    .cornerRadius(3)

                Spacer()

                Text(card.assignee)
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(.secondary)
            }

            Text(card.title)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(2)

            Text(card.description)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .lineLimit(3)

            HStack {
                Spacer()
                Menu {
                    Button("Move to To Do") { appState.moveKanbanCard(id: card.id, toColumn: "todo") }
                    Button("Move to In Progress") { appState.moveKanbanCard(id: card.id, toColumn: "in_progress") }
                    Button("Move to Blocked") { appState.moveKanbanCard(id: card.id, toColumn: "blocked") }
                    Button("Move to Done") { appState.moveKanbanCard(id: card.id, toColumn: "done") }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.caption)
                }
                .menuStyle(.borderlessButton)
            }
        }
        .padding(8)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(6)
        .shadow(color: Color.black.opacity(0.1), radius: 2, y: 1)
    }

    // MARK: - Routines List View

    private var routinesListView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(appState.routines) { routine in
                    routineRow(routine)
                }
            }
            .padding(14)
        }
    }

    private func routineRow(_ routine: CronRoutineDemo) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.title2)
                .foregroundColor(routine.isEnabled ? .cyan : .secondary)

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(routine.name)
                        .font(.system(size: 13, weight: .semibold))
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { routine.isEnabled },
                        set: { _ in appState.toggleRoutine(id: routine.id) }
                    ))
                    .toggleStyle(.switch)
                    .controlSize(.mini)
                }

                Text(routine.promptTemplate)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)

                HStack(spacing: 12) {
                    Text("Cron: \(routine.cronExpression)")
                        .font(.system(size: 10, design: .monospaced))
                    if routine.notifyTelegram {
                        Label("Telegram: \(routine.telegramChatId)", systemImage: "paperplane.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.blue)
                    }
                    Text("Last Run: \(routine.lastRunStatus)")
                        .font(.system(size: 10))
                        .foregroundColor(.green)
                }
                .padding(.top, 2)
            }
        }
        .padding(12)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(8)
    }

    // MARK: - Create Routine Sheet

    private var createRoutineSheet: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Create Scheduled Cron Routine")
                .font(.headline)

            VStack(alignment: .leading, spacing: 4) {
                Text("Routine Name:")
                    .font(.caption)
                TextField("e.g. Daily Security Audit", text: $newRoutineName)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Cron Schedule Preset:")
                    .font(.caption)
                Picker("", selection: $selectedCronPreset) {
                    ForEach(cronPresets, id: \.1) { name, expr in
                        Text("\(name) (\(expr))").tag(expr)
                    }
                }
            }

            Toggle("Send Telegram Alerts", isOn: $notifyTelegram)
            if notifyTelegram {
                TextField("Telegram Chat ID", text: $telegramChatId)
                    .textFieldStyle(.roundedBorder)
                    .font(.caption)
            }

            HStack {
                Spacer()
                Button("Cancel") {
                    isRoutineModalPresented = false
                }
                Button("Save Routine") {
                    if !newRoutineName.isEmpty {
                        appState.routines.append(
                            CronRoutineDemo(
                                id: "r-\(Int.random(in: 10...99))",
                                name: newRoutineName,
                                cronExpression: selectedCronPreset,
                                promptTemplate: "Automated recurring routine",
                                isEnabled: true,
                                notifyTelegram: notifyTelegram,
                                telegramChatId: telegramChatId
                            )
                        )
                    }
                    isRoutineModalPresented = false
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(.top, 8)
        }
        .padding(20)
        .frame(width: 400)
    }
}
