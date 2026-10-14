// DemoData.cs - SuperAgent Windows Native WinUI 3
// Comprehensive demo datasets, models, and mock stubs across all 10 workspaces.
// Mirrors packages/core_v2 and adheres strictly to docs/UI_SPECIFICATION.md.

using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SuperAgent.Core;

#region 1. Computer Use Demo Data

// ============================================================================
// [DEMO_STUB: ComputerUse]
// DESCRIPTION: Mock datasets for Windows Graphics Capture (WGC), live accessibility tree inspection with element indices, mouse velocity trajectory visualizer, and settling countdown indicators.
// BACKEND_ROUTE: /api/computer-use -> packages/core_v2/src/tools/builtin/desktop_automation.rs
// SEARCH_TAG: #DEMO_COMPUTER_USE
// ============================================================================

public record WindowTargetItem
{
    [JsonPropertyName("hwnd")]
    public long Hwnd { get; init; }

    [JsonPropertyName("title")]
    public string Title { get; init; } = string.Empty;

    [JsonPropertyName("processName")]
    public string ProcessName { get; init; } = string.Empty;

    [JsonPropertyName("isOccluded")]
    public bool IsOccluded { get; init; }

    [JsonIgnore]
    public string OcclusionStatus => IsOccluded ? "Occluded" : "Visible";

    [JsonIgnore]
    public string HwndHex => $"0x{Hwnd:X8}";

    [JsonPropertyName("bounds")]
    public string Bounds { get; init; } = "1920x1080+0+0";
}

public record AccessibilityTreeNode
{
    [JsonPropertyName("elementIndex")]
    public int ElementIndex { get; init; }

    [JsonPropertyName("role")]
    public string Role { get; init; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("value")]
    public string Value { get; init; } = string.Empty;

    [JsonPropertyName("bounds")]
    public string Bounds { get; init; } = string.Empty;

    [JsonPropertyName("children")]
    public List<AccessibilityTreeNode> Children { get; init; } = new();
}

public record MouseTrajectoryPoint
{
    [JsonPropertyName("x")]
    public double X { get; init; }

    [JsonPropertyName("y")]
    public double Y { get; init; }

    [JsonPropertyName("velocityPixelsPerSec")]
    public double VelocityPixelsPerSec { get; init; }

    [JsonPropertyName("timestampMs")]
    public long TimestampMs { get; init; }

    [JsonPropertyName("action")]
    public string Action { get; init; } = "move"; // move, click, dblclick, settle
}

public record ComputerUseState
{
    [JsonPropertyName("selectedWindow")]
    public WindowTargetItem? SelectedWindow { get; init; }

    [JsonPropertyName("windows")]
    public List<WindowTargetItem> Windows { get; init; } = new();

    [JsonPropertyName("accessibilityRoot")]
    public AccessibilityTreeNode? AccessibilityRoot { get; init; }

    [JsonPropertyName("trajectoryPoints")]
    public List<MouseTrajectoryPoint> TrajectoryPoints { get; init; } = new();

    [JsonPropertyName("settlingRemainingMs")]
    public int SettlingRemainingMs { get; init; }

    [JsonPropertyName("settlingTotalMs")]
    public int SettlingTotalMs { get; init; } = 800;

    [JsonPropertyName("isSettled")]
    public bool IsSettled { get; init; } = true;
}

// ============================================================================
// [END_DEMO_STUB: ComputerUse]
// ============================================================================

#endregion

#region 2. Browser Leasing Demo Data

// ============================================================================
// [DEMO_STUB: BrowserLeasing]
// DESCRIPTION: Two-tiered tab leasing (claimExistingTab vs createTab), countdown leases, WebMCP in-page tools registry, CDP event streams, and in-DOM agent badges.
// BACKEND_ROUTE: /api/browser-lease -> packages/core_v2/src/tools/builtin/browser.rs
// SEARCH_TAG: #DEMO_BROWSER_LEASING
// ============================================================================

public record BrowserLeaseTab
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = Guid.NewGuid().ToString("N");

    [JsonPropertyName("tier")]
    public string Tier { get; init; } = "createTab"; // claimExistingTab or createTab

    [JsonPropertyName("url")]
    public string Url { get; init; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; init; } = string.Empty;

    [JsonPropertyName("remainingSeconds")]
    public int RemainingSeconds { get; init; }

    [JsonPropertyName("totalSeconds")]
    public int TotalSeconds { get; init; } = 300;

    [JsonPropertyName("status")]
    public string Status { get; init; } = "leased"; // leased, expired, releasing

    [JsonPropertyName("hasDomBadge")]
    public bool HasDomBadge { get; init; } = true;

    [JsonPropertyName("domBadgeText")]
    public string DomBadgeText { get; init; } = "SuperAgent Active Lease";
}

public record WebMcpTool
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("schemaSummary")]
    public string SchemaSummary { get; init; } = string.Empty;

    [JsonPropertyName("callCount")]
    public int CallCount { get; init; }

    [JsonPropertyName("isInstalledInDom")]
    public bool IsInstalledInDom { get; init; } = true;
}

public record CdpStreamEvent
{
    [JsonPropertyName("timestamp")]
    public string Timestamp { get; init; } = DateTime.Now.ToString("HH:mm:ss.fff");

    [JsonPropertyName("method")]
    public string Method { get; init; } = string.Empty;

    [JsonPropertyName("direction")]
    public string Direction { get; init; } = "RECV"; // SEND or RECV

    [JsonPropertyName("payloadSummary")]
    public string PayloadSummary { get; init; } = string.Empty;

    [JsonPropertyName("isHighlighted")]
    public bool IsHighlighted { get; init; }
}

public record BrowserLeasingState
{
    [JsonPropertyName("activeTabs")]
    public List<BrowserLeaseTab> ActiveTabs { get; init; } = new();

    [JsonPropertyName("tools")]
    public List<WebMcpTool> Tools { get; init; } = new();

    [JsonPropertyName("cdpEvents")]
    public List<CdpStreamEvent> CdpEvents { get; init; } = new();
}

// ============================================================================
// [END_DEMO_STUB: BrowserLeasing]
// ============================================================================

#endregion

#region 3. Security Confirmation & Guardian Demo Data

// ============================================================================
// [DEMO_STUB: SecurityConfirmation]
// DESCRIPTION: 4-Tier Confirmation framework (Hand-Off, Always Confirm, Pre-Approval, No Confirmation), 16-state zo security decision badges, LockScreen Guardian shield indicator, and Credential Vault 7-branch recovery actions.
// BACKEND_ROUTE: /api/security/guard -> packages/core_v2/src/storage/auth.rs
// SEARCH_TAG: #DEMO_SECURITY_CONFIRMATION
// ============================================================================

public enum SecurityTierLevel
{
    HandOff = 0,
    AlwaysConfirm = 1,
    PreApproval = 2,
    NoConfirmation = 3
}

public record ZoSecurityDecisionBadge
{
    [JsonPropertyName("stateCode")]
    public int StateCode { get; init; } // 0..15 states

    [JsonPropertyName("label")]
    public string Label { get; init; } = string.Empty;

    [JsonPropertyName("wireCode")]
    public string WireCode { get; init; } = string.Empty;

    [JsonPropertyName("decisionSource")]
    public string DecisionSource { get; init; } = "guardian";

    [JsonPropertyName("severity")]
    public string Severity { get; init; } = "safe"; // safe, warning, elevated, critical

    [JsonPropertyName("rationale")]
    public string Rationale { get; init; } = string.Empty;

    [JsonPropertyName("colorHex")]
    public string ColorHex { get; init; } = "#10B981";

    [JsonPropertyName("retryable")]
    public bool Retryable { get; init; }
}

public record CredentialRecoveryBranch
{
    [JsonPropertyName("branchId")]
    public int BranchId { get; init; } // 1..7 branches

    [JsonPropertyName("actionIdentifier")]
    public string ActionIdentifier { get; init; } = string.Empty;

    [JsonPropertyName("actionName")]
    public string ActionName { get; init; } = string.Empty;

    [JsonPropertyName("protocolSummary")]
    public string ProtocolSummary { get; init; } = string.Empty;

    [JsonPropertyName("riskRating")]
    public string RiskRating { get; init; } = "Standard";

    [JsonPropertyName("riskColor")]
    public string RiskColor { get; init; } = "#10B981";

    [JsonPropertyName("isAvailable")]
    public bool IsAvailable { get; init; } = true;
}

