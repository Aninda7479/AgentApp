// BrowserLeasingPage.xaml.cs - WinUI 3 Browser Leasing Codebehind
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SuperAgent.ViewModels;

namespace SuperAgent.Views;

public sealed partial class BrowserLeasingPage : Page
{
    public BrowserLeasingViewModel ViewModel { get; private set; }

    public BrowserLeasingPage()
    {
        ViewModel = new BrowserLeasingViewModel();
        this.DataContext = ViewModel;
        this.InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is BrowserLeasingViewModel vm)
        {
            ViewModel = vm;
            this.DataContext = ViewModel;
        }
        else if (e.Parameter is MainViewModel mainVm)
        {
            ViewModel = mainVm.BrowserLeasing;
            this.DataContext = ViewModel;
        }
    }
}
