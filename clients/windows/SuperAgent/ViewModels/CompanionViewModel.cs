// CompanionViewModel.cs - SuperAgent Windows Native WinUI 3
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SuperAgent.Core;

namespace SuperAgent.ViewModels;

public partial class CompanionViewModel : ObservableObject
{
    private readonly CompanionState _state;

    public ObservableCollection<CompanionMoodBadge> Moods { get; } = new();
    public ObservableCollection<VisemeMetric> Visemes { get; } = new();
    public ObservableCollection<PhotoModePreset> PhotoPresets { get; } = new();

    [ObservableProperty]
    private string _companionName = "Aiko (AI-39)";

    [ObservableProperty]
    private string _vrmModelPath = "packages/ui/models/companion_vrm_v2.vrm";

    [ObservableProperty]
    private string _activeMood = "Joy";

    [ObservableProperty]
    private int _intimacyLevel = 89;

    [ObservableProperty]
    private int _batteryLevel = 94;

    [ObservableProperty]
    private bool _isFloatingPetActive;

    [ObservableProperty]
    private PhotoModePreset? _selectedPhotoPreset;

    [ObservableProperty]
    private string _feedbackMessage = "Aiko is happy and ready for pair programming!";

    public CompanionViewModel(CompanionState? state = null)
    {
        _state = state ?? DemoData.GetCompanionDemo();
        LoadState();
    }

    private void LoadState()
    {
        CompanionName = _state.CompanionName;
        VrmModelPath = _state.VrmModelPath;
        ActiveMood = _state.ActiveMood;
        IntimacyLevel = _state.IntimacyLevel;
        BatteryLevel = _state.BatteryLevel;
        IsFloatingPetActive = _state.IsFloatingPetActive;

        Moods.Clear();
        foreach (var m in _state.Moods)
        {
            Moods.Add(m);
        }

        Visemes.Clear();
        foreach (var v in _state.Visemes)
        {
            Visemes.Add(v);
        }

        PhotoPresets.Clear();
        foreach (var p in _state.PhotoPresets)
        {
            PhotoPresets.Add(p);
        }
        SelectedPhotoPreset = PhotoPresets.FirstOrDefault();
    }

    [RelayCommand]
    public void SetMood(CompanionMoodBadge mood)
    {
        ActiveMood = mood.Mood;
        FeedbackMessage = $"Mood changed to {mood.Mood}: {mood.Description}";
    }

    [RelayCommand]
    public void ToggleFloatingPet()
    {
        IsFloatingPetActive = !IsFloatingPetActive;
        FeedbackMessage = IsFloatingPetActive
            ? "Floating Desktop Pet popped out (always-on-top transparent overlay)."
            : "Desktop pet docked back into Companion Studio.";
    }

    [RelayCommand]
    public void SelectPhotoPreset(PhotoModePreset preset)
    {
        SelectedPhotoPreset = preset;
        FeedbackMessage = $"Applied photo mode preset: {preset.Name} ({preset.LightingPreset})";
    }

    [RelayCommand]
    public void TakePhotoSnapshot()
    {
        FeedbackMessage = $"Saved 4K VRM snapshot to ~/.superagent/captures/{CompanionName}_{System.DateTime.Now:yyyyMMdd_HHmmss}.png";
    }
}
