// SettingsPage.xaml.cs - WinUI 3 Settings Page Codebehind
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SuperAgent.ViewModels;

namespace SuperAgent.Views;

public sealed partial class SettingsPage : Page
{
    private MainViewModel? _viewModel;

    public SettingsPage()
    {
        this.InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is MainViewModel vm)
        {
            _viewModel = vm;
            PortTextBox.Text = vm.DaemonPort.ToString();
        }
    }

    private async void ReconnectButton_Click(object sender, RoutedEventArgs e)
    {
        if (_viewModel != null)
        {
            if (int.TryParse(PortTextBox.Text, out var port))
            {
                _viewModel.DaemonPort = port;
            }
            await _viewModel.ReconnectAsync();
        }
    }
}