public record SecurityGuardianState
{
    [JsonPropertyName("activeTier")]
    public SecurityTierLevel ActiveTier { get; init; } = SecurityTierLevel.PreApproval;

    [JsonPropertyName("isLockScreenArmed")]
    public bool IsLockScreenArmed { get; init; } = true;

    [JsonPropertyName("shieldStatus")]
    public string ShieldStatus { get; init; } = "WTS_SESSION_ACTIVE • CUALockScreenGuardian Armed (Zero Leaks)";

    [JsonPropertyName("topLevelOrigin")]
    public string TopLevelOrigin { get; init; } = "https://store.target-vendor.com";

    [JsonPropertyName("credentialFrameOrigin")]
    public string CredentialFrameOrigin { get; init; } = "https://auth.login-service.net/oauth/v2";

    [JsonPropertyName("formSubmissionOrigin")]
    public string FormSubmissionOrigin { get; init; } = "https://store.target-vendor.com/checkout/submit";

    [JsonPropertyName("activeDecision")]
    public ZoSecurityDecisionBadge? ActiveDecision { get; init; }

    [JsonPropertyName("allBadges")]
    public List<ZoSecurityDecisionBadge> AllBadges { get; init; } = new();

    [JsonPropertyName("recoveryBranches")]
    public List<CredentialRecoveryBranch> RecoveryBranches { get; init; } = new();
}

// ============================================================================
// [END_DEMO_STUB: SecurityConfirmation]
// ============================================================================

#endregion

#region 4. REPL Console Demo Data

// ============================================================================
// [DEMO_STUB: ReplConsole]
// DESCRIPTION: 25,000-token virtualized buffer simulation, ANSI color parser, live variable/scope inspector tree, and session reset handler (js_reset).
// BACKEND_ROUTE: /api/repl -> packages/core_v2/src/tools/builtin/shell.rs
// SEARCH_TAG: #DEMO_REPL_CONSOLE
// ============================================================================

public record ReplLogLine
{
    [JsonPropertyName("lineIndex")]
    public int LineIndex { get; init; }

    [JsonPropertyName("text")]
    public string Text { get; init; } = string.Empty;

    [JsonPropertyName("colorHex")]
    public string ColorHex { get; init; } = "#F8FAFC";

    [JsonPropertyName("isAnsiPrompt")]
    public bool IsAnsiPrompt { get; init; }

    [JsonPropertyName("approxTokens")]
    public int ApproxTokens { get; init; } = 12;
}

public record ReplVariableNode
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; init; } = string.Empty;

    [JsonPropertyName("value")]
    public string Value { get; init; } = string.Empty;

    [JsonPropertyName("memory")]
    public string Memory { get; init; } = "1.2 KB";

    [JsonPropertyName("typeColor")]
    public string TypeColor { get; init; } = "#06B6D4";

    [JsonPropertyName("children")]
    public List<ReplVariableNode> Children { get; init; } = new();
}

public record ReplConsoleState
{
    [JsonPropertyName("totalTokens")]
    public int TotalTokens { get; init; } = 3840;

    [JsonPropertyName("maxBufferTokens")]
    public int MaxBufferTokens { get; init; } = 25000;

    [JsonPropertyName("isResetPending")]
    public bool IsResetPending { get; init; }

    [JsonPropertyName("engineVersion")]
    public string EngineVersion { get; init; } = "QuickJS v2024-01-13 | Active";

    [JsonPropertyName("lines")]
    public List<ReplLogLine> Lines { get; init; } = new();

    [JsonPropertyName("scopeVariables")]
    public List<ReplVariableNode> ScopeVariables { get; init; } = new();
}

// ============================================================================
// [END_DEMO_STUB: ReplConsole]
// ============================================================================

#endregion

#region 5. Companion & 3D Pet Ecosystem Demo Data

// ============================================================================
// [DEMO_STUB: Companion]
// DESCRIPTION: 3D companion avatar view, emotion mood badges (Joy, Thinking, Error, Welcoming, Sleeping), audio viseme lip-sync meter, photo mode presets, and floating desktop pet popout controls.
// BACKEND_ROUTE: /api/companion -> packages/core_v2/src/protocol/events.rs
// SEARCH_TAG: #DEMO_COMPANION
// ============================================================================

public record CompanionMoodBadge
{
    [JsonPropertyName("mood")]
    public string Mood { get; init; } = "Joy"; // Joy, Thinking, Error, Welcoming, Sleeping

    [JsonPropertyName("iconGlyph")]
    public string IconGlyph { get; init; } = "\xE76E";

    [JsonPropertyName("accentHex")]
    public string AccentHex { get; init; } = "#10B981";

    [JsonPropertyName("description")]
    public string Description { get; init; } = "Celebrating successful deployment";
}

public record VisemeMetric
{
    [JsonPropertyName("viseme")]
    public string Viseme { get; init; } = "aa";

    [JsonPropertyName("weight")]
    public double Weight { get; init; } // 0.0 .. 1.0

    [JsonPropertyName("dbLevel")]
    public double DbLevel { get; init; }
}

public record PhotoModePreset
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("pose")]
    public string Pose { get; init; } = string.Empty;

    [JsonPropertyName("lightingPreset")]
    public string LightingPreset { get; init; } = "Cyberpunk Studio";

    [JsonPropertyName("lightingAngle")]
    public string LightingAngle { get; init; } = "45° Key / Rim Magenta";

    [JsonPropertyName("resolution")]
    public string Resolution { get; init; } = "3840x2160 (4K UHD)";
}

public record CompanionState
{
    [JsonPropertyName("companionName")]
    public string CompanionName { get; init; } = "Aiko (AI-39)";

    [JsonPropertyName("vrmModelPath")]
    public string VrmModelPath { get; init; } = "models/avatar_aiko.vrm";

    [JsonPropertyName("activeMood")]
    public string ActiveMood { get; init; } = "Joy";

    [JsonPropertyName("intimacyLevel")]
    public int IntimacyLevel { get; init; } = 84; // 0..100

    [JsonPropertyName("batteryLevel")]
    public int BatteryLevel { get; init; } = 92;

    [JsonPropertyName("isFloatingPetActive")]
    public bool IsFloatingPetActive { get; init; }

    [JsonPropertyName("visemes")]
    public List<VisemeMetric> Visemes { get; init; } = new();

    [JsonPropertyName("moods")]
    public List<CompanionMoodBadge> Moods { get; init; } = new();

    [JsonPropertyName("photoPresets")]
    public List<PhotoModePreset> PhotoPresets { get; init; } = new();
}

// ============================================================================
// [END_DEMO_STUB: Companion]
// ============================================================================

#endregion

#region 6. Creative Studio (Images & Videos) Demo Data

// ============================================================================
// [DEMO_STUB: CreativeStudio]
// DESCRIPTION: Image generation canvas, aspect ratios, inpainting shelf, watermark modal, color palettes, filmstrip gallery, and Video generation stage with prompt enhancer.
// BACKEND_ROUTE: /api/creative -> packages/core_v2/src/image_workspace/ & video_workspace/
// SEARCH_TAG: #DEMO_CREATIVE_STUDIO
// ============================================================================

public record ImageItem
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = Guid.NewGuid().ToString("N");

    [JsonPropertyName("prompt")]
    public string Prompt { get; init; } = string.Empty;

    [JsonPropertyName("aspectRatio")]
    public string AspectRatio { get; init; } = "16:9";

    [JsonPropertyName("engine")]
    public string Engine { get; init; } = "Flux.1 Dev";

    [JsonPropertyName("seed")]
    public long Seed { get; init; } = 42819028;

    [JsonPropertyName("steps")]
    public int Steps { get; init; } = 30;

    [JsonPropertyName("cfgScale")]
    public double CfgScale { get; init; } = 7.5;

    [JsonPropertyName("paletteName")]
    public string PaletteName { get; init; } = "Cyberpunk Neon";

    [JsonPropertyName("previewHex")]
    public string PreviewHex { get; init; } = "#1E1B4B";
}

