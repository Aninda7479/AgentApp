// SettingsPage.xaml.cs - WinUI 3 Settings Page Codebehind
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SuperAgent.ViewModels;

namespace SuperAgent.Views;

public sealed partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel { get; private set; }
    private MainViewModel? _mainViewModel;

    public SettingsPage()
    {
        ViewModel = new SettingsViewModel();
        this.InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is SettingsViewModel vm)
        {
            ViewModel = vm;
        }
        else if (e.Parameter is MainViewModel mainVm)
        {
            _mainViewModel = mainVm;
            ViewModel = mainVm.Settings;
            ViewModel.DaemonPort = mainVm.DaemonPort;
        }
    }

    private void CategoryFilter_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string category)
        {
            ViewModel.FilterCategory = category;
        }
    }

    private async void ReconnectButton_Click(object sender, RoutedEventArgs e)
    {
        if (_mainViewModel != null)
        {
            _mainViewModel.DaemonPort = ViewModel.DaemonPort;
            await _mainViewModel.ReconnectAsync();
            ViewModel.FeedbackMessage = $"Reconnected daemon on port {ViewModel.DaemonPort}.";
        }
        else
        {
            ViewModel.FeedbackMessage = $"Simulated daemon connection check on port {ViewModel.DaemonPort}: Online.";
        }
    }
}
