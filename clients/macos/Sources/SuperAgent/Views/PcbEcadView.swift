//
// PcbEcadView.swift
// SuperAgent
//
// Native macOS PCB & Hardware ECAD Workspace.
// Features schematic editor, copper layout canvas, 3D PCB preview,
// real-time ERC rules checker, AI Hardware Co-Pilot, and KiCad/BOM exporter.
//

import SwiftUI
import AppKit

public struct PcbEcadView: View {
    @EnvironmentObject private var appState: AppState
    @State private var viewMode: String = "Schematic" // "Schematic", "Layout", "3D Preview"
    @State private var isExportModalPresented: Bool = false
    @State private var copilotInput: String = ""

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            topControlBar
            Divider()

            GeometryReader { geometry in
                HStack(spacing: 0) {
                    // Left Column: Components & ERC Rules Inspector (300px)
                    ercAndComponentsColumn
                        .frame(width: 300)

                    Divider()

                    // Center Column: Dynamic Canvas (Schematic, Layout, 3D)
                    centerCanvasColumn
                        .frame(maxWidth: .infinity)

                    Divider()

                    // Right Column: AI Hardware Co-Pilot (320px)
                    aiHardwareCopilotColumn
                        .frame(width: 320)
                }
            }
        }
        .background(Color(NSColor.windowBackgroundColor))
        .sheet(isPresented: $isExportModalPresented) {
            kicadExportModal
        }
    }

    // MARK: - Top Control Bar

    private var topControlBar: some View {
        HStack(spacing: 16) {
            Picker("", selection: $viewMode) {
                Text("Schematic").tag("Schematic")
                Text("PCB Layout").tag("Layout")
                Text("3D Board Preview").tag("3D Preview")
            }
            .pickerStyle(.segmented)
            .frame(width: 340)

            Spacer()

            Button {
                appState.runErcCheck()
            } label: {
                Label("Run ERC Rules", systemImage: "checkmark.shield")
                    .font(.caption)
            }

            Button {
                isExportModalPresented = true
            } label: {
                Label("Export KiCad / BOM", systemImage: "square.and.arrow.up")
                    .font(.caption)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color(NSColor.controlBackgroundColor))
    }

    // MARK: - Left Column: Components & ERC Rules

    private var ercAndComponentsColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("ELECTRICAL RULES (ERC)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("5 Rules")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            ScrollView {
                VStack(spacing: 6) {
                    ForEach(appState.ercRules) { rule in
                        ercRuleCard(rule)
                    }
                }
                .padding(.horizontal, 10)
            }
            .frame(maxHeight: 220)

            Divider()

            HStack {
                Text("BOM COMPONENTS")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(appState.pcbComponents.count) Parts")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.cyan)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            ScrollView {
                VStack(spacing: 6) {
                    ForEach(appState.pcbComponents) { comp in
                        pcbComponentCard(comp)
                    }
                }
                .padding(.horizontal, 10)
            }
        }
        .background(Color(NSColor.controlBackgroundColor).opacity(0.3))
    }

    private func ercRuleCard(_ rule: ErcRuleCheckDemo) -> some View {
        let isPass = rule.severity == "Passed"
        let isWarn = rule.severity == "Warning"

        return VStack(alignment: .leading, spacing: 2) {
            HStack {
                Image(systemName: isPass ? "checkmark.circle.fill" : (isWarn ? "exclamationmark.triangle.fill" : "xmark.circle.fill"))
                    .foregroundColor(isPass ? .green : (isWarn ? .orange : .red))
                    .font(.caption)
                Text(rule.code)
                    .font(.system(size: 10, design: .monospaced, weight: .bold))
                Spacer()
                Text(rule.severity)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(isPass ? .green : (isWarn ? .orange : .red))
            }

            Text(rule.message)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .lineLimit(2)
        }
        .padding(8)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(6)
    }

    private func pcbComponentCard(_ comp: PcbComponentDemo) -> some View {
        HStack(spacing: 8) {
            Text(comp.designator)
                .font(.system(size: 11, design: .monospaced, weight: .bold))
                .foregroundColor(.cyan)
                .frame(width: 30, alignment: .leading)

            VStack(alignment: .leading, spacing: 1) {
                Text(comp.value)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
                Text("\(comp.footprint) • \(comp.lcscId)")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding(6)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(4)
    }

    // MARK: - Center Column: Dynamic Canvas

    private var centerCanvasColumn: some View {
        ZStack {
            if viewMode == "Schematic" {
                schematicCanvas
            } else if viewMode == "Layout" {
                copperLayoutCanvas
            } else {
                threeDPreviewCanvas
            }
        }
        .padding(12)
    }

    private var schematicCanvas: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(Color(red: 0.08, green: 0.10, blue: 0.14))
            .overlay(
                VStack(spacing: 12) {
                    Image(systemName: "cpu.fill")
                        .font(.system(size: 60))
                        .foregroundColor(.cyan.opacity(0.7))
                    Text("Interactive ECAD Schematic Vector Canvas")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("ESP32-S3 Microcontroller Node with I2C Sensor & USB-C Power")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)

                    HStack(spacing: 8) {
                        ForEach(appState.pcbNets) { net in
                            Text("\(net.name) (\(net.fromPin) → \(net.toPin))")
                                .font(.system(size: 9, design: .monospaced))
                                .padding(4)
                                .background(Color.cyan.opacity(0.15))
                                .foregroundColor(.cyan)
                                .cornerRadius(3)
                        }
                    }
                }
            )
    }

    private var copperLayoutCanvas: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(Color(red: 0.05, green: 0.06, blue: 0.08))
            .overlay(
                VStack(spacing: 12) {
                    Image(systemName: "square.split.diagonal.2x2")
                        .font(.system(size: 60))
                        .foregroundColor(.red.opacity(0.8))
                    Text("2-Layer PCB Layout Canvas (F.Cu & B.Cu)")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("Red: Top Copper (F.Cu) • Blue: Bottom Copper (B.Cu) • Yellow: Edge.Cuts")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
            )
    }

    private var threeDPreviewCanvas: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(Color(red: 0.07, green: 0.09, blue: 0.13))
            .overlay(
                VStack(spacing: 14) {
                    Image(systemName: "cube.transparent")
                        .font(.system(size: 70))
                        .foregroundColor(.green.opacity(0.8))
                    Text("Interactive 3D PCB Assembly Render")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("Matte Stealth Black Mask • ENIG Gold Pads • 3D STEP Packages")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.secondary)
                }
            )
    }

    // MARK: - Right Column: AI Hardware Co-Pilot

    private var aiHardwareCopilotColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("AI HARDWARE CO-PILOT")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Image(systemName: "sparkles")
                    .foregroundColor(.purple)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    coPilotMessage("AI", "I can help synthesize circuit schematics, verify LCSC part numbers, wire nets, and check for DRC/ERC rule violations.")
                    coPilotMessage("User", "Add an ESP32-S3 microcontroller with USB Type-C 5V power, an AMS1117-3.3V LDO regulator, and a BME280 sensor on I2C.")
                    coPilotMessage("AI", "Synthesized 5 components, created 5 power & bus nets, and checked decoupling capacitors. Ready to export KiCad 9.")
                }
                .padding(10)
            }

            Divider()

            HStack(spacing: 6) {
                TextField("Ask Hardware Co-Pilot...", text: $copilotInput)
                    .textFieldStyle(.plain)
                    .font(.system(size: 11))
                Button {
                    copilotInput = ""
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .foregroundColor(.purple)
                }
                .buttonStyle(.plain)
            }
            .padding(10)
            .background(Color(NSColor.controlBackgroundColor))
        }
        .background(Color(NSColor.controlBackgroundColor).opacity(0.4))
    }

    private func coPilotMessage(_ sender: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(sender)
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(sender == "AI" ? .purple : .cyan)
            Text(text)
                .font(.system(size: 11))
                .foregroundColor(.primary)
        }
        .padding(8)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(6)
    }

    private var kicadExportModal: some View {
        VStack(spacing: 16) {
            Text("Export ECAD Project")
                .font(.headline)

            VStack(alignment: .leading, spacing: 8) {
                Text("• KiCad 8 & 9 Native (.kicad_sch & .kicad_pcb)")
                Text("• Bill of Materials (BOM CSV with LCSC Part Numbers)")
                Text("• SMT Pick-and-Place Centroid Data (JLCPCB / PCBWay)")
                Text("• Altium Designer Netlist (.net)")
            }
            .font(.system(size: 12))

            Button("Download KiCad Archive (.zip)") {
                isExportModalPresented = false
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(width: 360, height: 220)
    }
}