public record VideoItem
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = Guid.NewGuid().ToString("N");

    [JsonPropertyName("prompt")]
    public string Prompt { get; init; } = string.Empty;

    [JsonPropertyName("enhancedPrompt")]
    public string EnhancedPrompt { get; init; } = string.Empty;

    [JsonPropertyName("durationSeconds")]
    public int DurationSeconds { get; init; } = 6;

    [JsonPropertyName("fps")]
    public int Fps { get; init; } = 30;

    [JsonPropertyName("resolution")]
    public string Resolution { get; init; } = "1080p";

    [JsonPropertyName("engine")]
    public string Engine { get; init; } = "Wan2.1-T2V-14B";

    [JsonPropertyName("hasFfmpeg")]
    public bool HasFfmpeg { get; init; } = true;
}

public record PalettePreset
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("colors")]
    public List<string> Colors { get; init; } = new();

    [JsonPropertyName("weight")]
    public double Weight { get; init; } = 0.8;
}

public record WatermarkConfig
{
    [JsonPropertyName("anchorPlacement")]
    public string AnchorPlacement { get; init; } = "BottomRight"; // 7-point: TopLeft, TopCenter, TopRight, Center, BottomLeft, BottomCenter, BottomRight

    [JsonPropertyName("opacity")]
    public int Opacity { get; init; } = 85;

    [JsonPropertyName("scalePercent")]
    public int ScalePercent { get; init; } = 20;

    [JsonPropertyName("watermarkText")]
    public string WatermarkText { get; init; } = "SUPERAGENT © 2026";
}

public record CreativeStudioState
{
    [JsonPropertyName("activeImage")]
    public ImageItem? ActiveImage { get; init; }

    [JsonPropertyName("filmstrip")]
    public List<ImageItem> Filmstrip { get; init; } = new();

    [JsonPropertyName("activeVideo")]
    public VideoItem? ActiveVideo { get; init; }

    [JsonPropertyName("videoQueue")]
    public List<VideoItem> VideoQueue { get; init; } = new();

    [JsonPropertyName("palettes")]
    public List<PalettePreset> Palettes { get; init; } = new();

    [JsonPropertyName("watermark")]
    public WatermarkConfig Watermark { get; init; } = new();
}

// ============================================================================
// [END_DEMO_STUB: CreativeStudio]
// ============================================================================

#endregion

#region 7. PCB & Hardware ECAD Demo Data

// ============================================================================
// [DEMO_STUB: PcbEcad]
// DESCRIPTION: PCB schematic editor, PCB copper layout canvas, 3D PCB preview, real-time ERC rules checker, AI Hardware Co-Pilot, and KiCad/BOM exporter.
// BACKEND_ROUTE: /api/pcb -> packages/core_v2/src/tools/builtin/pcb_ops.rs
// SEARCH_TAG: #DEMO_PCB_ECAD
// ============================================================================

public record PcbComponent
{
    [JsonPropertyName("designator")]
    public string Designator { get; init; } = string.Empty; // U1, R1, C1, J1

    [JsonPropertyName("mpn")]
    public string Mpn { get; init; } = string.Empty;

    [JsonPropertyName("lcscId")]
    public string LcscId { get; init; } = string.Empty;

    [JsonPropertyName("footprint")]
    public string Footprint { get; init; } = string.Empty;

    [JsonPropertyName("x")]
    public double X { get; init; }

    [JsonPropertyName("y")]
    public double Y { get; init; }

    [JsonPropertyName("rotationDeg")]
    public double RotationDeg { get; init; }
}

public record PcbNetWire
{
    [JsonPropertyName("netName")]
    public string NetName { get; init; } = string.Empty; // VBUS_5V, +3V3, GND, I2C_SDA, I2C_SCL

    [JsonPropertyName("fromNode")]
    public string FromNode { get; init; } = string.Empty;

    [JsonPropertyName("toNode")]
    public string ToNode { get; init; } = string.Empty;
}

public record ErcRuleViolation
{
    [JsonPropertyName("ruleId")]
    public string RuleId { get; init; } = "floating_pin"; // floating_pin, voltage_mismatch, missing_decoupling, missing_pullup, power_loop

    [JsonPropertyName("severity")]
    public string Severity { get; init; } = "Warning";

    [JsonPropertyName("message")]
    public string Message { get; init; } = string.Empty;

    [JsonPropertyName("component")]
    public string Component { get; init; } = string.Empty;
}

public record PcbLayer
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = "Top Copper";

    [JsonPropertyName("colorHex")]
    public string ColorHex { get; init; } = "#EF4444";

    [JsonPropertyName("isVisible")]
    public bool IsVisible { get; init; } = true;
}

public record PcbEcadState
{
    [JsonPropertyName("projectName")]
    public string ProjectName { get; init; } = "ESP32-S3 IoT Weather Node";

    [JsonPropertyName("components")]
    public List<PcbComponent> Components { get; init; } = new();

    [JsonPropertyName("nets")]
    public List<PcbNetWire> Nets { get; init; } = new();

    [JsonPropertyName("ercViolations")]
    public List<ErcRuleViolation> ErcViolations { get; init; } = new();

    [JsonPropertyName("layers")]
    public List<PcbLayer> Layers { get; init; } = new();

    [JsonPropertyName("aiCopilotHistory")]
    public List<string> AiCopilotHistory { get; init; } = new();
}

// ============================================================================
// [END_DEMO_STUB: PcbEcad]
// ============================================================================

#endregion

#region 8. Tasks & Kanban Routines Demo Data

// ============================================================================
// [DEMO_STUB: TasksKanban]
// DESCRIPTION: 4-column Kanban board (To Do, In Progress, Blocked / Review, Done), cron routines modal with presets and Telegram notifications.
// BACKEND_ROUTE: /api/tasks -> packages/core_v2/src/orchestrator/mod.rs
// SEARCH_TAG: #DEMO_TASKS_KANBAN
// ============================================================================

public record KanbanCard
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = Guid.NewGuid().ToString("N")[..8];

    [JsonPropertyName("column")]
    public string Column { get; init; } = "ToDo"; // ToDo, InProgress, BlockedReview, Done

    [JsonPropertyName("title")]
    public string Title { get; init; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("priority")]
    public string Priority { get; init; } = "Medium"; // Low, Medium, High, Critical

    [JsonPropertyName("assignedPersona")]
    public string AssignedPersona { get; init; } = "Code Janitor";

    [JsonPropertyName("dueDate")]
    public string DueDate { get; init; } = "Today";

    [JsonPropertyName("estimatedTokens")]
    public string EstimatedTokens { get; init; } = "12.4k tok";

    [JsonPropertyName("tag")]
    public string Tag { get; init; } = "Rust Core";
}

public record CronRoutine
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = Guid.NewGuid().ToString("N")[..8];

    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("promptTemplate")]
    public string PromptTemplate { get; init; } = string.Empty;

    [JsonPropertyName("cronExpression")]
    public string CronExpression { get; init; } = "0 9 * * 1-5";

    [JsonPropertyName("presetName")]
    public string PresetName { get; init; } = "Weekdays at 9 AM";

    [JsonPropertyName("notifyTelegram")]
    public bool NotifyTelegram { get; init; } = true;

    [JsonPropertyName("telegramChatId")]
    public string TelegramChatId { get; init; } = "@devops_alerts";

    [JsonPropertyName("webhookUrl")]
    public string WebhookUrl { get; init; } = "http://localhost:1469/api/triggers/webhook/sec-token-77";

    [JsonPropertyName("isEnabled")]
    public bool IsEnabled { get; set; } = true;
}

public record TasksState
{
    [JsonPropertyName("cards")]
    public List<KanbanCard> Cards { get; init; } = new();

    [JsonPropertyName("routines")]
    public List<CronRoutine> Routines { get; init; } = new();
}

// ============================================================================
// [END_DEMO_STUB: TasksKanban]
// ============================================================================

#endregion

#region 9. Settings 24-Module & System Doctor Demo Data

// ============================================================================
// [DEMO_STUB: Settings24]
// DESCRIPTION: Expanded 24-module settings catalog and System Doctor hardware diagnostics (Node.js, Rust, Git, FFmpeg, GPU VRAM, CUDA/Metal, Port 1469 bind test, disk space).
// BACKEND_ROUTE: /api/settings & /api/system-doctor -> packages/core_v2/src/storage/settings.rs
// SEARCH_TAG: #DEMO_SETTINGS_24
// ============================================================================

public record SettingsModule
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("category")]
    public string Category { get; init; } = "General";

    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("iconGlyph")]
    public string IconGlyph { get; init; } = "\xE713";

    [JsonPropertyName("statusSummary")]
    public string StatusSummary { get; init; } = "Configured";
}

