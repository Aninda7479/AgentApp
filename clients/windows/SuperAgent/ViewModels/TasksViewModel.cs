// TasksViewModel.cs - SuperAgent Windows Native WinUI 3
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

    [ObservableProperty]
    private string _newTaskTitle = string.Empty;

    [ObservableProperty]
    private string _newTaskPersona = "Code Janitor";

    [ObservableProperty]
    private string _feedbackMessage = "Kanban board synchronized. 2 scheduled routines active.";

    public TasksViewModel(TasksState? state = null)
    {
        _state = state ?? DemoData.GetTasksDemo();
        LoadState();
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
            Description = "User submitted prompt task",
            Column = "ToDo",
            Priority = "Medium",
            AssignedPersona = NewTaskPersona,
            DueDate = "Today"
        };

        Cards.Insert(0, card);
        NewTaskTitle = string.Empty;
        RebuildColumns();
        FeedbackMessage = $"Task created: \"{card.Title}\"";
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
    public void ToggleRoutine(CronRoutine routine)
    {
        var index = Routines.IndexOf(routine);
        if (index >= 0)
        {
            var updated = routine with { IsEnabled = !routine.IsEnabled };
            Routines[index] = updated;
            FeedbackMessage = $"Routine \"{routine.Name}\" is now {(updated.IsEnabled ? "active" : "paused")}.";
        }
    }

    [RelayCommand]
    public void TriggerRoutineNow(CronRoutine routine)
    {
        FeedbackMessage = $"Manually triggered routine: \"{routine.Name}\" (dispatched prompt to daemon).";
    }
}
