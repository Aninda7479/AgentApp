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
    private int _totalTokens;

    [ObservableProperty]
    private int _maxBufferTokens = 25000;

    [ObservableProperty]
    private string _currentCommand = string.Empty;

    [ObservableProperty]
    private bool _isResetPending;

    [ObservableProperty]
    private string _statusText = "QuickJS Engine Active. Buffer: 3,840 / 25,000 tokens.";

    public ReplConsoleViewModel(ReplConsoleState? state = null)
    {
        _state = state ?? DemoData.GetReplConsoleDemo();
        LoadState();
    }

    private void LoadState()
    {
        TotalTokens = _state.TotalTokens;
        MaxBufferTokens = _state.MaxBufferTokens;
        IsResetPending = _state.IsResetPending;

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

        if (cmd.StartsWith("const ") || cmd.StartsWith("let ") || cmd.StartsWith("var "))
        {
            outputText = "undefined";
            outputColor = "#94A3B8";
        }
        else if (cmd.Contains("error") || cmd.Contains("throw"))
        {
            outputText = "Uncaught Error: Evaluation failed";
            outputColor = "#EF4444";
        }
        else
        {
            outputText = $"[Eval Result]: {cmd} => OK";
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
        StatusText = $"Executed command. Buffer: {TotalTokens:N0} / {MaxBufferTokens:N0} tokens.";
    }

    [RelayCommand]
    public void ResetSession()
    {
        Lines.Clear();
        ScopeVariables.Clear();
        TotalTokens = 150;
        IsResetPending = false;

        Lines.Add(new ReplLogLine
        {
            LineIndex = 1,
            Text = "Session reset (js_reset invoked). Context buffer purged.",
            ColorHex = "#F59E0B",
            IsAnsiPrompt = false,
            ApproxTokens = 15
        });

        StatusText = "Session reset complete. Virtual buffer cleared.";
    }

    [RelayCommand]
    public void ClearOutput()
    {
        Lines.Clear();
        StatusText = "Console display cleared.";
    }
}
