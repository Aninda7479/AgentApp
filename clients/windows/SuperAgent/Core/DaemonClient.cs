// DaemonClient.cs - SuperAgent Windows Native WinUI 3
// High-performance HTTP/2 IPC & WebSocket client for communication with superagent-core-daemon.

using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace SuperAgent.Core;

public class DaemonClient : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly HttpClient _httpClient;
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly HashSet<string> _subscribedSessions = new();
    private readonly object _subLock = new();

    private ClientWebSocket? _webSocket;
    private CancellationTokenSource? _connectionCts;
    private Task? _receiveLoopTask;
    private Task? _heartbeatTask;
    private bool _isDisposed;

    public int Port { get; private set; } = 1469;
    public string Host { get; private set; } = "127.0.0.1";
    public string? AuthToken { get; private set; }
    public bool IsConnected { get; private set; }

    // Events
    public event Action<AgentStreamEvent>? OnAgentEvent;
    public event Action<SessionSyncPayload>? OnSessionSync;
    public event Action<bool>? OnConnectionStatusChanged;
    public event Action<string>? OnRawMessage;

    public DaemonClient(int? overridePort = null, string? host = null)
    {
        Host = host ?? "127.0.0.1";
        DiscoverDaemonConnection(overridePort);

        _httpClient = new HttpClient
        {
            BaseAddress = new Uri($"http://{Host}:{Port}/"),
            Timeout = TimeSpan.FromSeconds(30),
        };

        if (!string.IsNullOrEmpty(AuthToken))
        {
            _httpClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", AuthToken);
        }
    }

    /// <summary>
    /// Discovers the active daemon port and auth token via environment variables or lockfiles.
    /// Priority: override -> SUPERAGENT_PORT -> ~/.superagent/web-server.lock -> fallback 1469.
    /// </summary>
    public void DiscoverDaemonConnection(int? overridePort = null)
    {
        if (overridePort.HasValue && overridePort.Value > 0)
        {
            Port = overridePort.Value;
            return;
        }

        // 1. Environment variable
        var envPortStr = Environment.GetEnvironmentVariable("SUPERAGENT_PORT");
        if (!string.IsNullOrWhiteSpace(envPortStr) && int.TryParse(envPortStr, out var envPort) && envPort > 0)
        {
            Port = envPort;
            AuthToken = Environment.GetEnvironmentVariable("SUPERAGENT_TOKEN");
            return;
        }

        // 2. Lockfile discovery
        var userHome = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var lockfileCandidates = new[]
        {
            Path.Combine(userHome, ".superagent", "web-server.lock"),
            Path.Combine(userHome, ".superagent", "runtime", "web-server.lock"),
        };

        foreach (var lockPath in lockfileCandidates)
        {
            if (File.Exists(lockPath))
            {
                try
                {
                    var content = File.ReadAllText(lockPath).Trim();
                    if (int.TryParse(content, out var rawPort))
                    {
                        Port = rawPort;
                        return;
                    }

                    // Try parse JSON
                    using var doc = JsonDocument.Parse(content);
                    if (doc.RootElement.TryGetProperty("port", out var portEl) && portEl.TryGetInt32(out var jsonPort))
                    {
                        Port = jsonPort;
                        if (doc.RootElement.TryGetProperty("token", out var tokEl))
                        {
                            AuthToken = tokEl.GetString();
                        }
                        return;
                    }
                }
                catch
                {
                    // Ignore parse errors and try next candidate
                }
            }
        }

        // 3. Fallback to canonical port 1469
        Port = 1469;
    }

    #region HTTP IPC Channel Invocations

    /// <summary>
    /// Invokes an IPC channel over HTTP POST (/api/ipc/:channel) wrapped in IpcRequestEnvelope.
    /// </summary>
    public async Task<TResp?> InvokeIpcAsync<TReq, TResp>(string channel, TReq request, CancellationToken ct = default)
    {
        var envelope = IpcRequestEnvelope<TReq>.Create(channel, request);
        var json = JsonSerializer.Serialize(envelope, JsonOptions);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _httpClient.PostAsync($"api/ipc/{channel}", content, ct);
        var respContent = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"IPC channel '{channel}' failed with HTTP {response.StatusCode}: {respContent}");
        }

        var resultEnvelope = JsonSerializer.Deserialize<IpcResponseEnvelope<TResp>>(respContent, JsonOptions);
        if (resultEnvelope != null && !resultEnvelope.IsSuccess)
        {
            throw new InvalidOperationException($"IPC error on channel '{channel}': {resultEnvelope.Error}");
        }

        return resultEnvelope != null ? resultEnvelope.Data : default;
    }

    /// <summary>
    /// Initiates an agent execution turn via channel `agent-run`.
    /// </summary>
    public async Task RunAgentAsync(string sessionId, string prompt, AgentRunConfig? config = null, CancellationToken ct = default)
    {
        var request = new AgentRunRequest
        {
            SessionId = sessionId,
            Prompt = prompt,
            Config = config,
        };
        await InvokeIpcAsync<AgentRunRequest, JsonElement>(Commands.AgentRun, request, ct);
    }

    /// <summary>
    /// Stops an active agent execution session via channel `agent-stop`.
    /// </summary>
    public async Task StopAgentAsync(string sessionId, CancellationToken ct = default)
    {
        var request = new AgentStopRequest { SessionId = sessionId };
        await InvokeIpcAsync<AgentStopRequest, JsonElement>(Commands.AgentStop, request, ct);
    }

    /// <summary>
    /// Checks the status of an agent session via channel `agent-status`.
    /// </summary>
    public async Task<AgentStatusResponse?> GetAgentStatusAsync(string sessionId, CancellationToken ct = default)
    {
        var request = new { sessionId };
        return await InvokeIpcAsync<object, AgentStatusResponse>(Commands.AgentStatus, request, ct);
    }

    #endregion

    #region WebSocket Streaming & Subscription Management

    /// <summary>
    /// Connects to the WebSocket endpoint (/ws) with automatic background reconnect and heartbeats.
    /// </summary>
    public async Task ConnectAsync(CancellationToken ct = default)
    {
        if (_isDisposed) return;

        _connectionCts?.Cancel();
        _connectionCts = new CancellationTokenSource();
        var token = _connectionCts.Token;

        await ConnectWebSocketInternalAsync(token);

        _receiveLoopTask = Task.Run(() => ReceiveLoopAsync(token), token);
        _heartbeatTask = Task.Run(() => HeartbeatLoopAsync(token), token);
    }

    private async Task ConnectWebSocketInternalAsync(CancellationToken ct)
    {
        try
        {
            _webSocket?.Dispose();
            _webSocket = new ClientWebSocket();

            if (!string.IsNullOrEmpty(AuthToken))
            {
                _webSocket.Options.SetRequestHeader("Authorization", $"Bearer {AuthToken}");
            }

            var wsUri = new Uri($"ws://{Host}:{Port}/ws");
            await _webSocket.ConnectAsync(wsUri, ct);

            SetConnectionStatus(true);
            await ResubscribeAllSessionsAsync(ct);
        }
        catch
        {
            SetConnectionStatus(false);
            throw;
        }
    }

    private void SetConnectionStatus(bool connected)
    {
        if (IsConnected != connected)
        {
            IsConnected = connected;
            OnConnectionStatusChanged?.Invoke(connected);
        }
    }

    private async Task ReceiveLoopAsync(CancellationToken ct)
    {
        var buffer = new byte[64 * 1024];

        while (!ct.IsCancellationRequested && !_isDisposed)
        {
            try
            {
                if (_webSocket == null || _webSocket.State != WebSocketState.Open)
                {
                    SetConnectionStatus(false);
                    await TryReconnectWithBackoffAsync(ct);
                    continue;
                }

                using var ms = new MemoryStream();
                WebSocketReceiveResult result;

                do
                {
                    result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", ct);
                        SetConnectionStatus(false);
                        break;
                    }
                    ms.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    continue;
                }

                ms.Seek(0, SeekOrigin.Begin);
                var rawText = Encoding.UTF8.GetString(ms.ToArray());
                OnRawMessage?.Invoke(rawText);

                DispatchWireMessage(rawText);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch
            {
                SetConnectionStatus(false);
                await TryReconnectWithBackoffAsync(ct);
            }
        }
    }

    private void DispatchWireMessage(string rawText)
    {
        try
        {
            var wire = JsonSerializer.Deserialize<WireMessage>(rawText, JsonOptions);
            if (wire == null) return;

            if (wire.AgentEvent != null)
            {
                OnAgentEvent?.Invoke(wire.AgentEvent);
            }
            else if (wire.SessionSync != null)
            {
                OnSessionSync?.Invoke(wire.SessionSync);
            }
        }
        catch
        {
            // Ignore malformed wire packet
        }
    }

    private async Task TryReconnectWithBackoffAsync(CancellationToken ct)
    {
        var delaySeconds = 1;
        var maxDelaySeconds = 15;
        var random = new Random();

        while (!ct.IsCancellationRequested && !_isDisposed && (_webSocket == null || _webSocket.State != WebSocketState.Open))
        {
            try
            {
                var jitter = random.NextDouble() * 0.5;
                var delay = TimeSpan.FromSeconds(delaySeconds + jitter);
                await Task.Delay(delay, ct);

                await ConnectWebSocketInternalAsync(ct);
                if (IsConnected)
                {
                    return;
                }
            }
            catch
            {
                delaySeconds = Math.Min(delaySeconds * 2, maxDelaySeconds);
            }
        }
    }

    private async Task HeartbeatLoopAsync(CancellationToken ct)
    {
        var pingInterval = TimeSpan.FromSeconds(20);

        while (!ct.IsCancellationRequested && !_isDisposed)
        {
            try
            {
                await Task.Delay(pingInterval, ct);
                if (IsConnected && _webSocket?.State == WebSocketState.Open)
                {
                    var pingJson = "{\"action\":\"PING\"}";
                    await SendTextAsync(pingJson, ct);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch
            {
                // Heartbeat send errors will be handled by receive loop reconnect
            }
        }
    }

    private async Task SendTextAsync(string text, CancellationToken ct)
    {
        if (_webSocket == null || _webSocket.State != WebSocketState.Open)
        {
            return;
        }

        var bytes = Encoding.UTF8.GetBytes(text);
        await _sendLock.WaitAsync(ct);
        try
        {
            await _webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, ct);
        }
        finally
        {
            _sendLock.Release();
        }
    }

    /// <summary>
    /// Subscribes to events for a specific session over the WebSocket hub.
    /// </summary>
    public async Task SubscribeSessionAsync(string sessionId, CancellationToken ct = default)
    {
        lock (_subLock)
        {
            _subscribedSessions.Add(sessionId);
        }

        var payload = new SubscribeSessionRequest { SessionId = sessionId };
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        await SendTextAsync(json, ct);
    }

    /// <summary>
    /// Unsubscribes from events for a specific session over the WebSocket hub.
    /// </summary>
    public async Task UnsubscribeSessionAsync(string sessionId, CancellationToken ct = default)
    {
        lock (_subLock)
        {
            _subscribedSessions.Remove(sessionId);
        }

        var payload = new UnsubscribeSessionRequest { SessionId = sessionId };
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        await SendTextAsync(json, ct);
    }

    /// <summary>
    /// Requests immediate state catch-up and replay for a session.
    /// </summary>
    public async Task SyncSessionAsync(string sessionId, CancellationToken ct = default)
    {
        var payload = new SyncSessionRequest { SessionId = sessionId };
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        await SendTextAsync(json, ct);
    }

    private async Task ResubscribeAllSessionsAsync(CancellationToken ct)
    {
        List<string> sessions;
        lock (_subLock)
        {
            sessions = new List<string>(_subscribedSessions);
        }

        foreach (var sess in sessions)
        {
            var payload = new SubscribeSessionRequest { SessionId = sess };
            var json = JsonSerializer.Serialize(payload, JsonOptions);
            await SendTextAsync(json, ct);
        }
    }

    #endregion

    public async ValueTask DisposeAsync()
    {
        if (_isDisposed) return;
        _isDisposed = true;

        _connectionCts?.Cancel();
        _connectionCts?.Dispose();

        if (_webSocket != null)
        {
            try
            {
                if (_webSocket.State == WebSocketState.Open)
                {
                    await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Client disposing", CancellationToken.None);
                }
            }
            catch
            {
                // Ignore disposal errors
            }
            _webSocket.Dispose();
        }

        _httpClient.Dispose();
        _sendLock.Dispose();
        GC.SuppressFinalize(this);
    }
}
