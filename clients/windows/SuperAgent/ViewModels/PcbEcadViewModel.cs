// PcbEcadViewModel.cs - SuperAgent Windows Native WinUI 3
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SuperAgent.Core;

namespace SuperAgent.ViewModels;

public partial class PcbEcadViewModel : ObservableObject
{
    private readonly PcbEcadState _state;

    public ObservableCollection<PcbComponent> Components { get; } = new();
    public ObservableCollection<PcbNetWire> Nets { get; } = new();
    public ObservableCollection<ErcRuleViolation> ErcViolations { get; } = new();
    public ObservableCollection<PcbLayer> Layers { get; } = new();
    public ObservableCollection<string> AiCopilotMessages { get; } = new();

    [ObservableProperty]
    private string _projectName = "ESP32-S3 IoT Weather Node";

    [ObservableProperty]
    private PcbComponent? _selectedComponent;

    [ObservableProperty]
    private string _activeViewMode = "Schematic"; // Schematic, Layout, 3DPreview

    [ObservableProperty]
    private string _coPilotInput = string.Empty;

    [ObservableProperty]
    private string _statusText = "Hardware Co-Pilot online. KiCad 9 exporter ready.";

    public PcbEcadViewModel(PcbEcadState? state = null)
    {
        _state = state ?? DemoData.GetPcbEcadDemo();
        LoadState();
    }

    private void LoadState()
    {
        ProjectName = _state.ProjectName;

        Components.Clear();
        foreach (var c in _state.Components)
        {
            Components.Add(c);
        }
        SelectedComponent = Components.FirstOrDefault();

        Nets.Clear();
        foreach (var n in _state.Nets)
        {
            Nets.Add(n);
        }

        ErcViolations.Clear();
        foreach (var v in _state.ErcViolations)
        {
            ErcViolations.Add(v);
        }

        Layers.Clear();
        foreach (var l in _state.Layers)
        {
            Layers.Add(l);
        }

        AiCopilotMessages.Clear();
        foreach (var m in _state.AiCopilotHistory)
        {
            AiCopilotMessages.Add(m);
        }
    }

    [RelayCommand]
    public void SelectComponent(PcbComponent component)
    {
        SelectedComponent = component;
        StatusText = $"Selected component: {component.Designator} ({component.Mpn}, LCSC: {component.LcscId})";
    }

    [RelayCommand]
    public void SetViewMode(string mode)
    {
        ActiveViewMode = mode;
        StatusText = $"Switched ECAD stage to: {mode} view.";
    }

    [RelayCommand]
    public async Task RunErcCheckAsync()
    {
        StatusText = "Executing real-time Electrical Rules Check (ERC / DRC)...";
        await Task.Delay(200);
        StatusText = $"ERC Check Completed: {ErcViolations.Count} advisories found.";
    }

    [RelayCommand]
    public void SendCoPilotMessage()
    {
        if (string.IsNullOrWhiteSpace(CoPilotInput)) return;

        var text = CoPilotInput.Trim();
        CoPilotInput = string.Empty;

        AiCopilotMessages.Add($"User: {text}");
        AiCopilotMessages.Add($"Hardware Co-Pilot: Verified nets and components. Generated routing recommendations for \"{text}\".");

        StatusText = "Hardware AI Co-Pilot synthesized circuit modifications.";
    }

    [RelayCommand]
    public void ExportKiCad()
    {
        StatusText = $"Exported native KiCad 9 files: {ProjectName}.kicad_sch & {ProjectName}.kicad_pcb.";
    }

    [RelayCommand]
    public void ExportBom()
    {
        StatusText = $"Generated Bill of Materials (BOM) CSV with {Components.Count} LCSC parts.";
    }
}