public record SystemDoctorDiagnostic
{
    [JsonPropertyName("component")]
    public string Component { get; init; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; init; } = "Healthy"; // Healthy, Warning, Error

    [JsonPropertyName("details")]
    public string Details { get; init; } = string.Empty;

    [JsonPropertyName("isPassed")]
    public bool IsPassed { get; init; } = true;
}

public record SettingsCatalogState
{
    [JsonPropertyName("modules")]
    public List<SettingsModule> Modules { get; init; } = new();

    [JsonPropertyName("diagnostics")]
    public List<SystemDoctorDiagnostic> Diagnostics { get; init; } = new();
}

// ============================================================================
// [END_DEMO_STUB: Settings24]
// ============================================================================

#endregion

#region Central DemoData Provider

/// <summary>
/// Static mock repository supplying all 10 workspaces with rich, realistic data.
/// </summary>
public static class DemoData
{
    public static ComputerUseState GetComputerUseDemo()
    {
        return new ComputerUseState
        {
            SelectedWindow = new WindowTargetItem
            {
                Hwnd = 0x002A0B42,
                Title = "Visual Studio Code - AgentApp",
                ProcessName = "Code.exe",
                IsOccluded = false,
                Bounds = "1920x1080+0+0"
            },
            Windows = new List<WindowTargetItem>
            {
                new() { Hwnd = 0x002A0B42, Title = "Visual Studio Code - AgentApp", ProcessName = "Code.exe", IsOccluded = false, Bounds = "1920x1080+0+0" },
                new() { Hwnd = 0x0014028A, Title = "Google Chrome - GitHub Pull Request #412", ProcessName = "chrome.exe", IsOccluded = true, Bounds = "1280x900+100+100" },
                new() { Hwnd = 0x0033019C, Title = "Windows Terminal - pwsh core_v2", ProcessName = "WindowsTerminal.exe", IsOccluded = false, Bounds = "960x600+200+150" },
                new() { Hwnd = 0x004F09E0, Title = "KiCad 8.0 - ESP32-S3 IoT PCB", ProcessName = "kicad.exe", IsOccluded = false, Bounds = "1600x1000+50+50" }
            },
            AccessibilityRoot = new AccessibilityTreeNode
            {
                ElementIndex = 0,
                Role = "Window",
                Name = "Visual Studio Code",
                Bounds = "0,0,1920,1080",
                Children = new List<AccessibilityTreeNode>
                {
                    new()
                    {
                        ElementIndex = 1,
                        Role = "MenuBar",
                        Name = "Application Menu",
                        Bounds = "0,0,1920,35",
                        Children = new()
                        {
                            new() { ElementIndex = 2, Role = "MenuItem", Name = "File", Bounds = "10,5,40,25" },
                            new() { ElementIndex = 3, Role = "MenuItem", Name = "Edit", Bounds = "55,5,40,25" },
                            new() { ElementIndex = 4, Role = "MenuItem", Name = "Terminal", Bounds = "100,5,60,25" }
                        }
                    },
                    new()
                    {
                        ElementIndex = 10,
                        Role = "EditorPane",
                        Name = "src/main.rs - Rust",
                        Bounds = "280,35,1640,1000",
                        Value = "fn main() { superagent_core_daemon::boot(); }",
                        Children = new()
                        {
                            new() { ElementIndex = 11, Role = "Button", Name = "Run Tests", Bounds = "1400,45,100,30" },
                            new() { ElementIndex = 12, Role = "Button", Name = "Debug Crate", Bounds = "1510,45,110,30" }
                        }
                    }
                }
            },
            TrajectoryPoints = new List<MouseTrajectoryPoint>
            {
                new() { X = 120, Y = 100, VelocityPixelsPerSec = 0, TimestampMs = 100, Action = "start" },
                new() { X = 250, Y = 280, VelocityPixelsPerSec = 450, TimestampMs = 250, Action = "move" },
                new() { X = 600, Y = 500, VelocityPixelsPerSec = 820, TimestampMs = 400, Action = "move" },
                new() { X = 1450, Y = 55, VelocityPixelsPerSec = 1100, TimestampMs = 600, Action = "move" },
                new() { X = 1450, Y = 55, VelocityPixelsPerSec = 30, TimestampMs = 750, Action = "settle" },
                new() { X = 1450, Y = 55, VelocityPixelsPerSec = 0, TimestampMs = 800, Action = "click" }
            },
            SettlingRemainingMs = 0,
            SettlingTotalMs = 800,
            IsSettled = true
        };
    }

    public static BrowserLeasingState GetBrowserLeasingDemo()
    {
        return new BrowserLeasingState
        {
            ActiveTabs = new List<BrowserLeaseTab>
            {
                new()
                {
                    Id = "tab-claim-01",
                    Tier = "claimExistingTab",
                    Title = "AWS Console - ECS Tasks",
                    Url = "https://us-east-1.console.aws.amazon.com/ecs/home",
                    RemainingSeconds = 142,
                    TotalSeconds = 300,
                    Status = "leased",
                    HasDomBadge = true,
                    DomBadgeText = "SuperAgent Leased [Session #8F2]"
                },
                new()
                {
                    Id = "tab-create-02",
                    Tier = "createTab",
                    Title = "Stripe Billing Dashboard Sandbox",
                    Url = "https://dashboard.stripe.com/test/apikeys",
                    RemainingSeconds = 285,
                    TotalSeconds = 300,
                    Status = "leased",
                    HasDomBadge = true,
                    DomBadgeText = "SuperAgent Bot Sandbox"
                }
            },
            Tools = new List<WebMcpTool>
            {
                new() { Name = "query_table", Description = "Extracts dynamic virtualized HTML tables to CSV/JSON format", SchemaSummary = "tableSelector: string, maxRows: int, format: string", CallCount = 24 },
                new() { Name = "fill_checkout_form", Description = "Populates multi-step checkout forms with simulated human jitter", SchemaSummary = "formSelector: string, fields: Record<string, string>, submit: bool", CallCount = 12 },
                new() { Name = "download_csv", Description = "Streams in-page blob and table data directly to disk without dialogs", SchemaSummary = "sourceUrl: string, destinationFilename: string", CallCount = 8 },
                new() { Name = "clickDomButton", Description = "Synthesizes native mouse event chain with coordinates", SchemaSummary = "elementIndex: int, xpath: string", CallCount = 38 }
            },
            CdpEvents = new List<CdpStreamEvent>
            {
                new() { Method = "Page.navigate", Direction = "SEND", PayloadSummary = "{\"url\":\"https://dashboard.stripe.com/test/apikeys\"}" },
                new() { Method = "Page.loadEventFired", Direction = "RECV", PayloadSummary = "{\"timestamp\":1718293021.4}" },
                new() { Method = "Runtime.evaluate", Direction = "SEND", PayloadSummary = "{\"expression\":\"document.querySelector('.auth-pill').textContent\"}" },
                new() { Method = "Runtime.evaluateResponse", Direction = "RECV", PayloadSummary = "{\"result\":{\"type\":\"string\",\"value\":\"Authenticated: Admin\"}}", IsHighlighted = true },
                new() { Method = "DOM.highlightNode", Direction = "SEND", PayloadSummary = "{\"nodeId\":441,\"highlightConfig\":{\"borderColor\":{\"r\":99,\"g\":102,\"b\":241}}}" }
            }
        };
    }

