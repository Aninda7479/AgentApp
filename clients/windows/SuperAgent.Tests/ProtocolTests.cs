// ProtocolTests.cs - SuperAgent Windows Tests
// Unit test suite verifying roundtrip wire serialization and deserialization
// matching packages/core_v2/src/protocol/.

using System;
using System.Collections.Generic;
using System.Text.Json;
using SuperAgent.Core;
using Xunit;

namespace SuperAgent.Tests;

public class ProtocolTests
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    [Fact]
    public void TestStartTurnEvent_Serialization()
    {
        var ev = new StartTurnEvent
        {
            SessionId = "sess-1",
            Model = "claude-3-7-sonnet"
        };

        var json = JsonSerializer.Serialize<AgentStreamEvent>(ev, JsonOptions);
        Assert.Contains("\"type\":\"start_turn\"", json);
        Assert.Contains("\"sessionId\":\"sess-1\"", json);
        Assert.Contains("\"model\":\"claude-3-7-sonnet\"", json);

        var deserialized = JsonSerializer.Deserialize<AgentStreamEvent>(json, JsonOptions);
        Assert.IsType<StartTurnEvent>(deserialized);
        var turn = (StartTurnEvent)deserialized;
        Assert.Equal("sess-1", turn.SessionId);
        Assert.Equal("claude-3-7-sonnet", turn.Model);
    }

    [Fact]
    public void TestTokenEvent_Serialization()
    {
        var ev = new TokenEvent
        {
            SessionId = "sess-123",
            Content = "Hello world"
        };

        var json = JsonSerializer.Serialize<AgentStreamEvent>(ev, JsonOptions);
        Assert.Contains("\"type\":\"token\"", json);
        Assert.Contains("\"sessionId\":\"sess-123\"", json);
        Assert.Contains("\"content\":\"Hello world\"", json);

        var deserialized = JsonSerializer.Deserialize<AgentStreamEvent>(json, JsonOptions);
        Assert.IsType<TokenEvent>(deserialized);
        var tok = (TokenEvent)deserialized;
        Assert.Equal("sess-123", tok.SessionId);
        Assert.Equal("Hello world", tok.Content);
    }

    [Fact]
    public void TestThoughtEvent_Serialization()
    {
        var ev = new ThoughtEvent
        {
            SessionId = "sess-456",
            Content = "Analyzing the codebase..."
        };

        var json = JsonSerializer.Serialize<AgentStreamEvent>(ev, JsonOptions);
        Assert.Contains("\"type\":\"thought\"", json);
        Assert.Contains("\"sessionId\":\"sess-456\"", json);
        Assert.Contains("\"content\":\"Analyzing the codebase...\"", json);

        var deserialized = JsonSerializer.Deserialize<AgentStreamEvent>(json, JsonOptions);
        Assert.IsType<ThoughtEvent>(deserialized);
        var thought = (ThoughtEvent)deserialized;
        Assert.Equal("sess-456", thought.SessionId);
        Assert.Equal("Analyzing the codebase...", thought.Content);
    }

    [Fact]
    public void TestToolCallEvent_Serialization()
    {
        using var doc = JsonDocument.Parse("{\"path\":\"test.txt\",\"flags\":42}");
        var ev = new ToolCallEvent
        {
            SessionId = "s-tool",
            ToolCallId = "call-99",
            ToolName = "file_read",
            ToolArgs = doc.RootElement.Clone()
        };

        var json = JsonSerializer.Serialize<AgentStreamEvent>(ev, JsonOptions);
        Assert.Contains("\"type\":\"tool_call\"", json);
        Assert.Contains("\"toolCallId\":\"call-99\"", json);
        Assert.Contains("\"toolName\":\"file_read\"", json);

        var deserialized = JsonSerializer.Deserialize<AgentStreamEvent>(json, JsonOptions);
        Assert.IsType<ToolCallEvent>(deserialized);
        var tc = (ToolCallEvent)deserialized;
        Assert.Equal("s-tool", tc.SessionId);
        Assert.Equal("call-99", tc.ToolCallId);
        Assert.Equal("file_read", tc.ToolName);
        Assert.Equal("test.txt", tc.ToolArgs.GetProperty("path").GetString());
    }

    [Fact]
    public void TestToolResultEvent_Serialization()
    {
        using var doc = JsonDocument.Parse("\"file contents here\"");
        var ev = new ToolResultEvent
        {
            SessionId = "s-tool",
            ToolCallId = "call-99",
            ToolResult = doc.RootElement.Clone(),
            IsError = false
        };

        var json = JsonSerializer.Serialize<AgentStreamEvent>(ev, JsonOptions);
        Assert.Contains("\"type\":\"tool_result\"", json);
        Assert.Contains("\"toolCallId\":\"call-99\"", json);
        Assert.Contains("\"isError\":false", json);

        var deserialized = JsonSerializer.Deserialize<AgentStreamEvent>(json, JsonOptions);
        Assert.IsType<ToolResultEvent>(deserialized);
        var tr = (ToolResultEvent)deserialized;
        Assert.Equal("call-99", tr.ToolCallId);
        Assert.False(tr.IsError);
        Assert.Equal("file contents here", tr.ToolResult.GetString());
    }

    [Fact]
    public void TestStepCompleteEvent_Serialization()
    {
        var ev = new StepCompleteEvent
        {
            SessionId = "step-sess",
            StepIndex = 3
        };

        var json = JsonSerializer.Serialize<AgentStreamEvent>(ev, JsonOptions);
        Assert.Contains("\"type\":\"step_complete\"", json);
        Assert.Contains("\"stepIndex\":3", json);

        var deserialized = JsonSerializer.Deserialize<AgentStreamEvent>(json, JsonOptions);
        Assert.IsType<StepCompleteEvent>(deserialized);
        var sc = (StepCompleteEvent)deserialized;
        Assert.Equal(3, sc.StepIndex);
    }

    [Fact]
    public void TestDoneEvent_Serialization()
    {
        var ev = new DoneEvent
        {
            SessionId = "done-sess",
            StopReason = "end_turn"
        };

        var json = JsonSerializer.Serialize<AgentStreamEvent>(ev, JsonOptions);
        Assert.Contains("\"type\":\"done\"", json);
        Assert.Contains("\"stopReason\":\"end_turn\"", json);

        var deserialized = JsonSerializer.Deserialize<AgentStreamEvent>(json, JsonOptions);
        Assert.IsType<DoneEvent>(deserialized);
        var done = (DoneEvent)deserialized;
        Assert.Equal("end_turn", done.StopReason);
    }

    [Fact]
    public void TestErrorEvent_Serialization()
    {
        var ev = new ErrorEvent
        {
            SessionId = "err-sess",
            Error = "Rate limit reached"
        };

        var json = JsonSerializer.Serialize<AgentStreamEvent>(ev, JsonOptions);
        Assert.Contains("\"type\":\"error\"", json);
        Assert.Contains("\"error\":\"Rate limit reached\"", json);

        var deserialized = JsonSerializer.Deserialize<AgentStreamEvent>(json, JsonOptions);
        Assert.IsType<ErrorEvent>(deserialized);
        var err = (ErrorEvent)deserialized;
        Assert.Equal("Rate limit reached", err.Error);
    }

    [Fact]
    public void TestAbortEvent_Serialization()
    {
        var ev = new AbortEvent
        {
            SessionId = "abort-sess"
        };

        var json = JsonSerializer.Serialize<AgentStreamEvent>(ev, JsonOptions);
        Assert.Contains("\"type\":\"abort\"", json);
        Assert.Contains("\"sessionId\":\"abort-sess\"", json);

        var deserialized = JsonSerializer.Deserialize<AgentStreamEvent>(json, JsonOptions);
        Assert.IsType<AbortEvent>(deserialized);
        Assert.Equal("abort-sess", deserialized.SessionId);
    }

    [Fact]
    public void TestCoreV2JsonCompatibility_RawTokenJson()
    {
        // Exact JSON format produced by serde_json in packages/core_v2/src/protocol/events.rs
        const string rawCoreV2Json = "{\"type\":\"token\",\"sessionId\":\"sess-core\",\"content\":\"Rust engine chunk\"}";

        var ev = JsonSerializer.Deserialize<AgentStreamEvent>(rawCoreV2Json, JsonOptions);
        Assert.NotNull(ev);
        Assert.IsType<TokenEvent>(ev);
        var tok = (TokenEvent)ev;
        Assert.Equal("sess-core", tok.SessionId);
        Assert.Equal("Rust engine chunk", tok.Content);
    }

    [Fact]
    public void TestWireMessage_AgentEventRoundtrip()
    {
        var innerEvent = new TokenEvent
        {
            SessionId = "sess-wire",
            Content = "Streaming token payload"
        };
        var wire = WireMessage.CreateAgentEvent(innerEvent);

        var json = JsonSerializer.Serialize(wire, JsonOptions);
        Assert.Contains("\"channel\":\"agent-event\"", json);
        Assert.Contains("\"content\":\"Streaming token payload\"", json);

        var deserialized = JsonSerializer.Deserialize<WireMessage>(json, JsonOptions);
        Assert.NotNull(deserialized);
        Assert.Equal(Commands.AgentEvent, deserialized.Channel);
        Assert.NotNull(deserialized.AgentEvent);
        Assert.IsType<TokenEvent>(deserialized.AgentEvent);
        var tok = (TokenEvent)deserialized.AgentEvent;
        Assert.Equal("sess-wire", tok.SessionId);
        Assert.Equal("Streaming token payload", tok.Content);
    }

    [Fact]
    public void TestWireMessage_SessionSyncRoundtrip()
    {
        var payload = new SessionSyncPayload
        {
            SessionId = "sync-123",
            IsRunning = true,
            FullAssistantText = "Completed prefix",
            FullThoughtText = "Previous reasoning"
        };
        var wire = WireMessage.CreateSessionSync(payload);

        var json = JsonSerializer.Serialize(wire, JsonOptions);
        Assert.Contains("\"channel\":\"session-sync\"", json);
        Assert.Contains("\"fullAssistantText\":\"Completed prefix\"", json);

        var deserialized = JsonSerializer.Deserialize<WireMessage>(json, JsonOptions);
        Assert.NotNull(deserialized);
        Assert.Equal(Commands.WsChannelSessionSync, deserialized.Channel);
        Assert.NotNull(deserialized.SessionSync);
        Assert.Equal("sync-123", deserialized.SessionSync.SessionId);
        Assert.True(deserialized.SessionSync.IsRunning);
        Assert.Equal("Completed prefix", deserialized.SessionSync.FullAssistantText);
    }

    [Fact]
    public void TestWireMessage_PongRoundtrip()
    {
        var wire = WireMessage.CreatePong();
        var json = JsonSerializer.Serialize(wire, JsonOptions);
        Assert.Contains("\"action\":\"PONG\"", json);
        Assert.Contains("\"timestamp\":", json);

        var deserialized = JsonSerializer.Deserialize<WireMessage>(json, JsonOptions);
        Assert.NotNull(deserialized);
        Assert.Equal(Commands.WsActionPong, deserialized.Action);
        Assert.True(deserialized.Timestamp.HasValue);
    }

    [Fact]
    public void TestIpcRequestEnvelope_Serialization()
    {
        var runReq = new AgentRunRequest
        {
            SessionId = "sess-run",
            Prompt = "Hello agent",
            Config = new AgentRunConfig { Model = "gpt-4o" }
        };
        var envelope = IpcRequestEnvelope<AgentRunRequest>.Create(Commands.AgentRun, runReq);

        var json = JsonSerializer.Serialize(envelope, JsonOptions);
        Assert.Contains("\"channel\":\"agent-run\"", json);
        Assert.Contains("\"prompt\":\"Hello agent\"", json);
        Assert.Contains("\"model\":\"gpt-4o\"", json);

        var deserialized = JsonSerializer.Deserialize<IpcRequestEnvelope<AgentRunRequest>>(json, JsonOptions);
        Assert.NotNull(deserialized);
        Assert.Equal(Commands.AgentRun, deserialized.Channel);
        Assert.Single(deserialized.Args);
        Assert.Equal("Hello agent", deserialized.Args[0].Prompt);
    }

    [Fact]
    public void TestIpcResponseEnvelope_Serialization()
    {
        var statusResp = new AgentStatusResponse
        {
            SessionId = "sess-status",
            IsRunning = true
        };
        var envelope = new IpcResponseEnvelope<AgentStatusResponse>
        {
            Data = statusResp,
            Error = null
        };

        var json = JsonSerializer.Serialize(envelope, JsonOptions);
        Assert.Contains("\"data\":", json);
        Assert.Contains("\"isRunning\":true", json);
        Assert.True(envelope.IsSuccess);

        var deserialized = JsonSerializer.Deserialize<IpcResponseEnvelope<AgentStatusResponse>>(json, JsonOptions);
        Assert.NotNull(deserialized);
        Assert.True(deserialized.IsSuccess);
        Assert.NotNull(deserialized.Data);
        Assert.Equal("sess-status", deserialized.Data.SessionId);
        Assert.True(deserialized.Data.IsRunning);
    }

    [Fact]
    public void TestSubscriptionRequests_Serialization()
    {
        var sub = new SubscribeSessionRequest { SessionId = "s-target" };
        var unsub = new UnsubscribeSessionRequest { SessionId = "s-target" };
        var sync = new SyncSessionRequest { SessionId = "s-target" };

        var subJson = JsonSerializer.Serialize(sub, JsonOptions);
        var unsubJson = JsonSerializer.Serialize(unsub, JsonOptions);
        var syncJson = JsonSerializer.Serialize(sync, JsonOptions);

        Assert.Contains("\"action\":\"SUBSCRIBE_SESSION\"", subJson);
        Assert.Contains("\"action\":\"UNSUBSCRIBE_SESSION\"", unsubJson);
        Assert.Contains("\"action\":\"SYNC_SESSION\"", syncJson);

        var subParsed = JsonSerializer.Deserialize<SubscribeSessionRequest>(subJson, JsonOptions);
        Assert.Equal(Commands.WsActionSubscribeSession, subParsed?.Action);
        Assert.Equal("s-target", subParsed?.SessionId);
    }

    [Fact]
    public void TestDaemonClient_PortDiscovery_EnvironmentVariable()
    {
        const string testPort = "9876";
        Environment.SetEnvironmentVariable("SUPERAGENT_PORT", testPort);

        try
        {
            var client = new DaemonClient();
            Assert.Equal(9876, client.Port);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SUPERAGENT_PORT", null);
        }
    }

    [Fact]
    public void TestCommands_CanonicalValuesMatchCoreV2()
    {
        Assert.Equal("agent-run", Commands.AgentRun);
        Assert.Equal("agent-stop", Commands.AgentStop);
        Assert.Equal("settings-read", Commands.SettingsRead);
        Assert.Equal("settings-write", Commands.SettingsWrite);
        Assert.Equal("system-info", Commands.SystemInfo);
        Assert.Equal("app_version", Commands.AppVersion);
        Assert.Equal("storage:scan", Commands.StorageScan);
        Assert.Equal("PING", Commands.WsActionPing);
        Assert.Equal("PONG", Commands.WsActionPong);
        Assert.Equal("SUBSCRIBE_SESSION", Commands.WsActionSubscribeSession);
        Assert.Equal("UNSUBSCRIBE_SESSION", Commands.WsActionUnsubscribeSession);
        Assert.Equal("SYNC_SESSION", Commands.WsActionSyncSession);
        Assert.Equal("session-sync", Commands.WsChannelSessionSync);
    }

    #region Workspace Model Serialization and Demo Integrity Tests

    [Fact]
    public void TestComputerUseState_SerializationAndDemoIntegrity()
    {
        var state = DemoData.GetComputerUseDemo();
        Assert.NotNull(state);
        Assert.NotEmpty(state.Windows);
        Assert.NotNull(state.AccessibilityRoot);
        Assert.NotEmpty(state.TrajectoryPoints);
        Assert.Equal(800, state.SettlingTotalMs);
        Assert.True(state.IsSettled);

        var json = JsonSerializer.Serialize(state, JsonOptions);
        Assert.Contains("\"windows\":", json);
        Assert.Contains("\"accessibilityRoot\":", json);
        Assert.Contains("\"trajectoryPoints\":", json);
        Assert.Contains("\"settlingTotalMs\":800", json);

        var roundtripped = JsonSerializer.Deserialize<ComputerUseState>(json, JsonOptions);
        Assert.NotNull(roundtripped);
        Assert.Equal(state.Windows.Count, roundtripped.Windows.Count);
        Assert.Equal(state.TrajectoryPoints.Count, roundtripped.TrajectoryPoints.Count);
        Assert.Equal(state.SettlingTotalMs, roundtripped.SettlingTotalMs);
    }

    [Fact]
    public void TestBrowserLeasingState_SerializationAndDemoIntegrity()
    {
        var state = DemoData.GetBrowserLeasingDemo();
        Assert.NotNull(state);
        Assert.NotEmpty(state.ActiveTabs);
        Assert.NotEmpty(state.Tools);
        Assert.NotEmpty(state.CdpEvents);
        Assert.Contains(state.ActiveTabs, t => t.Tier == "claimExistingTab");
        Assert.Contains(state.ActiveTabs, t => t.Tier == "createTab");

        var json = JsonSerializer.Serialize(state, JsonOptions);
        Assert.Contains("\"activeTabs\":", json);
        Assert.Contains("\"tools\":", json);
        Assert.Contains("\"cdpEvents\":", json);

        var roundtripped = JsonSerializer.Deserialize<BrowserLeasingState>(json, JsonOptions);
        Assert.NotNull(roundtripped);
        Assert.Equal(state.ActiveTabs.Count, roundtripped.ActiveTabs.Count);
        Assert.Equal(state.Tools.Count, roundtripped.Tools.Count);
        Assert.Equal(state.CdpEvents.Count, roundtripped.CdpEvents.Count);
    }

    [Fact]
    public void TestSecurityGuardianState_SerializationAndDemoIntegrity()
    {
        var state = DemoData.GetSecurityGuardianDemo();
        Assert.NotNull(state);
        Assert.Equal(16, state.AllBadges.Count);
        Assert.Equal(7, state.RecoveryBranches.Count);
        Assert.True(state.IsLockScreenArmed);
        Assert.NotNull(state.ActiveDecision);

        var json = JsonSerializer.Serialize(state, JsonOptions);
        Assert.Contains("\"allBadges\":", json);
        Assert.Contains("\"recoveryBranches\":", json);
        Assert.Contains("\"isLockScreenArmed\":true", json);

        var roundtripped = JsonSerializer.Deserialize<SecurityGuardianState>(json, JsonOptions);
        Assert.NotNull(roundtripped);
        Assert.Equal(16, roundtripped.AllBadges.Count);
        Assert.Equal(7, roundtripped.RecoveryBranches.Count);
        Assert.Equal(state.ActiveTier, roundtripped.ActiveTier);
    }

    [Fact]
    public void TestReplConsoleState_SerializationAndDemoIntegrity()
    {
        var state = DemoData.GetReplConsoleDemo();
        Assert.NotNull(state);
        Assert.Equal(25000, state.MaxBufferTokens);
        Assert.NotEmpty(state.Lines);
        Assert.NotEmpty(state.ScopeVariables);

        var json = JsonSerializer.Serialize(state, JsonOptions);
        Assert.Contains("\"maxBufferTokens\":25000", json);
        Assert.Contains("\"lines\":", json);
        Assert.Contains("\"scopeVariables\":", json);

        var roundtripped = JsonSerializer.Deserialize<ReplConsoleState>(json, JsonOptions);
        Assert.NotNull(roundtripped);
        Assert.Equal(25000, roundtripped.MaxBufferTokens);
        Assert.Equal(state.Lines.Count, roundtripped.Lines.Count);
        Assert.Equal(state.ScopeVariables.Count, roundtripped.ScopeVariables.Count);
    }

    [Fact]
    public void TestCompanionState_SerializationAndDemoIntegrity()
    {
        var state = DemoData.GetCompanionDemo();
        Assert.NotNull(state);
        Assert.NotEmpty(state.Visemes);
        Assert.NotEmpty(state.Moods);
        Assert.NotEmpty(state.PhotoPresets);
        Assert.Equal("Aiko-chan (SuperAgent VRM Partner)", state.CompanionName);

        var json = JsonSerializer.Serialize(state, JsonOptions);
        Assert.Contains("\"companionName\":", json);
        Assert.Contains("\"visemes\":", json);
        Assert.Contains("\"activeMood\":", json);

        var roundtripped = JsonSerializer.Deserialize<CompanionState>(json, JsonOptions);
        Assert.NotNull(roundtripped);
        Assert.Equal(state.CompanionName, roundtripped.CompanionName);
        Assert.Equal(state.Visemes.Count, roundtripped.Visemes.Count);
        Assert.Equal(state.ActiveMood, roundtripped.ActiveMood);
    }

    [Fact]
    public void TestCreativeStudioState_SerializationAndDemoIntegrity()
    {
        var state = DemoData.GetCreativeStudioDemo();
        Assert.NotNull(state);
        Assert.NotNull(state.ActiveImage);
        Assert.NotEmpty(state.Filmstrip);
        Assert.NotNull(state.ActiveVideo);
        Assert.NotEmpty(state.VideoQueue);
        Assert.NotEmpty(state.Palettes);
        Assert.NotNull(state.Watermark);

        var json = JsonSerializer.Serialize(state, JsonOptions);
        Assert.Contains("\"activeImage\":", json);
        Assert.Contains("\"filmstrip\":", json);
        Assert.Contains("\"activeVideo\":", json);
        Assert.Contains("\"videoQueue\":", json);

        var roundtripped = JsonSerializer.Deserialize<CreativeStudioState>(json, JsonOptions);
        Assert.NotNull(roundtripped);
        Assert.Equal(state.Filmstrip.Count, roundtripped.Filmstrip.Count);
        Assert.Equal(state.VideoQueue.Count, roundtripped.VideoQueue.Count);
        Assert.Equal(state.Palettes.Count, roundtripped.Palettes.Count);
    }

    [Fact]
    public void TestPcbEcadState_SerializationAndDemoIntegrity()
    {
        var state = DemoData.GetPcbEcadDemo();
        Assert.NotNull(state);
        Assert.NotEmpty(state.Components);
        Assert.NotEmpty(state.Nets);
        Assert.NotEmpty(state.ErcViolations);
        Assert.NotEmpty(state.Layers);
        Assert.NotEmpty(state.AiCopilotHistory);
        Assert.Equal("ESP32-S3 IoT Weather & Environment Node", state.ProjectName);

        var json = JsonSerializer.Serialize(state, JsonOptions);
        Assert.Contains("\"components\":", json);
        Assert.Contains("\"nets\":", json);
        Assert.Contains("\"ercViolations\":", json);
        Assert.Contains("\"layers\":", json);

        var roundtripped = JsonSerializer.Deserialize<PcbEcadState>(json, JsonOptions);
        Assert.NotNull(roundtripped);
        Assert.Equal(state.Components.Count, roundtripped.Components.Count);
        Assert.Equal(state.Nets.Count, roundtripped.Nets.Count);
        Assert.Equal(state.Layers.Count, roundtripped.Layers.Count);
    }

    [Fact]
    public void TestTasksState_SerializationAndDemoIntegrity()
    {
        var state = DemoData.GetTasksDemo();
        Assert.NotNull(state);
        Assert.NotEmpty(state.Cards);
        Assert.NotEmpty(state.Routines);

        var columns = new HashSet<string>(state.Cards.Select(c => c.Column));
        Assert.Contains("ToDo", columns);
        Assert.Contains("InProgress", columns);
        Assert.Contains("BlockedReview", columns);
        Assert.Contains("Done", columns);

        var json = JsonSerializer.Serialize(state, JsonOptions);
        Assert.Contains("\"cards\":", json);
        Assert.Contains("\"routines\":", json);

        var roundtripped = JsonSerializer.Deserialize<TasksState>(json, JsonOptions);
        Assert.NotNull(roundtripped);
        Assert.Equal(state.Cards.Count, roundtripped.Cards.Count);
        Assert.Equal(state.Routines.Count, roundtripped.Routines.Count);
    }

    [Fact]
    public void TestSettingsCatalogState_SerializationAnd24ModulesCoverage()
    {
        var state = DemoData.GetSettingsCatalogDemo();
        Assert.NotNull(state);
        Assert.Equal(24, state.Modules.Count);
        Assert.Equal(8, state.Diagnostics.Count);
        Assert.All(state.Diagnostics, d => Assert.True(d.IsPassed));

        // Verify distinct modules
        var ids = state.Modules.Select(m => m.Id).Distinct().ToList();
        Assert.Equal(24, ids.Count);

        // Verify key modules exist
        Assert.Contains(state.Modules, m => m.Id == "general");
        Assert.Contains(state.Modules, m => m.Id == "providers");
        Assert.Contains(state.Modules, m => m.Id == "local_models");
        Assert.Contains(state.Modules, m => m.Id == "doctor");
        Assert.Contains(state.Modules, m => m.Id == "security_guardian");
        Assert.Contains(state.Modules, m => m.Id == "pcb_rules");
        Assert.Contains(state.Modules, m => m.Id == "companion_pet");
        Assert.Contains(state.Modules, m => m.Id == "repl_terminal");

        var json = JsonSerializer.Serialize(state, JsonOptions);
        Assert.Contains("\"modules\":", json);
        Assert.Contains("\"diagnostics\":", json);

        var roundtripped = JsonSerializer.Deserialize<SettingsCatalogState>(json, JsonOptions);
        Assert.NotNull(roundtripped);
        Assert.Equal(24, roundtripped.Modules.Count);
        Assert.Equal(8, roundtripped.Diagnostics.Count);
    }

    [Fact]
    public void TestZoSecurityDecisionBadges_16Vectors()
    {
        var state = DemoData.GetSecurityGuardianDemo();
        Assert.Equal(16, state.AllBadges.Count);

        // Verify distinct codes from 0 to 15
        var codes = state.AllBadges.Select(b => b.StateCode).OrderBy(c => c).ToList();
        for (int i = 0; i < 16; i++)
        {
            Assert.Contains(i, codes);
        }

        // Verify all badges have non-empty labels, rationales, and valid colors
        foreach (var badge in state.AllBadges)
        {
            Assert.False(string.IsNullOrWhiteSpace(badge.Label));
            Assert.False(string.IsNullOrWhiteSpace(badge.Rationale));
            Assert.StartsWith("#", badge.ColorHex);
        }
    }

    [Fact]
    public void TestCredentialRecovery_7Branches()
    {
        var state = DemoData.GetSecurityGuardianDemo();
        Assert.Equal(7, state.RecoveryBranches.Count);

        // Verify distinct branch IDs 1 to 7
        var branchIds = state.RecoveryBranches.Select(b => b.BranchId).OrderBy(id => id).ToList();
        for (int i = 1; i <= 7; i++)
        {
            Assert.Contains(i, branchIds);
        }

        foreach (var branch in state.RecoveryBranches)
        {
            Assert.False(string.IsNullOrWhiteSpace(branch.ActionName));
            Assert.False(string.IsNullOrWhiteSpace(branch.ProtocolSummary));
            Assert.True(branch.IsAvailable);
        }
    }

    [Fact]
    public void TestCompanionVisemes_5MouthShapes()
    {
        var state = DemoData.GetCompanionDemo();
        Assert.Equal(5, state.Visemes.Count);

        var visemeNames = state.Visemes.Select(v => v.Viseme).ToList();
        Assert.Contains("aa", visemeNames);
        Assert.Contains("ih", visemeNames);
        Assert.Contains("ou", visemeNames);
        Assert.Contains("ee", visemeNames);
        Assert.Contains("oh", visemeNames);

        foreach (var viseme in state.Visemes)
        {
            Assert.InRange(viseme.Weight, 0.0, 1.0);
        }
    }

    [Fact]
    public void TestSystemDoctor_8DiagnosticsAllPassed()
    {
        var state = DemoData.GetSettingsCatalogDemo();
        Assert.Equal(8, state.Diagnostics.Count);

        var components = state.Diagnostics.Select(d => d.Component).ToList();
        Assert.Contains(components, c => c.Contains("Node.js"));
        Assert.Contains(components, c => c.Contains("Rust"));
        Assert.Contains(components, c => c.Contains("FFmpeg"));
        Assert.Contains(components, c => c.Contains("CUDA") || c.Contains("GPU"));
        Assert.Contains(components, c => c.Contains("1469"));

        Assert.All(state.Diagnostics, d =>
        {
            Assert.True(d.IsPassed);
            Assert.Equal("Healthy", d.Status);
            Assert.False(string.IsNullOrWhiteSpace(d.Details));
        });
    }

    #endregion
}
