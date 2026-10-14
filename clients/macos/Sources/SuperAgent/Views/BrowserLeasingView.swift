//
// BrowserLeasingView.swift
// SuperAgent
//
// Native macOS Two-Tiered Browser Automation & Tab Leasing Center.
// Implements claimExistingTab vs createTab, lease countdown bars,
// WebMCP in-page tools registry, CDP stream log, and in-DOM agent badge.
//

import SwiftUI
import AppKit

public struct BrowserLeasingView: View {
    @EnvironmentObject private var appState: AppState
    @State private var cdpFilter: String = "All"
    @State private var isExecutingTool: Bool = false
    @State private var selectedTool: WebMcpToolDemo?

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            telemetryBar
            Divider()

            GeometryReader { geometry in
                HStack(spacing: 0) {
                    // Left Column: Tab Leasing Manager (310px)
                    tabManagerColumn
                        .frame(width: 310)

                    Divider()

                    // Center Column: Live Tab Viewport & In-DOM Badge Preview
                    liveViewportColumn
                        .frame(maxWidth: .infinity)

                    Divider()

                    // Right Column: WebMCP Registry & CDP Event Stream (360px)
                    webMcpAndCdpColumn
                        .frame(width: 360)
                }
            }
        }
        .background(Color(NSColor.windowBackgroundColor))
    }

    // MARK: - Top Telemetry Bar

    private var telemetryBar: some View {
        HStack(spacing: 16) {
            HStack(spacing: 6) {
                Image(systemName: "globe")
                    .foregroundColor(.accentColor)
                Text("Browser Profile:")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text("Google Chrome (Default)")
                    .font(.system(.caption, design: .monospaced, weight: .semibold))
            }

            Divider().frame(height: 14)

            HStack(spacing: 6) {
                Circle()
                    .fill(Color.green)
                    .frame(width: 8, height: 8)
                Text("Attached Tabs:")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text("\(appState.browserTabs.count) Leased / 14 Discovered")
                    .font(.system(.caption, design: .monospaced))
            }

            Divider().frame(height: 14)

            HStack(spacing: 6) {
                Image(systemName: "bolt.fill")
                    .foregroundColor(.cyan)
                    .font(.caption)
                Text("CDP Latency:")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text("1.8ms")
                    .font(.system(.caption, design: .monospaced, weight: .semibold))
                    .foregroundColor(.cyan)
            }

            Spacer()

            Button {
                let newTab = BrowserTabDemo(
                    id: "tab-\(Int.random(in: 100...999))",
                    title: "Isolated Sandbox Context",
                    url: "about:blank",
                    mentionKey: "@tab-new",
                    tierType: "isolated_sandbox",
                    remainingSeconds: 60,
                    targetId: "SANDBOX-\(Int.random(in: 1000...9999))"
                )
                appState.browserTabs.append(newTab)
            } label: {
                Label("New Isolated Tab", systemImage: "plus")
                    .font(.caption)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color(NSColor.controlBackgroundColor))
    }

    // MARK: - Left Column: Tab Manager (Two-Tiered)

    private var tabManagerColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("TAB LEASING CENTER")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("Tier 1 & Tier 2")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // Tier 1 Section
                    VStack(alignment: .leading, spacing: 6) {
                        Text("TIER 1: CLAIMED EXISTING TABS")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.cyan)

                        ForEach(appState.browserTabs.filter { $0.tierType == "claimed_existing" }) { tab in
                            tabLeaseCard(tab)
                        }
                    }

                    // Tier 2 Section
                    VStack(alignment: .leading, spacing: 6) {
                        Text("TIER 2: ISOLATED SANDBOXES")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.purple)

                        ForEach(appState.browserTabs.filter { $0.tierType == "isolated_sandbox" }) { tab in
                            tabLeaseCard(tab)
                        }
                    }
                }
                .padding(10)
            }
        }
        .background(Color(NSColor.controlBackgroundColor).opacity(0.4))
    }

    private func tabLeaseCard(_ tab: BrowserTabDemo) -> some View {
        let isSelected = appState.activeTab?.id == tab.id
        let pct = Double(tab.remainingSeconds) / Double(tab.totalSeconds)
        let timerColor: Color = pct > 0.5 ? .green : (pct > 0.25 ? .cyan : .orange)

        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: tab.favicon)
                    .foregroundColor(.accentColor)
                VStack(alignment: .leading, spacing: 1) {
                    Text(tab.title)
                        .font(.system(size: 11, weight: .semibold))
                        .lineLimit(1)
                    Text(tab.url)
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                Spacer()
            }

            HStack {
                Text(tab.mentionKey)
                    .font(.system(size: 9, design: .monospaced, weight: .bold))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(Color.cyan.opacity(0.15))
                    .foregroundColor(.cyan)
                    .cornerRadius(4)

                Spacer()

                Text("\(tab.remainingSeconds)s / \(tab.totalSeconds)s")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(timerColor)
            }

            // Lease Countdown Bar
            ProgressView(value: pct)
                .tint(timerColor)

            HStack(spacing: 8) {
                Button("Renew 60s") {
                    appState.renewTabLease(id: tab.id)
                }
                .font(.system(size: 10))

                Spacer()

                Button("Release") {
                    appState.releaseTabLease(id: tab.id)
                }
                .font(.system(size: 10))
                .foregroundColor(.red)
            }
            .padding(.top, 2)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(isSelected ? Color.accentColor.opacity(0.12) : Color(NSColor.controlBackgroundColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(isSelected ? Color.accentColor : Color.gray.opacity(0.2), lineWidth: 1)
                )
        )
        .onTapGesture {
            appState.activeTab = tab
        }
    }

    // MARK: - Center Column: Live Viewport & In-DOM Badge

    private var liveViewportColumn: some View {
        VStack(spacing: 0) {
            // URL Bar
            HStack(spacing: 8) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 10))
                    .foregroundColor(.green)
                Text(appState.activeTab?.url ?? "https://portal.example.com/checkout")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.primary)
                Spacer()
                Text("Target: \(appState.activeTab?.targetId ?? "B401")")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(NSColor.controlBackgroundColor))

            Divider()

            // Viewport Screen with In-DOM Badge
            ZStack(alignment: .top) {
                // Background Simulated Web Page
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(red: 0.08, green: 0.10, blue: 0.16))
                    .overlay(
                        VStack(spacing: 16) {
                            HStack {
                                Text("Example Store Checkout")
                                    .font(.title3)
                                    .fontWeight(.bold)
                                Spacer()
                            }
                            .padding(.top, 60)
                            .padding(.horizontal, 24)

                            VStack(alignment: .leading, spacing: 10) {
                                Text("Shipping & Delivery")
                                    .font(.headline)
                                Text("• Full Name: John Doe")
                                Text("• Address: 742 Evergreen Terrace")
                                Text("• Postal Code: 97477")
                                Text("• Payment: Masked in Credential Vault [**** 4242]")
                            }
                            .font(.system(size: 12))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 24)

                            Spacer()
                        }
                    )

                // In-DOM Agent Badge Indicator (Injected Shadow DOM)
                inDomAgentBadge
                    .padding(.top, 12)
            }
            .padding(12)
        }
    }

    private var inDomAgentBadge: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "bolt.circle.fill")
                    .foregroundColor(.cyan)
                Text("⚡ SuperAgent Connected")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
            }

            Text("Step 4/8: Address Entry")
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.white.opacity(0.8))

            Spacer()

            HStack(spacing: 6) {
                Button("Pause") {}
                    .buttonStyle(.borderedProminent)
                    .controlSize(.mini)
                Button("Disconnect") {
                    appState.inDomBadgeConnected.toggle()
                }
                .buttonStyle(.bordered)
                .controlSize(.mini)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(red: 0.1, green: 0.15, blue: 0.25).opacity(0.95))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.cyan.opacity(0.5), lineWidth: 1.5)
                )
        )
        .shadow(radius: 6)
        .padding(.horizontal, 20)
    }

    // MARK: - Right Column: WebMCP Registry & CDP Event Stream

    private var webMcpAndCdpColumn: some View {
        VStack(spacing: 0) {
            // WebMCP Registry
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("WEBMCP IN-PAGE TOOLS")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("4 Active")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(.cyan)
                }
                .padding(.horizontal, 12)
                .padding(.top, 10)

                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(appState.webMcpTools) { tool in
                            webMcpToolCard(tool)
                        }
                    }
                    .padding(.horizontal, 10)
                }
                .frame(maxHeight: 280)
            }

            Divider()

            // CDP Event Stream Log
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("CDP STREAM LOG")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.secondary)
                    Spacer()
                    Picker("", selection: $cdpFilter) {
                        Text("All").tag("All")
                        Text("Network").tag("Network")
                        Text("DOM").tag("DOM")
                        Text("Fetch").tag("Fetch")
                    }
                    .pickerStyle(.segmented)
                    .controlSize(.mini)
                    .frame(width: 150)
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)

                ScrollView {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(appState.cdpEvents) { event in
                            HStack(alignment: .top, spacing: 6) {
                                Text(event.timestamp)
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundColor(.secondary)

                                Text(event.category)
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundColor(categoryColor(event.category))

                                Text(event.method)
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundColor(.primary)
                                    .lineLimit(1)
                            }
                        }
                    }
                    .padding(10)
                }
            }
        }
        .background(Color(NSColor.controlBackgroundColor).opacity(0.3))
    }

    private func webMcpToolCard(_ tool: WebMcpToolDemo) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(tool.name)
                    .font(.system(size: 11, design: .monospaced, weight: .bold))
                    .foregroundColor(.cyan)
                Spacer()
                Text("\(String(format: "%.1f", tool.avgExecutionMs))ms avg")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(.green)
            }

            Text(tool.description)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .lineLimit(2)

            Text(tool.parametersSummary)
                .font(.system(size: 9, design: .monospaced))
                .foregroundColor(.secondary.opacity(0.8))
                .lineLimit(1)
        }
        .padding(8)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(6)
    }

    private func categoryColor(_ cat: String) -> Color {
        switch cat {
        case "Network": return .blue
        case "DOM": return .purple
        case "Fetch": return .orange
        case "Log": return .green
        default: return .secondary
        }
    }
}