    public static SecurityGuardianState GetSecurityGuardianDemo()
    {
        var allBadges = new List<ZoSecurityDecisionBadge>
        {
            new() { StateCode = 0, Label = "approval_cancelled", WireCode = "zo.approval_cancelled", Severity = "warning", DecisionSource = "approval", Retryable = true, ColorHex = "#F59E0B", Rationale = "Action approval was cancelled by the user in the confirmation modal." },
            new() { StateCode = 1, Label = "guardian_denied", WireCode = "zo.guardian_denied", Severity = "critical", DecisionSource = "guardian", Retryable = false, ColorHex = "#EF4444", Rationale = "CUALockScreenGuardian denied action execution because display session is locked (WTS_SESSION_LOCK)." },
            new() { StateCode = 2, Label = "enterprise_policy_blocked", WireCode = "zo.enterprise_policy_blocked", Severity = "critical", DecisionSource = "enterprise", Retryable = false, ColorHex = "#DC2626", Rationale = "The admin-enforced policy blocks this action; no user permission prompt was permitted." },
            new() { StateCode = 3, Label = "guardian_timed_out", WireCode = "zo.guardian_timed_out", Severity = "warning", DecisionSource = "guardian", Retryable = true, ColorHex = "#F59E0B", Rationale = "Screen Lock Guardian timed out awaiting display session stabilization. You may retry once." },
            new() { StateCode = 4, Label = "site_status_blocked", WireCode = "zo.site_status_blocked", Severity = "critical", DecisionSource = "site_status", Retryable = false, ColorHex = "#DC2626", Rationale = "Site-safety policy blocks this action; target is on untrusted domain quarantine list." },
            new() { StateCode = 5, Label = "user_declined", WireCode = "zo.user_declined", Severity = "critical", DecisionSource = "user_decision", Retryable = false, ColorHex = "#EF4444", Rationale = "The user explicitly declined permission for this proposed computer action." },
            new() { StateCode = 6, Label = "browser_capability_blocked", WireCode = "zo.browser_capability_blocked", Severity = "elevated", DecisionSource = "browser", Retryable = false, ColorHex = "#8B5CF6", Rationale = "Action requires browser capability that is disabled in current sandbox profile." },
            new() { StateCode = 7, Label = "persisted_user_denied", WireCode = "zo.persisted_user_denied", Severity = "critical", DecisionSource = "user_persisted_setting", Retryable = false, ColorHex = "#991B1B", Rationale = "Target origin is on persistent blocklist in LevelDB classic-level storage." },
            new() { StateCode = 8, Label = "financial_risk_intercept", WireCode = "zo.financial_risk_intercept", Severity = "elevated", DecisionSource = "guardian", Retryable = true, ColorHex = "#F59E0B", Rationale = "High-risk financial checkout or recurring payment submission intercepted for verification." },
            new() { StateCode = 9, Label = "credential_frame_mismatch", WireCode = "zo.credential_frame_mismatch", Severity = "critical", DecisionSource = "browser", Retryable = false, ColorHex = "#EF4444", Rationale = "Cross-origin iframe credential mismatch detected: top_level_origin != credential_frame_origin." },
            new() { StateCode = 10, Label = "shell_execution_sandbox", WireCode = "zo.shell_execution_sandbox", Severity = "elevated", DecisionSource = "enterprise", Retryable = true, ColorHex = "#06B6D4", Rationale = "Arbitrary shell invocation gated by strict runtime sandbox validation." },
            new() { StateCode = 11, Label = "clipboard_leak_blocked", WireCode = "zo.clipboard_leak_blocked", Severity = "safe", DecisionSource = "guardian", Retryable = true, ColorHex = "#10B981", Rationale = "Clipboard inspection verified zero credentials or prompt tokens leaked." },
            new() { StateCode = 12, Label = "in_dom_injection_intercept", WireCode = "zo.in_dom_injection_intercept", Severity = "safe", DecisionSource = "browser", Retryable = true, ColorHex = "#10B981", Rationale = "WebMCP in-page DOM manipulation verified against sanitization rules." },
            new() { StateCode = 13, Label = "untrusted_origin_quarantine", WireCode = "zo.untrusted_origin_quarantine", Severity = "warning", DecisionSource = "site_status", Retryable = true, ColorHex = "#F59E0B", Rationale = "Non-HTTPS target routed through isolated disposable sandbox profile." },
            new() { StateCode = 14, Label = "wts_session_locked", WireCode = "zo.wts_session_locked", Severity = "critical", DecisionSource = "guardian", Retryable = false, ColorHex = "#EF4444", Rationale = "WTS_SESSION_LOCK detected: input queue immediately paused and purged." },
            new() { StateCode = 15, Label = "manual_handoff_requested", WireCode = "zo.manual_handoff_requested", Severity = "elevated", DecisionSource = "approval", Retryable = true, ColorHex = "#7C3AED", Rationale = "Human interaction required: CAPTCHA / biometric MFA challenge encountered." }
        };

        var branches = new List<CredentialRecoveryBranch>
        {
            new() { BranchId = 1, ActionIdentifier = "retry_after_credential_delivery", ActionName = "Retry After Credential Delivery", ProtocolSummary = "Secure input overlay / 1Password / Bitwarden vault token injection", RiskRating = "Standard", RiskColor = "#06B6D4" },
            new() { BranchId = 2, ActionIdentifier = "navigate_to_new_document", ActionName = "Navigate To Alternate Address", ProtocolSummary = "Target auth page unresponsive or infinite redirect loop bypass", RiskRating = "Standard", RiskColor = "#06B6D4" },
            new() { BranchId = 3, ActionIdentifier = "create_new_tab", ActionName = "Open In Fresh Tab", ProtocolSummary = "Purge corrupted cookies & storage state in isolated new tab session", RiskRating = "Safe", RiskColor = "#10B981" },
            new() { BranchId = 4, ActionIdentifier = "request_manual_handoff", ActionName = "Take Over Manual Control", ProtocolSummary = "Mandatory user takeover for password change, banking MFA, or CAPTCHA", RiskRating = "Safe", RiskColor = "#10B981" },
            new() { BranchId = 5, ActionIdentifier = "restart_browser_runtime", ActionName = "Restart Browser Engine", ProtocolSummary = "CDP pipe crash or memory threshold (>1.8GB) recycle", RiskRating = "Elevated", RiskColor = "#F59E0B" },
            new() { BranchId = 6, ActionIdentifier = "retry_after_resolution", ActionName = "Resume Automated Task", ProtocolSummary = "Post-biometric / WebAuthn token confirmation resumption", RiskRating = "Safe", RiskColor = "#10B981" },
            new() { BranchId = 7, ActionIdentifier = "stop", ActionName = "Cancel Task (Emergency Halt)", ProtocolSummary = "Emergency termination of CUA loop, revoking all active tab leases", RiskRating = "Critical", RiskColor = "#EF4444" }
        };

        return new SecurityGuardianState
        {
            ActiveTier = SecurityTierLevel.PreApproval,
            IsLockScreenArmed = true,
            ShieldStatus = "WTS_SESSION_ACTIVE • CUALockScreenGuardian Armed (Zero Leaks)",
            TopLevelOrigin = "https://store.target-vendor.com",
            CredentialFrameOrigin = "https://auth.login-service.net/oauth/v2",
            FormSubmissionOrigin = "https://store.target-vendor.com/checkout/submit",
            ActiveDecision = allBadges[1], // guardian_denied
            AllBadges = allBadges,
            RecoveryBranches = branches
        };
    }

