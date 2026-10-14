// BrowserLeasingViewModel.cs - SuperAgent Windows Native WinUI 3
using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SuperAgent.Core;

namespace SuperAgent.ViewModels;

public partial class BrowserLeasingViewModel : ObservableObject
{
    private readonly BrowserLeasingState _state;

    public ObservableCollection<BrowserLeaseTab> ActiveTabs { get; } = new();
    public ObservableCollection<WebMcpTool> Tools { get; } = new();
    public ObservableCollection<CdpStreamEvent> CdpEvents { get; } = new();

    [ObservableProperty]
    private BrowserLeaseTab? _selectedTab;

    [ObservableProperty]
    private string _newTabUrl = "https://github.com";

    [ObservableProperty]
    private string _selectedTier = "createTab"; // claimExistingTab or createTab

    [ObservableProperty]
    private string _statusText = "WebMCP In-Page Bridge Active. 2 tabs currently leased.";

    public BrowserLeasingViewModel(BrowserLeasingState? state = null)
    {
        _state = state ?? DemoData.GetBrowserLeasingDemo();
        LoadState();
    }

    private void LoadState()
    {
        ActiveTabs.Clear();
        foreach (var tab in _state.ActiveTabs)
        {
            ActiveTabs.Add(tab);
        }
        SelectedTab = ActiveTabs.FirstOrDefault();

        Tools.Clear();
        foreach (var tool in _state.Tools)
        {
            Tools.Add(tool);
        }

        CdpEvents.Clear();
        foreach (var ev in _state.CdpEvents)
        {
            CdpEvents.Add(ev);
        }
    }

    [RelayCommand]
    public void SelectTab(BrowserLeaseTab tab)
    {
        SelectedTab = tab;
        StatusText = $"Selected lease: {tab.Title} ({tab.RemainingSeconds}s remaining)";
    }

    [RelayCommand]
    public void LeaseNewTab()
    {
        var newTab = new BrowserLeaseTab
        {
            Tier = SelectedTier,
            Url = string.IsNullOrWhiteSpace(NewTabUrl) ? "https://github.com" : NewTabUrl.Trim(),
            Title = SelectedTier == "claimExistingTab" ? "Claimed Tab: " + NewTabUrl : "Sandbox: " + NewTabUrl,
            RemainingSeconds = 300,
            TotalSeconds = 300,
            Status = "leased",
            HasDomBadge = true,
            DomBadgeText = "SuperAgent Active Lease"
        };

        ActiveTabs.Insert(0, newTab);
        SelectedTab = newTab;

        CdpEvents.Insert(0, new CdpStreamEvent
        {
            Method = "Target.createTarget",
            Direction = "SEND",
            PayloadSummary = $"{{\"url\":\"{newTab.Url}\",\"tier\":\"{newTab.Tier}\"}}"
        });

        StatusText = $"Successfully leased tab via {SelectedTier}: {newTab.Url}";
    }

    [RelayCommand]
    public void ReleaseLease(BrowserLeaseTab tab)
    {
        ActiveTabs.Remove(tab);
        CdpEvents.Insert(0, new CdpStreamEvent
        {
            Method = "Target.closeTarget",
            Direction = "SEND",
            PayloadSummary = $"{{\"targetId\":\"{tab.Id}\"}}"
        });
        StatusText = $"Released lease for tab: {tab.Title}";
    }

    [RelayCommand]
    public void ClearCdpEvents()
    {
        CdpEvents.Clear();
        StatusText = "CDP event stream buffer cleared.";
    }
}
