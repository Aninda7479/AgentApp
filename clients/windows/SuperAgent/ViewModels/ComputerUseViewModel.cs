// ComputerUseViewModel.cs - SuperAgent Windows Native WinUI 3
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SuperAgent.Core;

namespace SuperAgent.ViewModels;

public partial class ComputerUseViewModel : ObservableObject
{
    private readonly ComputerUseState _state;

    public ObservableCollection<WindowTargetItem> Windows { get; } = new();
    public ObservableCollection<MouseTrajectoryPoint> TrajectoryPoints { get; } = new();

    [ObservableProperty]
    private WindowTargetItem? _selectedWindow;

    [ObservableProperty]
    private AccessibilityTreeNode? _accessibilityRoot;

    [ObservableProperty]
    private AccessibilityTreeNode? _selectedNode;

    [ObservableProperty]
    private int _settlingRemainingMs;

    [ObservableProperty]
    private int _settlingTotalMs = 800;

    [ObservableProperty]
    private bool _isSettled = true;

    public bool IsSettling => !IsSettled;

    partial void OnIsSettledChanged(bool value)
    {
        OnPropertyChanged(nameof(IsSettling));
    }

    [ObservableProperty]
    private bool _isCapturing = true;

    [ObservableProperty]
    private int _captureFps = 30;

    [ObservableProperty]
    private string _statusBanner = "WGC Capture Ready (1920x1080 @ 30fps)";

    public ComputerUseViewModel(ComputerUseState? state = null)
    {
        _state = state ?? DemoData.GetComputerUseDemo();
        LoadState();
    }

    private void LoadState()
    {
        Windows.Clear();
        foreach (var win in _state.Windows)
        {
            Windows.Add(win);
        }
        SelectedWindow = _state.SelectedWindow ?? Windows.FirstOrDefault();

        AccessibilityRoot = _state.AccessibilityRoot;
        SelectedNode = AccessibilityRoot?.Children.FirstOrDefault()?.Children.FirstOrDefault();

        TrajectoryPoints.Clear();
        foreach (var pt in _state.TrajectoryPoints)
        {
            TrajectoryPoints.Add(pt);
        }

        SettlingRemainingMs = _state.SettlingRemainingMs;
        SettlingTotalMs = _state.SettlingTotalMs;
        IsSettled = _state.IsSettled;
    }

    [RelayCommand]
    public void SelectWindow(WindowTargetItem window)
    {
        SelectedWindow = window;
        StatusBanner = $"Target window set to: {window.Title} (HWND: 0x{window.Hwnd:X8})";
    }

    [RelayCommand]
    public async Task RefreshWindowsAsync()
    {
        StatusBanner = "Scanning desktop top-level windows via Win32 EnumWindows...";
        await Task.Delay(100);
        LoadState();
        StatusBanner = $"Discovered {Windows.Count} active desktop windows.";
    }

    [RelayCommand]
    public void SelectAccessibilityNode(AccessibilityTreeNode node)
    {
        SelectedNode = node;
        StatusBanner = $"Inspecting UI Element [{node.ElementIndex}]: {node.Role} - \"{node.Name}\"";
    }

    [RelayCommand]
    public async Task TriggerSettlingDelayAsync()
    {
        IsSettled = false;
        SettlingRemainingMs = SettlingTotalMs;
        while (SettlingRemainingMs > 0)
        {
            await Task.Delay(50);
            SettlingRemainingMs = System.Math.Max(0, SettlingRemainingMs - 50);
        }
        IsSettled = true;
        StatusBanner = "Adaptive settling complete. Screen stable for agent action.";
    }
}