    public static ReplConsoleState GetReplConsoleDemo()
    {
        var lines = new List<ReplLogLine>
        {
            new() { LineIndex = 1, Text = "SuperAgent QuickJS REPL v2024-01-13 [Node.js v20.18 / QuickJS Native Engine]", ColorHex = "#8B5CF6", IsAnsiPrompt = false, ApproxTokens = 14 },
            new() { LineIndex = 2, Text = "[Security] Hardware Scrypt Memory Isolation Active | WTS_SESSION_ACTIVE Armed", ColorHex = "#10B981", IsAnsiPrompt = false, ApproxTokens = 12 },
            new() { LineIndex = 3, Text = "Context buffer virtualizer initialized. Token budget: 3,840 / 25,000 tokens.", ColorHex = "#94A3B8", IsAnsiPrompt = false, ApproxTokens = 12 },
            new() { LineIndex = 4, Text = "> const sky = await SkyRuntime.attach();", ColorHex = "#06B6D4", IsAnsiPrompt = true, ApproxTokens = 8 },
            new() { LineIndex = 5, Text = "SkyRuntime attached. Windows Graphics Capture (WGC) DirectX11 pipeline ready.", ColorHex = "#10B981", ApproxTokens = 12 },
            new() { LineIndex = 6, Text = "> const cua = await CUAOrchestrator.init({ securityMode: 3, lockWatchdog: true });", ColorHex = "#06B6D4", IsAnsiPrompt = true, ApproxTokens = 16 },
            new() { LineIndex = 7, Text = "CUAOrchestrator initialized. Mode 3: Pre-Approval Allowed. CUALockScreenGuardian armed.", ColorHex = "#10B981", ApproxTokens = 14 },
            new() { LineIndex = 8, Text = "> const activeTabs = await cua.listClaimedTabs();", ColorHex = "#06B6D4", IsAnsiPrompt = true, ApproxTokens = 10 },
            new() { LineIndex = 9, Text = "[ '@tab-v1-finance', '@tab-v2-docs', '@tab-v3-dev' ] (3 active CDP sessions)", ColorHex = "#F8FAFC", ApproxTokens = 15 },
            new() { LineIndex = 10, Text = "> cua.verifyIframeSecurity('https://store.target-vendor.com');", ColorHex = "#06B6D4", IsAnsiPrompt = true, ApproxTokens = 11 },
            new() { LineIndex = 11, Text = "⚠️ [zo-09: credential_frame_mismatch] top_level_origin != credential_frame_origin", ColorHex = "#F59E0B", ApproxTokens = 12 },
            new() { LineIndex = 12, Text = "Autofill blocked. Cross-origin OAuth iframe requires explicit certificate fingerprint validation.", ColorHex = "#EF4444", ApproxTokens = 16 }
        };

        var vars = new List<ReplVariableNode>
        {
            new()
            {
                Name = "sky",
                Type = "Object",
                Value = "SkyDesktopRuntime { pid: 4812, displays: 1, engine: \"DirectX11/WGC\" }",
                Memory = "4.8 KB",
                TypeColor = "#06B6D4",
                Children = new()
                {
                    new() { Name = "activeWindow", Type = "string", Value = "\"SuperAgent.sln - Visual Studio\"", Memory = "0.8 KB", TypeColor = "#F59E0B" },
                    new() { Name = "displayResolution", Type = "string", Value = "\"2560x1440 @ 144Hz\"", Memory = "0.4 KB", TypeColor = "#F59E0B" },
                    new() { Name = "wgcCaptureEngine", Type = "string", Value = "\"DirectX11 (Hardware Occluded)\"", Memory = "1.2 KB", TypeColor = "#F59E0B" },
                    new() { Name = "adaptiveSettlingMs", Type = "number", Value = "1000", Memory = "0.2 KB", TypeColor = "#38BDF8" }
                }
            },
            new()
            {
                Name = "cua",
                Type = "Object",
                Value = "CUAOrchestrator { state: \"Idle\", tabs: 3, guardian: \"Armed\" }",
                Memory = "18.2 KB",
                TypeColor = "#06B6D4",
                Children = new()
                {
                    new() { Name = "securityTier", Type = "string", Value = "\"PreApproval (Mode 3)\"", Memory = "0.6 KB", TypeColor = "#F59E0B" },
                    new() { Name = "lockScreenGuardian", Type = "string", Value = "\"WTS_SESSION_ACTIVE (Armed)\"", Memory = "0.5 KB", TypeColor = "#F59E0B" },
                    new() { Name = "activeClaimedTab", Type = "string", Value = "\"@tab-v1-finance\"", Memory = "0.4 KB", TypeColor = "#F59E0B" },
                    new() { Name = "tokenBudget", Type = "string", Value = "\"3,840 / 25,000\"", Memory = "0.3 KB", TypeColor = "#F59E0B" }
                }
            },
            new()
            {
                Name = "targetWindow",
                Type = "Object",
                Value = "WindowTargetItem { title: \"SuperAgent.sln\", hWnd: 0x0014028A }",
                Memory = "2.1 KB",
                TypeColor = "#06B6D4",
                Children = new()
                {
                    new() { Name = "processName", Type = "string", Value = "\"devenv.exe\"", Memory = "0.3 KB", TypeColor = "#F59E0B" },
                    new() { Name = "bounds", Type = "string", Value = "\"Rect(x:0, y:0, w:1920, h:1040)\"", Memory = "0.4 KB", TypeColor = "#F59E0B" },
                    new() { Name = "isOccluded", Type = "boolean", Value = "false", Memory = "0.1 KB", TypeColor = "#EC4899" }
                }
            },
            new()
            {
                Name = "activeTabs",
                Type = "Array",
                Value = "BrowserTab[3] [ @tab-v1-finance, @tab-v2-docs, @tab-v3-dev ]",
                Memory = "9.6 KB",
                TypeColor = "#8B5CF6",
                Children = new()
                {
                    new() { Name = "[0]", Type = "string", Value = "\"https://store.target-vendor.com/checkout (Foreground)\"", Memory = "1.8 KB", TypeColor = "#F59E0B" },
                    new() { Name = "[1]", Type = "string", Value = "\"https://auth.login-service.net/oauth/v2 (Claimed)\"", Memory = "1.4 KB", TypeColor = "#F59E0B" },
                    new() { Name = "[2]", Type = "string", Value = "\"http://localhost:1469/docs (Background)\"", Memory = "1.1 KB", TypeColor = "#F59E0B" }
                }
            },
            new()
            {
                Name = "requestManualHandoff",
                Type = "Function",
                Value = "async function(reason: string) -> Promise<void>",
                Memory = "0.4 KB",
                TypeColor = "#10B981",
                Children = new()
                {
                    new() { Name = "length", Type = "number", Value = "1", Memory = "0.1 KB", TypeColor = "#38BDF8" },
                    new() { Name = "name", Type = "string", Value = "\"requestManualHandoff\"", Memory = "0.2 KB", TypeColor = "#F59E0B" }
                }
            }
        };

        return new ReplConsoleState
        {
            TotalTokens = 3840,
            MaxBufferTokens = 25000,
            IsResetPending = false,
            EngineVersion = "QuickJS v2024-01-13 | Active",
            Lines = lines,
            ScopeVariables = vars
        };
    }

    public static CompanionState GetCompanionDemo()
    {
        return new CompanionState
        {
            CompanionName = "Aiko-chan (SuperAgent VRM Partner)",
            VrmModelPath = "packages/ui/models/companion_vrm_v2.vrm",
            ActiveMood = "Joy",
            IntimacyLevel = 89,
            BatteryLevel = 94,
            IsFloatingPetActive = false,
            Visemes = new List<VisemeMetric>
            {
                new() { Viseme = "aa", Weight = 0.85, DbLevel = -12.4 },
                new() { Viseme = "ih", Weight = 0.15, DbLevel = -18.2 },
                new() { Viseme = "ou", Weight = 0.05, DbLevel = -24.0 },
                new() { Viseme = "ee", Weight = 0.40, DbLevel = -15.1 },
                new() { Viseme = "oh", Weight = 0.10, DbLevel = -22.5 }
            },
            Moods = new List<CompanionMoodBadge>
            {
                new() { Mood = "Joy", IconGlyph = "\xE76E", AccentHex = "#10B981", Description = "Happy and cheering on your code shipping!" },
                new() { Mood = "Thinking", IconGlyph = "\xE90F", AccentHex = "#8B5CF6", Description = "Deep in thought resolving architectural plans..." },
                new() { Mood = "Error", IconGlyph = "\xE783", AccentHex = "#EF4444", Description = "Uh oh! An execution error occurred." },
                new() { Mood = "Welcoming", IconGlyph = "\xE8BD", AccentHex = "#06B6D4", Description = "Good morning! Ready for today's engineering?" },
                new() { Mood = "Sleeping", IconGlyph = "\xE708", AccentHex = "#64748B", Description = "Dozing off... resting until the next prompt." }
            },
            PhotoPresets = new List<PhotoModePreset>
            {
                new() { Name = "Victory Cheering", Pose = "pose_cheering_arms_up", LightingPreset = "Neon Cyberpunk Sunset", LightingAngle = "45° Key / Rim Magenta", Resolution = "3840x2160 (4K UHD)" },
                new() { Name = "Desk Pair Programming", Pose = "pose_typing_keyboard", LightingPreset = "Cozy Midnight Lamp", LightingAngle = "90° Soft Overhead", Resolution = "3840x2160 (4K UHD)" },
                new() { Name = "Thinking Stance", Pose = "pose_hand_on_chin", LightingPreset = "Clean Studio Daylight", LightingAngle = "30° Front Fill", Resolution = "3840x2160 (4K UHD)" },
                new() { Name = "Holographic Stance", Pose = "pose_standing_confident", LightingPreset = "Cyan & Violet Aurora", LightingAngle = "Backlit 180° Rim", Resolution = "3840x2160 (4K UHD)" }
            }
        };
    }

