// SecurityGuardianViewModel.cs - SuperAgent Windows Native WinUI 3
using System.Collections.ObjectModel;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SuperAgent.Core;

namespace SuperAgent.ViewModels;

public partial class SecurityGuardianViewModel : ObservableObject
{
    private readonly SecurityGuardianState _state;

    public ObservableCollection<ZoSecurityDecisionBadge> Badges { get; } = new();
    public ObservableCollection<CredentialRecoveryBranch> RecoveryBranches { get; } = new();

    [ObservableProperty]
    private SecurityTierLevel _activeTier = SecurityTierLevel.PreApproval;

    [ObservableProperty]
    private bool _isLockScreenArmed = true;

    [ObservableProperty]
    private string _shieldStatus = "LockScreen Guardian Active (0 Violations)";

    [ObservableProperty]
    private ZoSecurityDecisionBadge? _selectedBadge;

    [ObservableProperty]
    private CredentialRecoveryBranch? _selectedBranch;

    [ObservableProperty]
    private string _actionFeedback = "Security sandbox ready. 16 zo decision vectors loaded.";

    public SecurityGuardianViewModel(SecurityGuardianState? state = null)
    {
        _state = state ?? DemoData.GetSecurityGuardianDemo();
        LoadState();
    }

    private void LoadState()
    {
        ActiveTier = _state.ActiveTier;
        IsLockScreenArmed = _state.IsLockScreenArmed;
        ShieldStatus = _state.ShieldStatus;

        Badges.Clear();
        foreach (var b in _state.AllBadges)
        {
            Badges.Add(b);
        }
        SelectedBadge = _state.ActiveDecision ?? Badges.FirstOrDefault();

        RecoveryBranches.Clear();
        foreach (var br in _state.RecoveryBranches)
        {
            RecoveryBranches.Add(br);
        }
        SelectedBranch = RecoveryBranches.FirstOrDefault();
    }

    [RelayCommand]
    public void SetTier(int tierLevel)
    {
        ActiveTier = (SecurityTierLevel)tierLevel;
        ActionFeedback = $"Active confirmation tier switched to: {ActiveTier}";
    }

    [RelayCommand]
    public void ToggleLockScreen()
    {
        IsLockScreenArmed = !IsLockScreenArmed;
        ShieldStatus = IsLockScreenArmed
            ? "LockScreen Guardian Active (Armed)"
            : "LockScreen Guardian Standby (Disarmed)";
        ActionFeedback = $"LockScreen guardian {(IsLockScreenArmed ? "armed" : "disarmed")}.";
    }

    [RelayCommand]
    public void SelectBadge(ZoSecurityDecisionBadge badge)
    {
        SelectedBadge = badge;
        ActionFeedback = $"Inspecting zo rule {badge.StateCode:D2}: {badge.Label} [{badge.Severity}]";
    }

    [RelayCommand]
    public void SelectBranch(CredentialRecoveryBranch branch)
    {
        SelectedBranch = branch;
        ActionFeedback = $"Selected Vault Recovery Branch #{branch.BranchId}: {branch.ActionName}";
    }

    [RelayCommand]
    public void ExecuteRecovery(CredentialRecoveryBranch branch)
    {
        ActionFeedback = $"Initiated protocol: {branch.ActionName} [{branch.RiskRating}]";
    }
}
