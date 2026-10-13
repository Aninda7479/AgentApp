// MainViewModel.cs - SuperAgent Windows Native WinUI 3
// Reactive MVVM state store and event coordinator using CommunityToolkit.Mvvm.

using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SuperAgent.Core;

namespace SuperAgent.ViewModels;

public partial class SessionItem : ObservableObject
{
    public string Id { get; init; } = string.Empty;

    [ObservableProperty]
    private string _title = "New Chat";

    [ObservableProperty]
    private string _lastMessage = string.Empty;

    [ObservableProperty]
    private DateTime _updatedAt = DateTime.Now;

    [ObservableProperty]
    private bool _isActive;
}

public partial class ChatMessage : ObservableObject
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string Role { get; init; } = "user";

    [ObservableProperty]
    private string _content = string.Empty;

    [ObservableProperty]
    private string? _thought;

    [ObservableProperty]
    private string? _toolName;

    [ObservableProperty]
    private bool _isGenerating;

    public DateTime Timestamp { get; init; } = DateTime.Now;

    public bool IsUser => Role == "user";
    public bool IsAssistant => Role == "assistant";
    public bool HasThought => !string.IsNullOrWhiteSpace(Thought);
    public bool HasTool => !string.IsNullOrWhiteSpace(ToolName);
}

public partial class MainViewModel : ObservableObject
{
    private readonly DaemonClient _client;

    public DaemonClient Client => _client;

    public ObservableCollection<SessionItem> Sessions { get; } = new();
    public ObservableCollection<ChatMessage> ActiveMessages { get; } = new();

    [ObservableProperty]
    private string _activeSessionId = string.Empty;

    [ObservableProperty]
    private string _streamingThought = string.Empty;

    [ObservableProperty]
    private string _streamingToken = string.Empty;

    [ObservableProperty]
    private bool _isGenerating;

    [ObservableProperty]
    private bool _isConnected;

    [ObservableProperty]
    private string? _activeToolName;

    [ObservableProperty]
    private string _currentInput = string.Empty;

    [ObservableProperty]
    private string _selectedModel = "claude-3-7-sonnet";

    [ObservableProperty]
    private int _daemonPort = 1469;

    [ObservableProperty]
    private string _searchQuery = string.Empty;

    public MainViewModel(DaemonClient? client = null)
    {
        _client = client ?? new DaemonClient();
        DaemonPort = _client.Port;

        _client.OnAgentEvent += HandleAgentEvent;
        _client.OnSessionSync += HandleSessionSync;
        _client.OnConnectionStatusChanged += status => IsConnected = status;

        InitializeDefaultSession();
    }

    public async Task InitializeAsync()
    {
        try
        {
            await _client.ConnectAsync();
            if (!string.IsNullOrEmpty(ActiveSessionId))
            {
                await _client.SubscribeSessionAsync(ActiveSessionId);
            }
        }
        catch
        {
            // Reconnect loop in DaemonClient handles continuous retries
        }
    }

    private void InitializeDefaultSession()
    {
        var defaultSession = new SessionItem
        {
            Id = $"session-{Guid.NewGuid():N}"[..16],
            Title = "General Chat",
            LastMessage = "Welcome to SuperAgent Windows Native",
            IsActive = true,
        };

        Sessions.Add(defaultSession);
        ActiveSessionId = defaultSession.Id;

        ActiveMessages.Add(new ChatMessage
        {
            Role = "assistant",
            Content = "Hello! I am SuperAgent, your native desktop AI pairing companion. How can I assist you today?",
        });
    }

    #region Event Handlers

    private void HandleAgentEvent(AgentStreamEvent ev)
    {
        if (ev.SessionId != ActiveSessionId)
        {
            return;
        }

        switch (ev)
        {
            case StartTurnEvent:
                IsGenerating = true;
                StreamingThought = string.Empty;
                StreamingToken = string.Empty;
                ActiveToolName = null;
                break;

            case TokenEvent tok:
                StreamingToken += tok.Content;
                break;

            case ThoughtEvent thought:
                StreamingThought += thought.Content;
                break;

            case ToolCallEvent tool:
                ActiveToolName = tool.ToolName;
                break;

            case ToolResultEvent:
                ActiveToolName = null;
                break;

            case DoneEvent:
                FlushStreamingMessage();
                IsGenerating = false;
                ActiveToolName = null;
                break;

            case ErrorEvent err:
                FlushStreamingMessage(err.Error);
                IsGenerating = false;
                ActiveToolName = null;
                break;

            case AbortEvent:
                FlushStreamingMessage();
                IsGenerating = false;
                ActiveToolName = null;
                break;
        }
    }

