// SecurityGuardianPage.xaml.cs - WinUI 3 Security Guardian Codebehind
using System;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SuperAgent.ViewModels;

namespace SuperAgent.Views;

public sealed partial class SecurityGuardianPage : Page
{
    public SecurityGuardianViewModel ViewModel { get; private set; }

    public SecurityGuardianPage()
    {
        ViewModel = new SecurityGuardianViewModel();
        this.InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is SecurityGuardianViewModel vm)
        {
            ViewModel = vm;
        }
        else if (e.Parameter is MainViewModel mainVm)
        {
            ViewModel = mainVm.SecurityGuardian;
        }
    }

    private async void OpenDialogButton_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SecurityConfirmationDialog(ViewModel)
        {
            XamlRoot = this.XamlRoot
        };
        await dialog.ShowAsync();
    }
}
