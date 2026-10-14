// ValueConverters.cs - WinUI 3 Value Converters
using System;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Data;

namespace SuperAgent.Converters;

public class BoolToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }

    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is bool b)
        {
            var flag = Invert ? !b : b;
            return flag ? Visibility.Visible : Visibility.Collapsed;
        }
        return Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
    {
        if (value is Visibility v)
        {
            var flag = v == Visibility.Visible;
            return Invert ? !flag : flag;
        }
        return false;
    }
}

public class StringNotEmptyToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        return !string.IsNullOrWhiteSpace(value as string) ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
    {
        throw new NotImplementedException();
    }
}

public class ConnectionStatusColorConverter : IValueConverter
{
    private static readonly Microsoft.UI.Xaml.Media.SolidColorBrush ConnectedBrush = new(Windows.UI.Color.FromArgb(255, 16, 185, 129));
    private static readonly Microsoft.UI.Xaml.Media.SolidColorBrush DisconnectedBrush = new(Windows.UI.Color.FromArgb(255, 239, 68, 68));

    public object Convert(object value, Type targetType, object parameter, string language)
    {
        var isConnected = value is true;
        return isConnected ? ConnectedBrush : DisconnectedBrush;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
    {
        throw new NotImplementedException();
    }
}

public class ConnectionStatusTextConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        return value is true ? "Connected" : "Disconnected";
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
    {
        throw new NotImplementedException();
    }
}