    private void FlushStreamingMessage(string? errorMessage = null)
    {
        var content = !string.IsNullOrEmpty(errorMessage)
            ? $"⚠️ Error: {errorMessage}"
            : StreamingToken;

        if (!string.IsNullOrEmpty(content) || !string.IsNullOrEmpty(StreamingThought))
        {
            ActiveMessages.Add(new ChatMessage
            {
                Role = "assistant",
                Content = content,
                Thought = !string.IsNullOrEmpty(StreamingThought) ? StreamingThought : null,
            });
        }

        StreamingToken = string.Empty;
        StreamingThought = string.Empty;

        var currentSession = Sessions.FirstOrDefault(s => s.Id == ActiveSessionId);
        if (currentSession != null && !string.IsNullOrEmpty(content))
        {
            currentSession.LastMessage = content.Length > 60 ? content[..57] + "..." : content;
            currentSession.UpdatedAt = DateTime.Now;
        }
    }

    private void HandleSessionSync(SessionSyncPayload sync)
    {
        if (sync.SessionId != ActiveSessionId)
        {
            return;
        }

        IsGenerating = sync.IsRunning;
        if (!string.IsNullOrEmpty(sync.FullAssistantText))
        {
            StreamingToken = sync.FullAssistantText;
        }
        if (!string.IsNullOrEmpty(sync.FullThoughtText))
        {
            StreamingThought = sync.FullThoughtText;
        }
    }

    #endregion

    #region Relay Commands

    [RelayCommand]
    public async Task SendMessageAsync()
    {
        if (string.IsNullOrWhiteSpace(CurrentInput) || IsGenerating)
        {
            return;
        }

        var prompt = CurrentInput.Trim();
        CurrentInput = string.Empty;

        // Add user message to UI
        ActiveMessages.Add(new ChatMessage
        {
            Role = "user",
            Content = prompt,
        });

        // Update session preview
        var currentSession = Sessions.FirstOrDefault(s => s.Id == ActiveSessionId);
        if (currentSession != null)
        {
            currentSession.LastMessage = prompt.Length > 60 ? prompt[..57] + "..." : prompt;
            currentSession.UpdatedAt = DateTime.Now;
            if (currentSession.Title == "New Chat" || currentSession.Title == "General Chat")
            {
                currentSession.Title = prompt.Length > 30 ? prompt[..27] + "..." : prompt;
            }
        }

        IsGenerating = true;
        StreamingThought = string.Empty;
        StreamingToken = string.Empty;

        var config = new AgentRunConfig
        {
            Model = SelectedModel,
        };

        try
        {
            await _client.RunAgentAsync(ActiveSessionId, prompt, config);
        }
        catch (Exception ex)
        {
            IsGenerating = false;
            ActiveMessages.Add(new ChatMessage
            {
                Role = "assistant",
                Content = $"⚠️ Failed to send prompt: {ex.Message}",
            });
        }
    }

    [RelayCommand]
    public async Task StopGenerationAsync()
    {
        if (!IsGenerating || string.IsNullOrEmpty(ActiveSessionId))
        {
            return;
        }

        try
        {
            await _client.StopAgentAsync(ActiveSessionId);
        }
        catch
        {
            // Stop errors ignored; server will broadcast abort event
        }
        finally
        {
            IsGenerating = false;
        }
    }

    [RelayCommand]
    public async Task CreateNewSessionAsync()
    {
        var newSession = new SessionItem
        {
            Id = $"session-{Guid.NewGuid():N}"[..16],
            Title = "New Chat",
            LastMessage = "Session started",
            IsActive = true,
        };

        foreach (var sess in Sessions)
        {
            sess.IsActive = false;
        }

        Sessions.Insert(0, newSession);
        await SelectSessionAsync(newSession.Id);
    }

    [RelayCommand]
    public async Task SelectSessionAsync(string sessionId)
    {
        if (sessionId == ActiveSessionId)
        {
            return;
        }

        // Unsubscribe old session
        if (!string.IsNullOrEmpty(ActiveSessionId))
        {
            await _client.UnsubscribeSessionAsync(ActiveSessionId);
        }

        ActiveSessionId = sessionId;

        foreach (var sess in Sessions)
        {
            sess.IsActive = sess.Id == sessionId;
        }

        // Clear view messages and request sync
        ActiveMessages.Clear();
        StreamingThought = string.Empty;
        StreamingToken = string.Empty;
        IsGenerating = false;
        ActiveToolName = null;

        await _client.SubscribeSessionAsync(sessionId);
        await _client.SyncSessionAsync(sessionId);
    }

    [RelayCommand]
    public async Task ReconnectAsync()
    {
        try
        {
            await _client.ConnectAsync();
            if (!string.IsNullOrEmpty(ActiveSessionId))
            {
                await _client.SubscribeSessionAsync(ActiveSessionId);
            }
        }
        catch
        {
            // Retries continue in background
        }
    }

    #endregion
}
