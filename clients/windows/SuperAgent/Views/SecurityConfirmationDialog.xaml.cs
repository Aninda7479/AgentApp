// SecurityConfirmationDialog.xaml.cs - WinUI 3 Security Dialog Codebehind
using Microsoft.UI.Xaml.Controls;
using SuperAgent.ViewModels;

namespace SuperAgent.Views;

public sealed partial class SecurityConfirmationDialog : ContentDialog
{
    public SecurityGuardianViewModel ViewModel { get; }

    public SecurityConfirmationDialog(SecurityGuardianViewModel? vm = null)
    {
        ViewModel = vm ?? new SecurityGuardianViewModel();
        this.InitializeComponent();
    }
}
