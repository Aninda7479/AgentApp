// ComputerUsePage.xaml.cs - WinUI 3 Computer Use Codebehind
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SuperAgent.ViewModels;

namespace SuperAgent.Views;

public sealed partial class ComputerUsePage : Page
{
    public ComputerUseViewModel ViewModel { get; private set; }

    public ComputerUsePage()
    {
        ViewModel = new ComputerUseViewModel();
        this.InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is ComputerUseViewModel vm)
        {
            ViewModel = vm;
        }
        else if (e.Parameter is MainViewModel mainVm)
        {
            ViewModel = mainVm.ComputerUse;
        }
    }
}
