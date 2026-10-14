// PcbEcadPage.xaml.cs - WinUI 3 PCB ECAD Codebehind
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SuperAgent.ViewModels;

namespace SuperAgent.Views;

public sealed partial class PcbEcadPage : Page
{
    public PcbEcadViewModel ViewModel { get; private set; }

    public PcbEcadPage()
    {
        ViewModel = new PcbEcadViewModel();
        this.InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is PcbEcadViewModel vm)
        {
            ViewModel = vm;
        }
        else if (e.Parameter is MainViewModel mainVm)
        {
            ViewModel = mainVm.PcbEcad;
        }
    }
}
