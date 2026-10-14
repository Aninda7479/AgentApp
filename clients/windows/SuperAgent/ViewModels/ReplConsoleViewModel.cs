// ReplConsoleViewModel.cs - SuperAgent Windows Native WinUI 3
using System;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SuperAgent.Core;

namespace SuperAgent.ViewModels;

public partial class ReplConsoleViewModel : ObservableObject
{
    private readonly ReplConsoleState _state;

    public ObservableCollection<ReplLogLine> Lines { get; } = new();
    public ObservableCollection<ReplVariableNode> ScopeVariables { get; } = new();

    [ObservableProperty]
    private int _totalTokens = 3840;

    [ObservableProperty]
    private int _maxBufferTokens = 25000;

    [ObservableProperty]
    private string _engineVersion = "QuickJS v2024-01-13 | Active";

    [ObservableProperty]
    private string _tokenGaugeText = "3,840 / 25,000 tokens";

    [ObservableProperty]
    private double _tokenPercentage = 15.36;

    [ObservableProperty]
    private string _currentCommand = string.Empty;

    [ObservableProperty]
    private bool _isResetPending;

    [ObservableProperty]
    private string _statusText = "QuickJS v2024-01-13 Engine Active | Buffer: 3,840 / 25,000 tokens.";

    public ReplConsoleViewModel(ReplConsoleState? state = null)
    {
        _state = state ?? DemoData.GetReplConsoleDemo();
        LoadState();
    }

    partial void OnTotalTokensChanged(int value)
    {
        TokenPercentage = MaxBufferTokens > 0 ? Math.Min(100.0, (double)value / MaxBufferTokens * 100) : 0;
        TokenGaugeText = $"{value:N0} / {MaxBufferTokens:N0} tokens";
    }

    private void LoadState()
    {
        TotalTokens = _state.TotalTokens;
        MaxBufferTokens = _state.MaxBufferTokens;
        IsResetPending = _state.IsResetPending;
        EngineVersion = _state.EngineVersion;
        TokenPercentage = MaxBufferTokens > 0 ? (double)TotalTokens / MaxBufferTokens * 100 : 0;
        TokenGaugeText = $"{TotalTokens:N0} / {MaxBufferTokens:N0} tokens";

        Lines.Clear();
        foreach (var line in _state.Lines)
        {
            Lines.Add(line);
        }

        ScopeVariables.Clear();
        foreach (var v in _state.ScopeVariables)
        {
            ScopeVariables.Add(v);
        }
    }

    [RelayCommand]
    public void ExecuteCommand()
    {
        if (string.IsNullOrWhiteSpace(CurrentCommand))
        {
            return;
        }

        var cmd = CurrentCommand.Trim();
        CurrentCommand = string.Empty;

        if (cmd.Equals("js_reset", StringComparison.OrdinalIgnoreCase) || cmd.Equals("reset()", StringComparison.OrdinalIgnoreCase))
        {
            ResetSession();
            return;
        }

        Lines.Add(new ReplLogLine
        {
            LineIndex = Lines.Count + 1,
            Text = $"> {cmd}",
            ColorHex = "#06B6D4",
            IsAnsiPrompt = true,
            ApproxTokens = cmd.Length / 4 + 2
        });

        // Simulate execution result
        string outputText;
        string outputColor = "#10B981";

        if (cmd.Equals("sky", StringComparison.OrdinalIgnoreCase))
        {
            outputText = "SkyDesktopRuntime { pid: 4812, displays: 1, activeWindow: \"SuperAgent.sln\", engine: \"DirectX11/WGC\" }";
            outputColor = "#38BDF8";
        }
        else if (cmd.Equals("cua", StringComparison.OrdinalIgnoreCase))
        {
            outputText = "CUAOrchestrator { state: \"Idle\", tabs: 3, securityTier: \"PreApproval (Mode 3)\", guardian: \"Armed\" }";
            outputColor = "#38BDF8";
        }
        else if (cmd.Equals("targetWindow", StringComparison.OrdinalIgnoreCase))
        {
            outputText = "WindowTargetItem { title: \"SuperAgent.sln - Visual Studio\", hWnd: \"0x0014028A\", occluded: false }";
            outputColor = "#38BDF8";
        }
        else if (cmd.Equals("activeTabs", StringComparison.OrdinalIgnoreCase))
        {
            outputText = "[ '@tab-v1-finance', '@tab-v2-docs', '@tab-v3-dev' ] (3 leased browser tabs)";
            outputColor = "#A78BFA";
        }
        else if (cmd.StartsWith("const ") || cmd.StartsWith("let ") || cmd.StartsWith("var "))
        {
            outputText = "undefined";
            outputColor = "#94A3B8";
        }
        else if (cmd.Contains("error", StringComparison.OrdinalIgnoreCase) || cmd.Contains("throw", StringComparison.OrdinalIgnoreCase))
        {
            outputText = "Uncaught Error: Evaluation failed [zo-01: guardian_denied]";
            outputColor = "#EF4444";
        }
        else
        {
            outputText = $"[Eval Result]: {cmd} => OK (Execution: 1.1ms)";
            outputColor = "#10B981";
        }

        Lines.Add(new ReplLogLine
        {
            LineIndex = Lines.Count + 1,
            Text = outputText,
            ColorHex = outputColor,
            IsAnsiPrompt = false,
            ApproxTokens = outputText.Length / 4 + 2
        });

        TotalTokens = Math.Min(MaxBufferTokens, TotalTokens + (cmd.Length + outputText.Length) / 4 + 4);
        StatusText = $"Executed: '{cmd}' | Buffer: {TotalTokens:N0} / {MaxBufferTokens:N0} tokens.";
    }

    [RelayCommand]
    public void ResetSession()
    {
        Lines.Clear();
        TotalTokens = 120;
        IsResetPending = false;

        Lines.Add(new ReplLogLine
        {
            LineIndex = 1,
            Text = "CUA REPL session context cleared. Global variables and tab bindings have been released.",
            ColorHex = "#F59E0B",
            IsAnsiPrompt = false,
            ApproxTokens = 15
        });

        Lines.Add(new ReplLogLine
        {
            LineIndex = 2,
            Text = "QuickJS runtime state reinitialized. Memory heap purged to 0 bytes.",
            ColorHex = "#10B981",
            IsAnsiPrompt = false,
            ApproxTokens = 12
        });

        StatusText = "Session reset (js_reset). Virtual buffer cleared.";
    }

    [RelayCommand]
    public void ClearOutput()
    {
        Lines.Clear();
        StatusText = "Console display stream cleared.";
    }
}