    public static CreativeStudioState GetCreativeStudioDemo()
    {
        var images = new List<ImageItem>
        {
            new() { Id = "img-01", Prompt = "Cyberpunk anime female hacker in rain with neon visor, octane render 8k", AspectRatio = "16:9", Engine = "Flux.1 Dev", Seed = 9812401, Steps = 28, CfgScale = 6.5, PaletteName = "Cyberpunk Neon", PreviewHex = "#1E1B4B" },
            new() { Id = "img-02", Prompt = "Futuristic quantum compute laboratory schematic circuit board render", AspectRatio = "1:1", Engine = "SDXL", Seed = 1204891, Steps = 35, CfgScale = 7.0, PaletteName = "Teal & Obsidian", PreviewHex = "#042F2E" },
            new() { Id = "img-03", Prompt = "Minimalist sunset over digital mountain range, vaporwave grid", AspectRatio = "9:16", Engine = "Flux.1 Dev", Seed = 771249, Steps = 25, CfgScale = 5.0, PaletteName = "Sunset Horizon", PreviewHex = "#4C1D95" },
            new() { Id = "img-04", Prompt = "Isometric high-tech coffee shop with robotics barista in neo-Tokyo", AspectRatio = "4:3", Engine = "SDXL", Seed = 551928, Steps = 30, CfgScale = 8.0, PaletteName = "Pastel Dream", PreviewHex = "#831843" }
        };

        var video = new VideoItem
        {
            Id = "vid-01",
            Prompt = "FPV drone cinematic flythrough of a futuristic neon data center",
            EnhancedPrompt = "Ultra-smooth high speed FPV drone shot gliding between glowing rack servers, volumetric mist, anamorphic lens flare, photorealistic 8k 60fps",
            DurationSeconds = 6,
            Fps = 30,
            Resolution = "1080p",
            Engine = "Wan2.1-T2V-14B",
            HasFfmpeg = true
        };

        var palettes = new List<PalettePreset>
        {
            new() { Name = "Cyberpunk Neon", Colors = new() { "#06B6D4", "#8B5CF6", "#EC4899", "#3B82F6" }, Weight = 0.9 },
            new() { Name = "Sunset Horizon", Colors = new() { "#F59E0B", "#EF4444", "#7C3AED", "#1E1B4B" }, Weight = 0.8 },
            new() { Name = "Teal & Obsidian", Colors = new() { "#0D9488", "#111827", "#14B8A6", "#374151" }, Weight = 0.85 },
            new() { Name = "Monochrome Noir", Colors = new() { "#090D16", "#334155", "#94A3B8", "#F8FAFC" }, Weight = 0.7 }
        };

        return new CreativeStudioState
        {
            ActiveImage = images[0],
            Filmstrip = images,
            ActiveVideo = video,
            VideoQueue = new List<VideoItem> { video },
            Palettes = palettes,
            Watermark = new WatermarkConfig()
        };
    }

    public static PcbEcadState GetPcbEcadDemo()
    {
        return new PcbEcadState
        {
            ProjectName = "ESP32-S3 IoT Weather & Environment Node",
            Components = new List<PcbComponent>
            {
                new() { Designator = "U1", Mpn = "ESP32-S3-WROOM-1-N16R8", LcscId = "C2913204", Footprint = "RF_Module:ESP32-S3-WROOM-1", X = 50, Y = 50, RotationDeg = 0 },
                new() { Designator = "U2", Mpn = "AMS1117-3.3", LcscId = "C6186", Footprint = "Package_TO_SOT_SMD:SOT-223-3_TabPin2", X = 25, Y = 30, RotationDeg = 90 },
                new() { Designator = "J1", Mpn = "TYPE-C-16PIN-2P", LcscId = "C165948", Footprint = "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12", X = 15, Y = 50, RotationDeg = 0 },
                new() { Designator = "U3", Mpn = "BME280", LcscId = "C92489", Footprint = "Sensor:BOSCH_LGA-8_2.5x2.5mm", X = 80, Y = 70, RotationDeg = 0 },
                new() { Designator = "C1", Mpn = "10uF 0805", LcscId = "C15849", Footprint = "Capacitor_SMD:C_0805_2012Metric", X = 22, Y = 25, RotationDeg = 0 },
                new() { Designator = "C2", Mpn = "100nF 0402", LcscId = "C1525", Footprint = "Capacitor_SMD:C_0402_1005Metric", X = 45, Y = 40, RotationDeg = 0 }
            },
            Nets = new List<PcbNetWire>
            {
                new() { NetName = "VBUS_5V", FromNode = "J1.VBUS", ToNode = "U2.VIN" },
                new() { NetName = "+3V3", FromNode = "U2.VOUT", ToNode = "U1.3V3" },
                new() { NetName = "+3V3", FromNode = "U1.3V3", ToNode = "U3.VDD" },
                new() { NetName = "GND", FromNode = "J1.GND", ToNode = "U2.GND" },
                new() { NetName = "I2C_SDA", FromNode = "U1.IO4", ToNode = "U3.SDA" },
                new() { NetName = "I2C_SCL", FromNode = "U1.IO5", ToNode = "U3.SCL" }
            },
            ErcViolations = new List<ErcRuleViolation>
            {
                new() { RuleId = "ERC_PIN_NOT_DRIVEN", Severity = "Error", Message = "Pin U1.IO14 (JTAG_TMS) configured as input but has no driving net or pull-down.", Component = "U1 (ESP32-S3)" },
                new() { RuleId = "missing_pullup", Severity = "Warning", Message = "I2C SDA/SCL lines missing 4.7k pull-up resistors to +3V3 rail.", Component = "U3 (BME280)" },
                new() { RuleId = "missing_decoupling", Severity = "Advisory", Message = "Add a 100nF decoupling capacitor close to pin VDDIO of U3.", Component = "U3 (BME280)" }
            },
            Layers = new List<PcbLayer>
            {
                new() { Name = "F.Cu (Top Copper)", ColorHex = "#EF4444", IsVisible = true },
                new() { Name = "B.Cu (Bottom Copper)", ColorHex = "#3B82F6", IsVisible = true },
                new() { Name = "F.SilkS (Top Silk)", ColorHex = "#F8FAFC", IsVisible = true },
                new() { Name = "F.Mask (Solder Mask)", ColorHex = "#10B981", IsVisible = true },
                new() { Name = "Edge.Cuts (Board Outline)", ColorHex = "#EAB308", IsVisible = true }
            },
            AiCopilotHistory = new List<string>
            {
                "User: Add an ESP32-S3 microcontroller with USB-C 5V power, an AMS1117-3.3V LDO regulator, and a BME280 sensor on I2C.",
                "Copilot: Scaffolded 6 components (U1, U2, J1, U3, C1, C2) with LCSC part IDs and wired standard power rails + I2C nets. Notice: Run ERC checker to inspect recommended pullups."
            }
        };
    }

    public static TasksState GetTasksDemo()
    {
        return new TasksState
        {
            Cards = new List<KanbanCard>
            {
                new() { Column = "ToDo", Title = "Implement WinUI 3 Navigation View", Description = "Add navigation items for 10 workspace stages with acrylic backdrop.", Priority = "High", AssignedPersona = "Windows Specialist", DueDate = "Today", EstimatedTokens = "14.2k tok", Tag = "WinUI 3 / Mica" },
                new() { Column = "ToDo", Title = "Verify KiCad 9 S-Expression Export", Description = "Ensure pcb_ops produces valid .kicad_sch and .kicad_pcb syntaxes.", Priority = "Medium", AssignedPersona = "Hardware Co-Pilot", DueDate = "Tomorrow", EstimatedTokens = "8.5k tok", Tag = "Hardware ECAD" },
                new() { Column = "InProgress", Title = "WGC Occluded Window Capture Canvas", Description = "Implement real-time bounding box settling indicator in Computer Use.", Priority = "Critical", AssignedPersona = "Core Daemon", DueDate = "Active", EstimatedTokens = "32.0k tok", Tag = "Direct3D11 / WGC" },
                new() { Column = "BlockedReview", Title = "Browser Tab Lease Revocation Handshake", Description = "Awaiting user approval for high-risk credit card autofill permission.", Priority = "High", AssignedPersona = "Security Guardian", DueDate = "Paused", EstimatedTokens = "18.5k tok", Tag = "CDP / Browser" },
                new() { Column = "Done", Title = "scrypt AuthStore Constant-Time Validation", Description = "Hardened core_v2 daemon authentication against timing attacks.", Priority = "High", AssignedPersona = "Security Guardian", DueDate = "Yesterday", EstimatedTokens = "6.8k tok", Tag = "Security Guardian" },
                new() { Column = "Done", Title = "Virtualize 25,000-token REPL Console", Description = "Optimized log viewer with ANSI stripping and memory recycle.", Priority = "Medium", AssignedPersona = "Code Janitor", DueDate = "2 days ago", EstimatedTokens = "4.1k tok", Tag = "QuickJS / REPL" }
            },
            Routines = new List<CronRoutine>
            {
                new()
                {
                    Name = "Daily Morning Dependency Scan",
                    PromptTemplate = "Inspect cargo audit and npm audit across all workspaces and report CVEs.",
                    CronExpression = "0 9 * * 1-5",
                    PresetName = "Weekdays at 9 AM",
                    NotifyTelegram = true,
                    TelegramChatId = "@superagent_ci",
                    WebhookUrl = "http://localhost:1469/api/triggers/webhook/sec-token-77",
                    IsEnabled = true
                },
                new()
                {
                    Name = "Hourly Workspace Lock Health Check",
                    PromptTemplate = "Check ~/.superagent/web-server.lock and prune stale PID locks.",
                    CronExpression = "0 * * * *",
                    PresetName = "Hourly",
                    NotifyTelegram = false,
                    TelegramChatId = "",
                    WebhookUrl = "http://localhost:1469/api/triggers/webhook/lock-check",
                    IsEnabled = true
                }
            }
        };
    }

