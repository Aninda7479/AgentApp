// CompanionPage.xaml.cs - WinUI 3 Companion Codebehind
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SuperAgent.ViewModels;

namespace SuperAgent.Views;

public sealed partial class CompanionPage : Page
{
    public CompanionViewModel ViewModel { get; private set; }

    public CompanionPage()
    {
        ViewModel = new CompanionViewModel();
        this.InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is CompanionViewModel vm)
        {
            ViewModel = vm;
        }
        else if (e.Parameter is MainViewModel mainVm)
        {
            ViewModel = mainVm.Companion;
        }
    }
}
