// CreativeStudioPage.xaml.cs - WinUI 3 Creative Studio Codebehind
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SuperAgent.ViewModels;

namespace SuperAgent.Views;

public sealed partial class CreativeStudioPage : Page
{
    public CreativeStudioViewModel ViewModel { get; private set; }

    public CreativeStudioPage()
    {
        ViewModel = new CreativeStudioViewModel();
        this.InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is CreativeStudioViewModel vm)
        {
            ViewModel = vm;
        }
        else if (e.Parameter is MainViewModel mainVm)
        {
            ViewModel = mainVm.CreativeStudio;
        }
    }
}
