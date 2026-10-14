//
// CompanionView.swift
// SuperAgent
//
// Native macOS 3D VRM Companion & Live Presence Studio.
// Implements 3D avatar viewport, emotion mood badges (Joy, Thinking, Error, Welcoming, Sleeping),
// audio viseme lip-sync FFT meter, photo presets, and floating desktop pet popout.
//

import SwiftUI
import AppKit

public struct CompanionView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedTab: String = "Studio"
    @State private var simulatedLipSyncActive: Bool = true
    @State private var affinityProgress: Double = 0.84

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            topHudBar
            Divider()

            GeometryReader { geometry in
                HStack(spacing: 0) {
                    // Left Column: Companion Persona & Relationship (300px)
                    personaColumn
                        .frame(width: 300)

                    Divider()

                    // Center Column: 3D Companion Avatar Stage
                    avatarStageColumn
                        .frame(maxWidth: .infinity)

                    Divider()

                    // Right Column: Controls, Moods & Photo Mode (340px)
                    controlsColumn
                        .frame(width: 340)
                }
            }
        }
        .background(Color(NSColor.windowBackgroundColor))
    }

    // MARK: - Top HUD Bar

    private var topHudBar: some View {
        HStack(spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .foregroundColor(.purple)
                Text(appState.companionState.name)
                    .font(.system(.headline, design: .rounded))
                Text("VRM 1.0 Companion")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Emotion Mood Badges Picker
            HStack(spacing: 6) {
                ForEach(CompanionMoodDemo.allCases, id: \.self) { mood in
                    moodPill(mood)
                }
            }

            Divider().frame(height: 14)

            // Floating Desktop Pet Popout Button
            Button {
                appState.toggleFloatingPet()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: appState.companionState.isFloatingPetActive ? "pip.exit" : "pip.enter")
                    Text(appState.companionState.isFloatingPetActive ? "Dock Pet" : "Floating Pet Mode")
                }
                .font(.caption)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(NSColor.controlBackgroundColor))
    }

    private func moodPill(_ mood: CompanionMoodDemo) -> some View {
        let isSelected = appState.companionState.currentMood == mood

        return Button {
            appState.setCompanionMood(mood)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: mood.systemIcon)
                Text(mood.rawValue)
            }
            .font(.system(size: 11, weight: isSelected ? .bold : .regular))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color(hex: mood.colorHex).opacity(0.2) : Color.clear)
            )
            .foregroundColor(isSelected ? Color(hex: mood.colorHex) : .secondary)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color(hex: mood.colorHex) : Color.gray.opacity(0.2), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Left Column: Persona & Relationship

    private var personaColumn: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Profile Card
            VStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(LinearGradient(colors: [.purple, .blue], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 80, height: 80)
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 72))
                        .foregroundColor(.white.opacity(0.9))
                }

                Text(appState.companionState.name)
                    .font(.title3)
                    .fontWeight(.bold)

                Text("Devoted Autonomous Companion")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 16)

            Divider()

            // Relationship & Affinity Meter
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("AFFINITY LEVEL")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("Level \(appState.companionState.affinityLevel) / 100")
                        .font(.system(size: 10, design: .monospaced, weight: .bold))
                        .foregroundColor(.purple)
                }

                ProgressView(value: affinityProgress)
                    .tint(.purple)

                HStack {
                    Label("\(appState.companionState.dailyStreakDays) Day Streak", systemImage: "flame.fill")
                        .font(.caption2)
                        .foregroundColor(.orange)
                    Spacer()
                    Text("142 Tasks Shipped")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding(12)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(8)

            // Audio Viseme Lip-Sync FFT Meter
            visemeMeterCard

            Spacer()
        }
        .padding(12)
        .background(Color(NSColor.controlBackgroundColor).opacity(0.3))
    }

    private var visemeMeterCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("AUDIO VISEME FFT METER")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Image(systemName: "waveform")
                    .foregroundColor(.cyan)
            }

            VStack(spacing: 6) {
                ForEach(["aa", "ih", "ou", "ee", "oh"], id: \.self) { vowel in
                    let val = appState.companionState.visemeLevels[vowel] ?? 0.3
                    HStack(spacing: 8) {
                        Text(vowel.uppercased())
                            .font(.system(size: 10, design: .monospaced, weight: .bold))
                            .frame(width: 24, alignment: .leading)
                            .foregroundColor(.secondary)

                        ProgressView(value: val)
                            .tint(.cyan)

                        Text("\(Int(val * 100))%")
                            .font(.system(size: 9, design: .monospaced))
                            .frame(width: 30, alignment: .trailing)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
        .padding(12)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(8)
    }

    // MARK: - Center Column: 3D Companion Avatar Stage

    private var avatarStageColumn: some View {
        ZStack {
            // High-DPI Stage Background Canvas
            RoundedRectangle(cornerRadius: 10)
                .fill(
                    RadialGradient(
                        colors: [Color(red: 0.12, green: 0.10, blue: 0.20), Color(red: 0.04, green: 0.05, blue: 0.08)],
                        center: .center,
                        startRadius: 50,
                        endRadius: 400
                    )
                )

            // 3D Avatar Placeholder Stage
            VStack(spacing: 16) {
                Spacer()

                ZStack {
                    // Soft Radial Ground Pedestal Shadow
                    Ellipse()
                        .fill(Color.black.opacity(0.5))
                        .frame(width: 220, height: 40)
                        .offset(y: 140)

                    // Simulated 3D Avatar Rigging Silhouette
                    VStack(spacing: 8) {
                        Image(systemName: "figure.walk")
                            .font(.system(size: 160))
                            .foregroundColor(.purple.opacity(0.85))
                            .shadow(color: Color.purple.opacity(0.4), radius: 20)

                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color(hex: appState.companionState.currentMood.colorHex))
                                .frame(width: 8, height: 8)
                            Text("Current Mood: \(appState.companionState.currentMood.rawValue)")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.white)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color.black.opacity(0.6))
                        .cornerRadius(12)
                    }
                }

                Spacer()

                // Bottom Camera Controls
                HStack(spacing: 12) {
                    Button(action: {}) {
                        Label("Portrait", systemImage: "person.crop.square")
                            .font(.caption)
                    }
                    Button(action: {}) {
                        Label("Half-Body", systemImage: "figure.stand")
                            .font(.caption)
                    }
                    Button(action: {}) {
                        Label("Full-Body", systemImage: "camera")
                            .font(.caption)
                    }
                }
                .padding(.bottom, 16)
            }

            // Floating Desktop Pet Banner (if active)
            if appState.companionState.isFloatingPetActive {
                VStack {
                    HStack {
                        Label("Floating Desktop Pet Window Active (Transparent / Always on Top)", systemImage: "macwindow.on.rectangle")
                            .font(.caption)
                            .padding(8)
                            .background(Color.black.opacity(0.8))
                            .foregroundColor(.cyan)
                            .cornerRadius(6)
                        Spacer()
                    }
                    .padding(14)
                    Spacer()
                }
            }
        }
        .padding(12)
    }

    // MARK: - Right Column: Photo Mode & Motion Catalog

    private var controlsColumn: some View {
        VStack(alignment: .leading, spacing: 14) {
            Picker("", selection: $selectedTab) {
                Text("Photo Mode").tag("Studio")
                Text("Animations").tag("Animations")
            }
            .pickerStyle(.segmented)
            .padding(.top, 10)
            .padding(.horizontal, 12)

            Divider()

            if selectedTab == "Studio" {
                photoModeControls
            } else {
                animationsCatalog
            }

            Spacer()
        }
        .background(Color(NSColor.controlBackgroundColor).opacity(0.3))
    }

    private var photoModeControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("PHOTO MODE PRESETS")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.secondary)

            VStack(spacing: 8) {
                ForEach(DEMO_PHOTO_PRESETS, id: \.self) { preset in
                    let isSel = appState.selectedPhotoPreset == preset
                    Button {
                        appState.selectedPhotoPreset = preset
                    } label: {
                        HStack {
                            Text(preset)
                                .font(.system(size: 11))
                                .foregroundColor(.primary)
                            Spacer()
                            if isSel {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.accentColor)
                                    .font(.caption)
                            }
                        }
                        .padding(8)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(6)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(isSel ? Color.accentColor : Color.clear, lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }

            Divider()

            Text("LIGHTING & HDRI")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.secondary)

            VStack(spacing: 4) {
                HStack {
                    Text("Backdrop:")
                        .font(.caption)
                    Spacer()
                    Text("Cyberpunk Neon (Wet)")
                        .font(.caption)
                        .foregroundColor(.cyan)
                }
                HStack {
                    Text("Watermark:")
                        .font(.caption)
                    Spacer()
                    Text("SuperAgent Companion Studio")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(8)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(6)

            Button {
                // Snapshot action
            } label: {
                Label("Capture UHD Snapshot", systemImage: "camera.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 8)
        }
        .padding(.horizontal, 12)
    }

    private var animationsCatalog: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("MOTION CLIPS (125+)")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.secondary)

            ScrollView {
                VStack(spacing: 6) {
                    ForEach(["Idle Breathing", "Wave Energetic", "Cheering Jump", "Focused Typing", "Pondering Chin", "Sleepy Sway"], id: \.self) { clip in
                        HStack {
                            Text(clip)
                                .font(.system(size: 11))
                            Spacer()
                            Button("Play") {}
                                .controlSize(.mini)
                        }
                        .padding(6)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(4)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
    }
}
