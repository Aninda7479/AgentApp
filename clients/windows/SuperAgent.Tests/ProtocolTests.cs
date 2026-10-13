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
}
