//
// CreativeStudioView.swift
// SuperAgent
//
// Native macOS Creative Studio Workspace.
// Features Image Generation canvas, aspect ratios, inpainting shelf, watermark modal,
// color palettes, filmstrip gallery, and Video Generation stage with prompt enhancer.
//

import SwiftUI
import AppKit

public struct CreativeStudioView: View {
    @EnvironmentObject private var appState: AppState
    @State private var studioMode: String = "Images" // "Images" or "Videos"
    @State private var isWatermarkModalPresented: Bool = false
    @State private var isColorPaletteModalPresented: Bool = false

    let aspectRatios: [String] = ["1:1", "16:9", "9:16", "4:3", "3:2", "21:9"]
    let colorPalettes: [String] = ["Teal & Obsidian", "Cyberpunk Neon", "Sunset Horizon", "Pastel Dream", "Earthy Moss", "Monochrome Noir"]

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            topControlBar
            Divider()

            if studioMode == "Images" {
                imageStudioLayout
            } else {
                videoStudioLayout
            }
        }
        .background(Color(NSColor.windowBackgroundColor))
        .sheet(isPresented: $isWatermarkModalPresented) {
            watermarkModal
        }
        .sheet(isPresented: $isColorPaletteModalPresented) {
            colorPaletteModal
        }
    }

    // MARK: - Top Mode Switcher Bar

    private var topControlBar: some View {
        HStack(spacing: 16) {
            Picker("", selection: $studioMode) {
                Text("Image Generation").tag("Images")
                Text("Video Generation").tag("Videos")
            }
            .pickerStyle(.segmented)
            .frame(width: 280)

            Spacer()

            if studioMode == "Images" {
                Button {
                    isWatermarkModalPresented = true
                } label: {
                    Label("Brand Watermark", systemImage: "seal")
                        .font(.caption)
                }

                Button {
                    isColorPaletteModalPresented = true
                } label: {
                    Label("Color Conditioning", systemImage: "paintpalette")
                        .font(.caption)
                }
            } else {
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 8, height: 8)
                    Text("FFmpeg 7.0 Pipeline Ready")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color(NSColor.controlBackgroundColor))
    }

    // MARK: - Image Studio Layout

    private var imageStudioLayout: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                // Left Column: Parameters Drawer (320px)
                imageSettingsColumn
                    .frame(width: 320)

                Divider()

                // Center Column: Main Interactive Image Canvas & Inpainting Shelf
                imageCanvasColumn
                    .frame(maxWidth: .infinity)
            }

            Divider()

            // Bottom Filmstrip Gallery
            filmstripGalleryBar
                .frame(height: 120)
        }
    }

    private var imageSettingsColumn: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("IMAGE GENERATION ENGINE")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Prompt:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    TextEditor(text: $appState.imageParams.prompt)
                        .font(.system(size: 11))
                        .frame(height: 70)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.gray.opacity(0.3)))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Negative Prompt:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    TextField("", text: $appState.imageParams.negativePrompt)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 11))
                }

                // Aspect Ratio Selector
                VStack(alignment: .leading, spacing: 6) {
                    Text("Aspect Ratio:")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 46))], spacing: 6) {
                        ForEach(aspectRatios, id: \.self) { ratio in
                            Button(ratio) {
                                appState.imageParams.aspectRatio = ratio
                            }
                            .buttonStyle(.bordered)
                            .tint(appState.imageParams.aspectRatio == ratio ? .accentColor : .secondary)
                            .controlSize(.mini)
                        }
                    }
                }

                // Steps & CFG Sliders
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Inference Steps:")
                            .font(.caption)
                        Spacer()
                        Text("\(appState.imageParams.steps)")
                            .font(.caption.monospaced())
                    }
                    Slider(value: Binding(get: { Double(appState.imageParams.steps) }, set: { appState.imageParams.steps = Int($0) }), in: 10...50, step: 1)
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("CFG Guidance Scale:")
                            .font(.caption)
                        Spacer()
                        Text(String(format: "%.1f", appState.imageParams.cfgScale))
                            .font(.caption.monospaced())
                    }
                    Slider(value: $appState.imageParams.cfgScale, in: 1.0...15.0, step: 0.5)
                }

                Button {
                    // Trigger generation
                } label: {
                    Label("Generate Image", systemImage: "sparkles")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .padding(.top, 6)
            }
            .padding(14)
        }
        .background(Color(NSColor.controlBackgroundColor).opacity(0.4))
    }

    private var imageCanvasColumn: some View {
        VStack(spacing: 0) {
            // Main Canvas Area
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(red: 0.06, green: 0.08, blue: 0.12))

                VStack(spacing: 12) {
                    Image(systemName: "photo.artframe")
                        .font(.system(size: 80))
                        .foregroundColor(.cyan.opacity(0.6))
                    Text("FLUX.1 Dev Hardware Generation Stage")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("1344 x 768 • 16:9 • Seed: \(appState.imageParams.seed)")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.secondary)
                }

                // Inpainting Shelf Banner
                VStack {
                    Spacer()
                    HStack(spacing: 12) {
                        Label("Inpainting Shelf & Mask Painter", systemImage: "paintbrush.fill")
                            .font(.caption)
                            .foregroundColor(.white)
                        Spacer()
                        Button("Brush: 24px") {}
                            .controlSize(.mini)
                        Button("Clear Mask") {}
                            .controlSize(.mini)
                    }
                    .padding(8)
                    .background(Color.black.opacity(0.75))
                    .cornerRadius(6)
                    .padding(12)
                }
            }
            .padding(12)
        }
    }

    private var filmstripGalleryBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("SESSION FILMSTRIP GALLERY")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(appState.filmstrip.count) Generations")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.top, 6)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(appState.filmstrip) { item in
                        VStack(alignment: .leading, spacing: 2) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.gray.opacity(0.2))
                                .frame(width: 100, height: 56)
                                .overlay(
                                    Image(systemName: "photo")
                                        .foregroundColor(.secondary)
                                )

                            Text(item.title)
                                .font(.system(size: 10, weight: .medium))
                                .lineLimit(1)
                            Text(item.dimensions)
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(.secondary)
                        }
                        .frame(width: 100)
                    }
                }
                .padding(.horizontal, 12)
            }
        }
        .background(Color(NSColor.controlBackgroundColor))
    }

    // MARK: - Video Studio Layout

    private var videoStudioLayout: some View {
        HStack(spacing: 0) {
            // Left Controls
            VStack(alignment: .leading, spacing: 14) {
                Text("VIDEO GENERATION STAGE")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)

                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Cinematographic Prompt:")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Spacer()
                        Button {
                            appState.enhanceVideoPrompt()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "sparkles")
                                Text("Enhance Prompt")
                            }
                            .font(.caption2)
                            .foregroundColor(.purple)
                        }
                    }

                    TextEditor(text: $appState.videoJob.prompt)
                        .font(.system(size: 11))
                        .frame(height: 90)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.gray.opacity(0.3)))
                }

                HStack {
                    Text("Engine: Wan2.1")
                    Spacer()
                    Text("Duration: 6s @ 24fps")
                }
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.secondary)

                // Progress Bar
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Status: \(appState.videoJob.status.uppercased())")
                            .font(.caption)
                        Spacer()
                        Text("\(appState.videoJob.progressPercent)%")
                            .font(.caption.monospaced())
                    }
                    ProgressView(value: Double(appState.videoJob.progressPercent) / 100.0)
                        .tint(.purple)
                }

                Spacer()
            }
            .padding(14)
            .frame(width: 320)
            .background(Color(NSColor.controlBackgroundColor).opacity(0.4))

            Divider()

            // Video Player Stage
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(red: 0.05, green: 0.06, blue: 0.10))

                VStack(spacing: 16) {
                    Image(systemName: "play.rectangle.fill")
                        .font(.system(size: 90))
                        .foregroundColor(.purple.opacity(0.8))

                    Text("Native GPU Video Stage (1280x720 ProRes / MP4)")
                        .font(.headline)
                        .foregroundColor(.white)

                    HStack(spacing: 14) {
                        Button("0.5x") {}
                        Button("1.0x") {}
                        Button("2.0x") {}
                        Button("A/B Loop") {}
                    }
                    .font(.caption)
                }
            }
            .padding(12)
        }
    }

    // MARK: - Modals

    private var watermarkModal: some View {
        VStack(spacing: 16) {
            Text("Brand Watermark Compositor")
                .font(.headline)

            Text("Select anchor point and opacity for output media.")
                .font(.caption)
                .foregroundColor(.secondary)

            Picker("Anchor", selection: $appState.imageParams.watermarkAnchor) {
                Text("Bottom-Right").tag("Bottom-Right")
                Text("Bottom-Left").tag("Bottom-Left")
                Text("Top-Right").tag("Top-Right")
                Text("Top-Left").tag("Top-Left")
                Text("Center").tag("Center")
            }

            Toggle("Enable Watermark", isOn: $appState.imageParams.watermarkEnabled)

            Button("Done") {
                isWatermarkModalPresented = false
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(width: 340, height: 240)
    }

    private var colorPaletteModal: some View {
        VStack(spacing: 16) {
            Text("Color Conditioning Palettes")
                .font(.headline)

            Picker("Palette", selection: $appState.imageParams.activePalette) {
                ForEach(colorPalettes, id: \.self) { palette in
                    Text(palette).tag(palette)
                }
            }

            Button("Apply Palette") {
                isColorPaletteModalPresented = false
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(width: 340, height: 200)
    }
}
