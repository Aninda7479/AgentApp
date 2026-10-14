// TasksPage.xaml.cs - WinUI 3 Tasks Codebehind
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using SuperAgent.ViewModels;

namespace SuperAgent.Views;

public sealed partial class TasksPage : Page
{
    public TasksViewModel ViewModel { get; private set; }

    public TasksPage()
    {
        ViewModel = new TasksViewModel();
        this.InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is TasksViewModel vm)
        {
            ViewModel = vm;
        }
        else if (e.Parameter is MainViewModel mainVm)
        {
            ViewModel = mainVm.Tasks;
        }
    }
}