    public static SettingsCatalogState GetSettingsCatalogDemo()
    {
        var modules = new List<SettingsModule>
        {
            new() { Id = "general", Category = "System", Name = "General & Appearance", Description = "Dark/Light themes, audio cues, font sizes, language", IconGlyph = "\xE713", StatusSummary = "Dark (Cyberpunk)" },
            new() { Id = "providers", Category = "Intelligence", Name = "Model Providers", Description = "OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter", IconGlyph = "\xE90F", StatusSummary = "4 Keys Active" },
            new() { Id = "local_models", Category = "Intelligence", Name = "Local Models (Ollama)", Description = "Offline LLM inference endpoints and model puller", IconGlyph = "\xE7B8", StatusSummary = "Ollama Connected" },
            new() { Id = "local_images", Category = "Intelligence", Name = "Local Image Models", Description = "ComfyUI, Stable Diffusion WebUI, Flux VRAM allocator", IconGlyph = "\xEB9F", StatusSummary = "Ready" },
            new() { Id = "local_videos", Category = "Intelligence", Name = "Local Video Models", Description = "Wan2.1, HunyuanVideo local model checkpoints", IconGlyph = "\xE714", StatusSummary = "Standby" },
            new() { Id = "mcp", Category = "Integrations", Name = "MCP Server Catalog", Description = "Model Context Protocol servers (stdio and SSE)", IconGlyph = "\xE774", StatusSummary = "6 Servers Running" },
            new() { Id = "usage", Category = "System", Name = "Usage & Cost Tracker", Description = "Token consumption bar charts and billing estimator", IconGlyph = "\xE9D2", StatusSummary = "$3.42 This Month" },
            new() { Id = "memory", Category = "Intelligence", Name = "Memory & Context Engine", Description = "User profile KV store, learned insights, AGENTS.md rules", IconGlyph = "\xE8F1", StatusSummary = "128 Insights Active" },
            new() { Id = "voice", Category = "Voice", Name = "Voice & Speech Studio", Description = "Whisper STT, phonetic corrections, ElevenLabs TTS", IconGlyph = "\xE720", StatusSummary = "Whisper Base Local" },
            new() { Id = "telegram", Category = "Integrations", Name = "Telegram Bot Bridge", Description = "Remote chat prompts, audio transcription, image delivery", IconGlyph = "\xE8BD", StatusSummary = "Bot Connected" },
            new() { Id = "computer_use", Category = "Automation", Name = "Desktop Automation", Description = "Mouse trajectory, keyboard emulation, safety settling delays", IconGlyph = "\xE7F4", StatusSummary = "Enabled (800ms delay)" },
            new() { Id = "browser_use", Category = "Automation", Name = "Browser Automation", Description = "Two-tier tab leasing, headless mode, stealth CDP", IconGlyph = "\xE774", StatusSummary = "Active" },
            new() { Id = "web_hosting", Category = "System", Name = "Web App Hosting", Description = "Axum HTTP daemon, port 1469, LAN QR code pairing", IconGlyph = "\xE753", StatusSummary = "Running (:1469)" },
            new() { Id = "threed", Category = "Creative", Name = "3D Studio Settings", Description = "Mesh retopology engine, PBR texture resolution, graphics tier", IconGlyph = "\xEC15", StatusSummary = "High Quality" },
            new() { Id = "artifacts", Category = "Automation", Name = "Artifacts Sandboxing", Description = "Isolated web sandboxes, auto-assigned port range 3000-3999", IconGlyph = "\xE74C", StatusSummary = "Sandboxed" },
            new() { Id = "storage", Category = "System", Name = "Storage & Database", Description = "Workspace root (~/.superagent), cache cleanup, export", IconGlyph = "\xE7B8", StatusSummary = "4.2 GB Clean" },
            new() { Id = "updates", Category = "System", Name = "Software Updates", Description = "Version channels, GitHub Releases changelog, auto-updater", IconGlyph = "\xE777", StatusSummary = "v2.0.0 (Latest)" },
            new() { Id = "doctor", Category = "System", Name = "System Doctor", Description = "Environment readiness, GPU VRAM, network binding diagnostic", IconGlyph = "\xE890", StatusSummary = "All Checks Passed" },
            new() { Id = "security_guardian", Category = "Security", Name = "Security Guardian Shield", Description = "zo 16-state policy, LockScreen timeout, credential vault", IconGlyph = "\xEA18", StatusSummary = "Armed" },
            new() { Id = "pcb_rules", Category = "Hardware", Name = "PCB Design Rules (DRC/ERC)", Description = "Electrical rules clearance, trace widths, decoupling checks", IconGlyph = "\xE90F", StatusSummary = "Strict Standard" },
            new() { Id = "companion_pet", Category = "Companion", Name = "Companion Preferences", Description = "3D avatar model selection, lip-sync sensitivity, mood journal", IconGlyph = "\xE76E", StatusSummary = "Aiko-chan Active" },
            new() { Id = "routines_cron", Category = "Automation", Name = "Cron & Webhook Routines", Description = "Scheduled automations, webhook secrets, retry policies", IconGlyph = "\xE823", StatusSummary = "2 Routines Enabled" },
            new() { Id = "repl_terminal", Category = "System", Name = "REPL Console Engine", Description = "25k token virtual buffer, ANSI color palette, QuickJS engine", IconGlyph = "\xE756", StatusSummary = "Buffer 25k Ready" },
            new() { Id = "keyboard_shortcuts", Category = "System", Name = "Keyboard Shortcuts", Description = "Customizable hotkeys for circle search, composer, and lock", IconGlyph = "\xE765", StatusSummary = "Ctrl+Shift+S Active" }
        };

        var diagnostics = new List<SystemDoctorDiagnostic>
        {
            new() { Component = "NVIDIA CUDA / GPU VRAM", Status = "Healthy", Details = "NVIDIA GeForce RTX 4090 (24,564 MB Dedicated VRAM, CUDA 12.6)", IsPassed = true },
            new() { Component = "Direct3D11 / WGC Screen Capture", Status = "Healthy", Details = "Feature level 12_1 - WGC compositor zero-flicker frame pool operational", IsPassed = true },
            new() { Component = "FFmpeg Video Binary Path", Status = "Healthy", Details = "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe (v7.1 nvenc, libx264)", IsPassed = true },
            new() { Component = "Daemon Loopback Port (:1469)", Status = "Healthy", Details = "127.0.0.1:1469 bound successfully (TCP/IPv4 Axum WebSocket & JSON-RPC)", IsPassed = true },
            new() { Component = "Rust Compiler (rustc)", Status = "Healthy", Details = "rustc 1.83.0 (stable MSVC) with clippy and rustfmt", IsPassed = true },
            new() { Component = "Node.js Runtime", Status = "Healthy", Details = "Node.js v20.18.0 detected in PATH", IsPassed = true },
            new() { Component = "Git Version Control", Status = "Healthy", Details = "git version 2.47.0.windows.1", IsPassed = true },
            new() { Component = "Primary NVMe Storage Disk", Status = "Healthy", Details = "412 GB free of 1,000 GB on volume C:\\", IsPassed = true }
        };

        return new SettingsCatalogState
        {
            Modules = modules,
            Diagnostics = diagnostics
        };
    }
}

#endregion
