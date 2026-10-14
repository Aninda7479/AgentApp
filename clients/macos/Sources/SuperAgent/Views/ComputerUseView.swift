//
// ComputerUseView.swift
// SuperAgent
//
// Native macOS Computer Use & Window Automation Workspace.
// Features WGC / ScreenCaptureKit capture canvas, interactive accessibility tree,
// Bézier mouse trajectory velocity visualizer, and adaptive settling countdown.
//

import SwiftUI
import AppKit

public struct ComputerUseView: View {
    @EnvironmentObject private var appState: AppState
    @State private var hoveredElementIndex: Int? = 10
    @State private var searchAxQuery: String = ""
    @State private var isCrosshairVisible: Bool = true

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            telemetryHud
            Divider()

            GeometryReader { geometry in
                HStack(spacing: 0) {
                    // Left Column: Window Picker & Process Inspector (300px)
                    windowPickerColumn
                        .frame(width: 300)

                    Divider()

                    // Center Column: Capture Canvas & Trajectory Visualizer
                    captureCanvasColumn
                        .frame(maxWidth: .infinity)

                    Divider()

                    // Right Column: Accessibility Tree Inspector (340px)
                    accessibilityTreeColumn
                        .frame(width: 340)
                }
            }
        }
        .background(Color(NSColor.windowBackgroundColor))
    }

    // MARK: - Top Telemetry HUD

    private var telemetryHud: some View {
        HStack(spacing: 16) {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color.green)
                    .frame(width: 8, height: 8)
                Text("Target App:")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(appState.selectedWindow?.title ?? "None Selected")
                    .font(.system(.caption, design: .monospaced, weight: .semibold))
                    .lineLimit(1)
            }

            Divider().frame(height: 14)

            HStack(spacing: 6) {
                Image(systemName: "display")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text("Display:")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text("Primary (2560x1440 @ 1.5x DPI)")
                    .font(.system(.caption, design: .monospaced))
            }

            Divider().frame(height: 14)

            settlingBadge

            Spacer()

            Toggle(isOn: $isCrosshairVisible) {
                Label("DPI Crosshairs", systemImage: "scope")
                    .font(.caption)
            }
            .toggleStyle(.switch)
            .controlSize(.mini)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color(NSColor.controlBackgroundColor))
    }

    private var settlingBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: appState.captureMetadata.settlingState.hasActiveSpinner ? "rays" : "checkmark.seal.fill")
                .font(.caption)
                .foregroundColor(appState.captureMetadata.settlingState.hasActiveSpinner ? .orange : .green)
            Text("Settling:")
                .font(.caption)
                .foregroundColor(.secondary)
            Text(appState.captureMetadata.settlingState.hasActiveSpinner ? "SPINNER HOLD (1420ms / 5000ms max)" : "STABLE (0ms)")
                .font(.system(.caption, design: .monospaced, weight: .semibold))
                .foregroundColor(appState.captureMetadata.settlingState.hasActiveSpinner ? .orange : .green)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(appState.captureMetadata.settlingState.hasActiveSpinner ? Color.orange.opacity(0.12) : Color.green.opacity(0.12))
        )
    }

    // MARK: - Left Column: Window Picker & Process Inspector

    private var windowPickerColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("DISCOVERED WINDOWS")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(appState.windows.count) Active")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            ScrollView {
                VStack(spacing: 8) {
                    ForEach(appState.windows) { window in
                        windowCard(window)
                    }
                }
                .padding(10)
            }

            Divider()

            processInspectorCard
                .padding(10)
        }
        .background(Color(NSColor.controlBackgroundColor).opacity(0.5))
    }

    private func windowCard(_ window: WindowItemDemo) -> some View {
        let isSelected = appState.selectedWindow?.id == window.id

        return Button {
            appState.targetWindowForCua(window)
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: window.appName.contains("Code") ? "chevron.left.forwardslash.chevron.right" : "macwindow")
                        .foregroundColor(.accentColor)
                    Text(window.title)
                        .font(.system(size: 12, weight: .medium))
                        .lineLimit(1)
                    Spacer()
                    if window.isOccluded {
                        Text("OCCLUDED")
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.2))
                            .foregroundColor(.orange)
                            .cornerRadius(4)
                    }
                }

                HStack(spacing: 8) {
                    Text("PID: \(window.pid)")
                    Text("HWND: \(window.hwnd)")
                    Spacer()
                    if isSelected {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 6, height: 6)
                    }
                }
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.secondary)
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? Color.accentColor.opacity(0.15) : Color(NSColor.controlBackgroundColor))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(isSelected ? Color.accentColor : Color.gray.opacity(0.2), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private var processInspectorCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("PROCESS & SECURITY INSPECTOR")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.secondary)

            VStack(spacing: 4) {
                inspectorRow(label: "Executable", value: appState.selectedWindow?.appName ?? "N/A")
                inspectorRow(label: "Integrity", value: "Medium (Standard User)")
                inspectorRow(label: "UAC Elevated", value: "NO (Safe for synthetic input)")
                inspectorRow(label: "Capture Mode", value: "ScreenCaptureKit / WGC")
            }
            .font(.system(size: 11))
            .padding(8)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(6)
        }
    }

    private func inspectorRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.primary)
        }
    }

    // MARK: - Center Column: Capture Canvas & Trajectory Visualizer

    private var captureCanvasColumn: some View {
        VStack(spacing: 0) {
            ZStack {
                // Background simulated screen buffer
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(red: 0.05, green: 0.07, blue: 0.11))
                    .overlay(
                        VStack(spacing: 12) {
                            Image(systemName: "display")
                                .font(.system(size: 48))
                                .foregroundColor(.secondary.opacity(0.3))
                            Text("ScreenCaptureKit Occluded Hardware Surface")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.secondary)
                            Text("2730 x 1545 BGRA8 • 30 FPS Hardware Swapchain")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.secondary.opacity(0.7))
                        }
                    )

                // Render active Bézier trajectory and mouse velocity
                if let traj = appState.captureMetadata.activeTrajectory {
                    trajectoryOverlay(traj)
                }

                // Render element highlight box if hovered
                if let idx = hoveredElementIndex {
                    elementHoverBox(index: idx)
                }
            }
            .padding(12)

            Divider()

            // Bottom Settling Timeline & Controls
            settlingTimelineBar
        }
    }

    private func trajectoryOverlay(_ traj: ActiveTrajectoryDemo) -> some View {
        Canvas { context, size in
            let scaleX = size.width / 1280.0
            let scaleY = size.height / 720.0

            let p0 = CGPoint(x: traj.from.x * scaleX, y: traj.from.y * scaleY)
            let p1 = CGPoint(x: traj.controlPoint1.x * scaleX, y: traj.controlPoint1.y * scaleY)
            let p2 = CGPoint(x: traj.controlPoint2.x * scaleX, y: traj.controlPoint2.y * scaleY)
            let p3 = CGPoint(x: traj.to.x * scaleX, y: traj.to.y * scaleY)

            var path = Path()
            path.move(to: p0)
            path.addCurve(to: p3, control1: p1, control2: p2)

            // Draw smooth Bézier curve
            context.stroke(path, with: .color(.cyan), style: StrokeStyle(lineWidth: 2.5, dash: [6, 3]))

            // Draw start circle
            context.fill(Circle().path(in: CGRect(x: p0.x - 5, y: p0.y - 5, width: 10, height: 10)), with: .color(.cyan))

            // Draw destination target click ripple
            context.stroke(Circle().path(in: CGRect(x: p3.x - 14, y: p3.y - 14, width: 28, height: 28)), with: .color(.green), lineWidth: 2)
            context.fill(Circle().path(in: CGRect(x: p3.x - 4, y: p3.y - 4, width: 8, height: 8)), with: .color(.green))
        }
        .overlay(
            VStack {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("VELOCITY: \(Int(appState.captureMetadata.activeTrajectory?.velocityPxPerSec ?? 0)) px/s")
                            .font(.system(size: 10, design: .monospaced, weight: .bold))
                            .foregroundColor(.cyan)
                        Text("Target: element_index: \(appState.captureMetadata.activeTrajectory?.targetElementIndex ?? 0)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.secondary)
                    }
                    .padding(8)
                    .background(Color.black.opacity(0.75))
                    .cornerRadius(6)
                    Spacer()
                }
                Spacer()
            }
            .padding(20)
        )
    }

    private func elementHoverBox(index: Int) -> some View {
        GeometryReader { proxy in
            let w = proxy.size.width * 0.45
            let h = proxy.size.height * 0.35
            let x = proxy.size.width * 0.28
            let y = proxy.size.height * 0.15

            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 4)
                    .stroke(Color.cyan, lineWidth: 1.5)
                    .background(Color.cyan.opacity(0.08))
                    .frame(width: w, height: h)
                    .position(x: x + w / 2, y: y + h / 2)

                Text("element_index: \(index) [code_editor_area]")
                    .font(.system(size: 10, design: .monospaced, weight: .semibold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.cyan)
                    .foregroundColor(.black)
                    .cornerRadius(3)
                    .position(x: x + 100, y: y - 10)
            }
        }
    }

    private var settlingTimelineBar: some View {
        HStack(spacing: 14) {
            Button {
                appState.settlingCountdownMs = 1000
            } label: {
                Label("Recalibrate Settling", systemImage: "arrow.triangle.2.circlepath")
                    .font(.caption)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Adaptive Settling Countdown:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("Base 1000ms + Spinner Hold 1420ms")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.primary)
                }

                ProgressView(value: 0.65)
                    .tint(.orange)
            }
            .frame(maxWidth: 360)

            Spacer()

            Text("Heuristic: Spinner Radar [CLEAN]")
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.green)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color(NSColor.controlBackgroundColor))
    }

    // MARK: - Right Column: Accessibility Tree Inspector

    private var accessibilityTreeColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("ACCESSIBILITY TREE")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("element_index: 10")
                    .font(.system(size: 10, design: .monospaced, weight: .bold))
                    .foregroundColor(.cyan)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            // Search Bar
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                    .font(.caption)
                TextField("Search role, ID, text...", text: $searchAxQuery)
                    .textFieldStyle(.plain)
                    .font(.caption)
            }
            .padding(6)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(6)
            .padding(.horizontal, 10)
            .padding(.bottom, 8)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    renderAxNode(appState.accessibilityTree, depth: 0)
                }
                .padding(10)
            }
        }
        .background(Color(NSColor.controlBackgroundColor).opacity(0.3))
    }

    @ViewBuilder
    private func renderAxNode(_ node: AccessibilityNodeDemo, depth: Int) -> some View {
        let isTarget = node.elementIndex == 10

        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(String(repeating: "  ", count: depth) + "•")
                    .foregroundColor(.secondary)

                Text("[\(node.elementIndex)]")
                    .font(.system(size: 10, design: .monospaced, weight: .bold))
                    .foregroundColor(isTarget ? .cyan : .secondary)

                Text(node.role)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.primary)

                Text("\"\(node.name)\"")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .lineLimit(1)

                Spacer()
            }
            .padding(.vertical, 3)
            .padding(.horizontal, 4)
            .background(isTarget ? Color.cyan.opacity(0.15) : Color.clear)
            .cornerRadius(4)
            .onHover { isHovered in
                if isHovered {
                    hoveredElementIndex = node.elementIndex
                }
            }

            if let children = node.children {
                ForEach(children) { child in
                    renderAxNode(child, depth: depth + 1)
                }
            }
        }
    }
}
