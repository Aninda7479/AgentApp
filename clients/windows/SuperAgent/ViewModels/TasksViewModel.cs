// TasksViewModel.cs - SuperAgent Windows Native WinUI 3
using System;
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SuperAgent.Core;

namespace SuperAgent.ViewModels;

public partial class TasksViewModel : ObservableObject
{
    private readonly TasksState _state;

    public ObservableCollection<KanbanCard> Cards { get; } = new();
    public ObservableCollection<KanbanCard> ToDoCards { get; } = new();
    public ObservableCollection<KanbanCard> InProgressCards { get; } = new();
    public ObservableCollection<KanbanCard> BlockedCards { get; } = new();
    public ObservableCollection<KanbanCard> DoneCards { get; } = new();
    public ObservableCollection<CronRoutine> Routines { get; } = new();
    public ObservableCollection<string> ExecutionLogs { get; } = new();

    [ObservableProperty]
    private string _newTaskTitle = string.Empty;

    [ObservableProperty]
    private string _newTaskPersona = "Code Janitor";

    [ObservableProperty]
    private string _newTaskPriority = "Medium";

    [ObservableProperty]
    private string _newTaskTag = "Rust Core";

    [ObservableProperty]
    private string _feedbackMessage = "Kanban board synchronized. 2 scheduled routines active.";

    // Scheduled Routines & Cron Modal state
    [ObservableProperty]
    private string _selectedCronExpression = "0 9 * * 1-5";

    [ObservableProperty]
    private string _cronSyntaxPreview = "At 09:00 AM UTC, Monday through Friday (Weekdays)";

    [ObservableProperty]
    private string _selectedPresetName = "Weekdays 9 AM Sync";

    [ObservableProperty]
    private string _newRoutineName = "Daily Dependency & CVE Audit";

    [ObservableProperty]
    private string _newRoutinePrompt = "Inspect cargo audit and npm audit across all workspaces and report CVEs.";

    [ObservableProperty]
    private bool _routineTelegramAlert = true;

    [ObservableProperty]
    private string _routineTelegramChat = "@devops_alerts";

    [ObservableProperty]
    private string _webhookEndpointUrl = "http://localhost:1469/api/triggers/webhook/sec-token-77";

    [ObservableProperty]
    private bool _isExecutionLogDrawerOpen = true;

    public TasksViewModel(TasksState? state = null)
    {
        _state = state ?? DemoData.GetTasksDemo();
        LoadState();
        InitializeExecutionLogs();
    }

    private void LoadState()
    {
        Cards.Clear();
        foreach (var c in _state.Cards)
        {
            Cards.Add(c);
        }
        RebuildColumns();

        Routines.Clear();
        foreach (var r in _state.Routines)
        {
            Routines.Add(r);
        }
    }

    private void InitializeExecutionLogs()
    {
        ExecutionLogs.Clear();
        ExecutionLogs.Add($"[09:00:01 UTC] [CRON-ENGINE] Daemon heartbeat acknowledged on 127.0.0.1:1469.");
        ExecutionLogs.Add($"[09:00:02 UTC] [DISPATCH] Triggered 'Daily Morning Dependency Scan' (cron: 0 9 * * 1-5).");
        ExecutionLogs.Add($"[09:00:03 UTC] [ORCHESTRATOR] Subagent 'Security Guardian' spawned with persona profile.");
        ExecutionLogs.Add($"[09:00:05 UTC] [TELEGRAM-GATEWAY] Dispatched notification payload to @devops_alerts -> 200 OK.");
        ExecutionLogs.Add($"[10:00:00 UTC] [DISPATCH] Triggered 'Hourly Workspace Lock Health Check' (cron: 0 * * * *).");
        ExecutionLogs.Add($"[10:00:01 UTC] [STORAGE] Lock staleness verified. 0 orphaned locks detected.");
        ExecutionLogs.Add($"[11:00:00 UTC] [MONITOR] Ready. Awaiting next scheduled tick or incoming webhook trigger.");
    }

    private void RebuildColumns()
    {
        ToDoCards.Clear();
        InProgressCards.Clear();
        BlockedCards.Clear();
        DoneCards.Clear();

        foreach (var card in Cards)
        {
            switch (card.Column)
            {
                case "ToDo":
                    ToDoCards.Add(card);
                    break;
                case "InProgress":
                    InProgressCards.Add(card);
                    break;
                case "BlockedReview":
                    BlockedCards.Add(card);
                    break;
                case "Done":
                    DoneCards.Add(card);
                    break;
                default:
                    ToDoCards.Add(card);
                    break;
            }
        }
    }

    [RelayCommand]
    public void AddTask()
    {
        if (string.IsNullOrWhiteSpace(NewTaskTitle)) return;

        var card = new KanbanCard
        {
            Title = NewTaskTitle.Trim(),
            Description = "User submitted autonomous prompt task",
            Column = "ToDo",
            Priority = string.IsNullOrWhiteSpace(NewTaskPriority) ? "Medium" : NewTaskPriority,
            AssignedPersona = string.IsNullOrWhiteSpace(NewTaskPersona) ? "Code Janitor" : NewTaskPersona,
            DueDate = "Today",
            EstimatedTokens = "11.5k tok",
            Tag = string.IsNullOrWhiteSpace(NewTaskTag) ? "Autonomous" : NewTaskTag
        };

        Cards.Insert(0, card);
        NewTaskTitle = string.Empty;
        RebuildColumns();
        FeedbackMessage = $"Task created: \"{card.Title}\" ({card.Priority} priority, {card.EstimatedTokens})";
    }

