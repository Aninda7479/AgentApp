//
// SecurityGuardianSheet.swift
// SuperAgent
//
// Native macOS Security Guardian, 4-Tier Confirmation Sheet,
// 16-State 'zo' Decision Badges, LockScreen Shield, and Credential Vault Recovery.
//

import SwiftUI
import AppKit

public struct SecurityGuardianSheet: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedBranch: String? = nil
    @State private var isLockScreenSimulated: Bool = false

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header with Shield Indicator
                headerSection

                // LockScreen Guardian Shield Indicator Banner
                lockScreenShieldBanner

                // Active 4-Tier Confirmation Cards
                confirmationTiersSection

                // 16-State 'zo' Security Decision Badges Grid
                zoBadgesSection

                // Credential Vault & 7 Recovery Branches
                credentialVaultSection
            }
            .padding(20)
        }
        .background(Color(NSColor.windowBackgroundColor))
    }

    // MARK: - Header Section

    private var headerSection: some View {
        HStack(spacing: 12) {
            Image(systemName: "shield.checkered")
                .font(.system(size: 28))
                .foregroundColor(.green)

            VStack(alignment: .leading, spacing: 2) {
                Text("Security Guardian & Credential Vault")
                    .font(.title2)
                    .fontWeight(.bold)
                Text("Defense-in-depth policy engine, 4-tier confirmation, and fail-closed hardware watchdog.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Button {
                isLockScreenSimulated.toggle()
                appState.isLockScreenShieldActive = isLockScreenSimulated
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: isLockScreenSimulated ? "lock.slash.fill" : "lock.shield.fill")
                    Text(isLockScreenSimulated ? "Unlock Workstation" : "Simulate WTS Lock")
                }
                .font(.caption)
            }
        }
    }

    // MARK: - LockScreen Guardian Shield Banner

    private var lockScreenShieldBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: isLockScreenSimulated ? "exclamationmark.shield.fill" : "checkmark.shield.fill")
                .font(.system(size: 24))
                .foregroundColor(isLockScreenSimulated ? .red : .green)

            VStack(alignment: .leading, spacing: 2) {
                Text(isLockScreenSimulated ? "🛡️ CUALockScreenGuardian Shield: ACTIVE (AUTOMATION FROZEN)" : "CUALockScreenGuardian Shield: ARMED & MONITORING")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(isLockScreenSimulated ? .red : .green)
                Text(isLockScreenSimulated ? "Hardware Event: WTS_SESSION_LOCK (0x7) detected. All synthetic mouse coordinates, clicks, and keystrokes are intercepted." : "Listening for com.apple.screenIsLocked / WTS_SESSION_LOCK. Zero synthetic input leaks on locked screen.")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(isLockScreenSimulated ? Color.red.opacity(0.12) : Color.green.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(isLockScreenSimulated ? Color.red : Color.green.opacity(0.3), lineWidth: 1.5)
                )
        )
    }

    // MARK: - 4-Tier Confirmation Section

    private var confirmationTiersSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("4-TIER CONFIRMATION TAXONOMY")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.secondary)

            VStack(spacing: 12) {
                ForEach(appState.securityConfirmations) { conf in
                    confirmationCard(conf)
                }
            }
        }
    }

    private func confirmationCard(_ conf: SecurityConfirmationDemo) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: conf.tier == .mode1Handoff ? "person.badge.shield.checkmark.fill" : "exclamationmark.triangle.fill")
                        .foregroundColor(conf.tier == .mode1Handoff ? .purple : .orange)
                    Text(conf.tier.title)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(conf.tier == .mode1Handoff ? .purple : .orange)
                }

                Spacer()

                Text("Timeout: \(conf.timeoutSeconds)s")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
            }

            Text(conf.title)
                .font(.system(size: 14, weight: .semibold))

            Text(conf.riskDescription)
                .font(.system(size: 12))
                .foregroundColor(.secondary)

            VStack(alignment: .leading, spacing: 4) {
                detailRow(label: "Action", value: conf.actionSummary)
                detailRow(label: "Target", value: conf.destinationTarget)
                detailRow(label: "Mechanism", value: conf.mechanism)
                detailRow(label: "Origin", value: "\(conf.origin) (\(conf.processName))")
            }
            .padding(10)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(6)

            HStack {
                Spacer()
                Button("Decline") {
                    appState.declineConfirmation(id: conf.id)
                }
                .buttonStyle(.bordered)

                Button("Approve & Execute") {
                    appState.approveConfirmation(id: conf.id)
                }
                .buttonStyle(.borderedProminent)
                .tint(conf.tier == .mode1Handoff ? .purple : .orange)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(NSColor.controlBackgroundColor).opacity(0.8))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(conf.tier == .mode1Handoff ? Color.purple.opacity(0.4) : Color.orange.opacity(0.4), lineWidth: 1.5)
                )
        )
    }

    private func detailRow(label: String, value: String) -> some View {
        HStack(alignment: .top) {
            Text(label + ":")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)
                .frame(width: 80, alignment: .leading)
            Text(value)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.primary)
            Spacer()
        }
    }

    // MARK: - 16-State 'zo' Security Decision Badges

    private var zoBadgesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("16-STATE 'ZO' SECURITY DECISION BADGES")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("Decision State Matrix")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 10)], spacing: 10) {
                ForEach(appState.zoDecisions) { badge in
                    zoBadgeCard(badge)
                }
            }
        }
    }

    private func zoBadgeCard(_ badge: ZoDecisionBadgeDemo) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(badge.stateKey)
                    .font(.system(size: 11, design: .monospaced, weight: .bold))
                    .foregroundColor(Color(hex: badge.colorHex))
                Spacer()
                Text(badge.decisionSource)
                    .font(.system(size: 9, design: .monospaced))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(Color.gray.opacity(0.2))
                    .cornerRadius(3)
            }

            Text(badge.explanation)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .lineLimit(2)

            HStack {
                Text(badge.isRetryable ? "Retryable: YES" : "Retryable: NO")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(badge.isRetryable ? .green : .red)
                Spacer()
            }
        }
        .padding(8)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(6)
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color(hex: badge.colorHex).opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: - Credential Vault & 7 Recovery Branches

    private var credentialVaultSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("ZERO-LEAK CREDENTIAL VAULT & 7 RECOVERY BRANCHES")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "key.fill")
                        .foregroundColor(.green)
                    Text("In-Process Memory Injection (Scrypt Encrypted)")
                        .font(.system(size: 12, weight: .semibold))
                    Spacer()
                    Text("Zero Token Leakage Guaranteed")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(.green)
                }

                Text("When authentication is blocked or restricted, execute one of 7 non-hallucinated recovery actions:")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)

                VStack(spacing: 6) {
                    ForEach(appState.vaultRecoveryBranches, id: \.self) { branch in
                        HStack {
                            Text(branch)
                                .font(.system(size: 11, design: .monospaced))
                            Spacer()
                            Button("Execute") {
                                selectedBranch = branch
                            }
                            .controlSize(.mini)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(NSColor.windowBackgroundColor))
                        .cornerRadius(4)
                    }
                }
            }
            .padding(14)
            .background(Color(NSColor.controlBackgroundColor).opacity(0.6))
            .cornerRadius(8)
        }
    }
}

// Color Hex Helper Extension
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
