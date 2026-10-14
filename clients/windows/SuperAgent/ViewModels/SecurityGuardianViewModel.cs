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
    [NotifyPropertyChangedFor(nameof(IsTierHandOff))]
    [NotifyPropertyChangedFor(nameof(IsTierAlwaysConfirm))]
    [NotifyPropertyChangedFor(nameof(IsTierPreApproval))]
    [NotifyPropertyChangedFor(nameof(IsTierNoConfirmation))]
    [NotifyPropertyChangedFor(nameof(ActiveTierTitle))]
    [NotifyPropertyChangedFor(nameof(ActiveTierDescription))]
    private SecurityTierLevel _activeTier = SecurityTierLevel.PreApproval;

    public bool IsTierHandOff => ActiveTier == SecurityTierLevel.HandOff;
    public bool IsTierAlwaysConfirm => ActiveTier == SecurityTierLevel.AlwaysConfirm;
    public bool IsTierPreApproval => ActiveTier == SecurityTierLevel.PreApproval;
    public bool IsTierNoConfirmation => ActiveTier == SecurityTierLevel.NoConfirmation;

    public string ActiveTierTitle => ActiveTier switch
    {
        SecurityTierLevel.HandOff => "Mode 1: Hand-Off Required (User Takeover)",
        SecurityTierLevel.AlwaysConfirm => "Mode 2: Always Confirm (Financial / Shell / Deletion)",
        SecurityTierLevel.PreApproval => "Mode 3: Pre-Approval Allowed (Login / Permissions)",
        SecurityTierLevel.NoConfirmation => "Mode 4: No Confirmation Needed (Cookie Banners)",
        _ => ActiveTier.ToString()
    };

    public string ActiveTierDescription => ActiveTier switch
    {
        SecurityTierLevel.HandOff => "Read-only observation. Mandates explicit human takeover for all write commands, navigations, form submissions, and coordinate clicks.",
        SecurityTierLevel.AlwaysConfirm => "Interactive modal confirmation mandated for high-risk operations: financial transactions, shell commands, file deletions, and credential transfers.",
        SecurityTierLevel.PreApproval => "Pre-authorizes planned execution steps; dynamically halts and prompts when deviating from approved plan or encountering elevated scopes.",
        SecurityTierLevel.NoConfirmation => "Fully autonomous background execution with zero prompts for non-destructive actions, cosmetic dismissals, and cookie consent banners.",
        _ => string.Empty
    };

    [ObservableProperty]
    private bool _isLockScreenArmed = true;

    partial void OnIsLockScreenArmedChanged(bool value)
    {
        ShieldStatus = value
            ? "WTS_SESSION_ACTIVE • CUALockScreenGuardian Armed (Zero Leaks)"
            : "WTS_SESSION_ACTIVE • CUALockScreenGuardian Standby (Auto-Freeze Disarmed)";
        ActionFeedback = value
            ? "CUALockScreenGuardian Watchdog armed: Continuous WTS_SESSION_ACTIVE sampling active. Input freeze armed on lock (Win+L / UAC)."
            : "CUALockScreenGuardian Watchdog disarmed: Automated input freeze disabled.";
    }

    [ObservableProperty]
    private string _shieldStatus = "WTS_SESSION_ACTIVE • CUALockScreenGuardian Armed (Zero Leaks)";

    [ObservableProperty]
    private string _wtsSessionStatus = "WTS_SESSION_ACTIVE (Session #1 • Unlocked)";

    [ObservableProperty]
    private string _topLevelOrigin = "https://store.target-vendor.com";

    [ObservableProperty]
    private string _credentialFrameOrigin = "https://auth.login-service.net/oauth/v2";

    [ObservableProperty]
    private string _formSubmissionOrigin = "https://store.target-vendor.com/checkout/submit";

    [ObservableProperty]
    private bool _isIframeMismatch = true;

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
        TopLevelOrigin = _state.TopLevelOrigin;
        CredentialFrameOrigin = _state.CredentialFrameOrigin;
        FormSubmissionOrigin = _state.FormSubmissionOrigin;

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
    public void SetTier(object? tierLevel)
    {
        if (tierLevel != null && int.TryParse(tierLevel.ToString(), out int val))
        {
            ActiveTier = (SecurityTierLevel)val;
            ActionFeedback = $"Security Shield HUD mode switched to: {ActiveTierTitle}";
        }
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
