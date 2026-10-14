// ReplConsolePage.xaml.cs - WinUI 3 REPL Console Codebehind
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SuperAgent.ViewModels;

namespace SuperAgent.Views;

public sealed partial class ReplConsolePage : Page
{
    public ReplConsoleViewModel ViewModel { get; private set; }

    public ReplConsolePage()
    {
        ViewModel = new ReplConsoleViewModel();
        this.InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is ReplConsoleViewModel vm)
        {
            ViewModel = vm;
        }
        else if (e.Parameter is MainViewModel mainVm)
        {
            ViewModel = mainVm.ReplConsole;
        }
    }
}