    [RelayCommand]
    public void MoveCardNext(KanbanCard card)
    {
        var nextCol = card.Column switch
        {
            "ToDo" => "InProgress",
            "InProgress" => "BlockedReview",
            "BlockedReview" => "Done",
            _ => "Done"
        };

        var index = Cards.IndexOf(card);
        if (index >= 0)
        {
            Cards[index] = card with { Column = nextCol };
            RebuildColumns();
            FeedbackMessage = $"Moved \"{card.Title}\" to {nextCol}.";
        }
    }

    [RelayCommand]
    public void ApplyPreset(string preset)
    {
        switch (preset?.ToLowerInvariant())
        {
            case "hourly":
                SelectedCronExpression = "0 * * * *";
                CronSyntaxPreview = "Runs at minute 0 of every hour (00:00, 01:00...)";
                SelectedPresetName = "Hourly Health Check";
                FeedbackMessage = "Preset applied: Hourly Health Check (0 * * * *)";
                break;
            case "daily":
                SelectedCronExpression = "0 2 * * *";
                CronSyntaxPreview = "Runs at 02:00 AM UTC every day";
                SelectedPresetName = "Daily Backup & Audit";
                FeedbackMessage = "Preset applied: Daily Backup & Audit (0 2 * * *)";
                break;
            case "weekdays":
                SelectedCronExpression = "0 9 * * 1-5";
                CronSyntaxPreview = "Runs at 09:00 AM UTC, Monday through Friday";
                SelectedPresetName = "Weekdays 9 AM Sync";
                FeedbackMessage = "Preset applied: Weekdays 9 AM Sync (0 9 * * 1-5)";
                break;
            case "heartbeat":
                SelectedCronExpression = "*/15 * * * *";
                CronSyntaxPreview = "Runs every 15 minutes";
                SelectedPresetName = "15-Min Heartbeat";
                FeedbackMessage = "Preset applied: 15-Min Heartbeat (*/15 * * * *)";
                break;
        }
    }

    [RelayCommand]
    public void AddRoutine()
    {
        if (string.IsNullOrWhiteSpace(NewRoutineName)) return;

        var routine = new CronRoutine
        {
            Name = NewRoutineName.Trim(),
            PromptTemplate = string.IsNullOrWhiteSpace(NewRoutinePrompt) ? "Autonomous routine task execution." : NewRoutinePrompt.Trim(),
            CronExpression = SelectedCronExpression,
            PresetName = SelectedPresetName,
            NotifyTelegram = RoutineTelegramAlert,
            TelegramChatId = RoutineTelegramChat,
            WebhookUrl = $"http://localhost:1469/api/triggers/webhook/sec-{Guid.NewGuid():N}"[..48],
            IsEnabled = true
        };

        Routines.Add(routine);
        FeedbackMessage = $"Configured scheduled routine: \"{routine.Name}\" ({routine.CronExpression})";
        ExecutionLogs.Insert(0, $"[{DateTime.UtcNow:HH:mm:ss} UTC] [ROUTINE-ADDED] Created routine '{routine.Name}' ({routine.CronExpression}) with Telegram: {(routine.NotifyTelegram ? routine.TelegramChatId : "Disabled")}.");
    }

    [RelayCommand]
    public void ToggleRoutine(CronRoutine routine)
    {
        var index = Routines.IndexOf(routine);
        if (index >= 0)
        {
            var updated = routine with { IsEnabled = !routine.IsEnabled };
            Routines[index] = updated;
            FeedbackMessage = $"Routine \"{routine.Name}\" is now {(updated.IsEnabled ? "active" : "paused")}.";
            ExecutionLogs.Insert(0, $"[{DateTime.UtcNow:HH:mm:ss} UTC] [STATUS-CHANGE] Routine '{routine.Name}' state switched to: {(updated.IsEnabled ? "ACTIVE" : "PAUSED")}.");
        }
    }

    [RelayCommand]
    public void TriggerRoutineNow(CronRoutine routine)
    {
        FeedbackMessage = $"Manually triggered routine: \"{routine.Name}\" (dispatched prompt to daemon).";
        ExecutionLogs.Insert(0, $"[{DateTime.UtcNow:HH:mm:ss} UTC] [MANUAL-TRIGGER] Dispatched prompt for '{routine.Name}' to core_v2 daemon (127.0.0.1:1469).");
        ExecutionLogs.Insert(1, $"[{DateTime.UtcNow:HH:mm:ss} UTC] [TELEGRAM-DISPATCH] Alert delivered to {(routine.NotifyTelegram ? routine.TelegramChatId : "local log only")}. Status: 200 OK.");
    }

    [RelayCommand]
    public void ClearExecutionLogs()
    {
        ExecutionLogs.Clear();
        FeedbackMessage = "Execution log stream cleared.";
    }

    [RelayCommand]
    public void ToggleLogDrawer()
    {
        IsExecutionLogDrawerOpen = !IsExecutionLogDrawerOpen;
    }
}
