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

    public static Microsoft.UI.Xaml.Media.SolidColorBrush HexToBrush(string? hex)
    {
        if (string.IsNullOrWhiteSpace(hex)) return new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Transparent);
        hex = hex.Trim().TrimStart('#');
        try
        {
            if (hex.Length == 6)
            {
                byte r = System.Convert.ToByte(hex[..2], 16);
                byte g = System.Convert.ToByte(hex[2..4], 16);
                byte b = System.Convert.ToByte(hex[4..6], 16);
                return new Microsoft.UI.Xaml.Media.SolidColorBrush(Windows.UI.Color.FromArgb(255, r, g, b));
            }
            else if (hex.Length == 8)
            {
                byte a = System.Convert.ToByte(hex[..2], 16);
                byte r = System.Convert.ToByte(hex[2..4], 16);
                byte g = System.Convert.ToByte(hex[4..6], 16);
                byte b = System.Convert.ToByte(hex[6..8], 16);
                return new Microsoft.UI.Xaml.Media.SolidColorBrush(Windows.UI.Color.FromArgb(a, r, g, b));
            }
        }
        catch
        {
        }
        return new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.SlateGray);
    }
}
