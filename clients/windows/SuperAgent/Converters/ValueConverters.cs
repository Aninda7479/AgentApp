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

public class HexToBrushConverter : IValueConverter
{
    private static readonly System.Collections.Generic.Dictionary<string, Microsoft.UI.Xaml.Media.SolidColorBrush> Cache = new(StringComparer.OrdinalIgnoreCase);

    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is string hex && !string.IsNullOrWhiteSpace(hex))
        {
            hex = hex.Trim().TrimStart('#');
            if (Cache.TryGetValue(hex, out var cached))
            {
                return cached;
            }

            try
            {
                byte a = 255;
                int start = 0;
                if (hex.Length == 8)
                {
                    a = System.Convert.ToByte(hex.Substring(0, 2), 16);
                    start = 2;
                }
                if (hex.Length >= start + 6)
                {
                    byte r = System.Convert.ToByte(hex.Substring(start, 2), 16);
                    byte g = System.Convert.ToByte(hex.Substring(start + 2, 2), 16);
                    byte b = System.Convert.ToByte(hex.Substring(start + 4, 2), 16);
                    var brush = new Microsoft.UI.Xaml.Media.SolidColorBrush(Windows.UI.Color.FromArgb(a, r, g, b));
                    Cache[hex] = brush;
                    return brush;
                }
            }
            catch
            {
                // Fallback to default
            }
        }
        return new Microsoft.UI.Xaml.Media.SolidColorBrush(Windows.UI.Color.FromArgb(255, 248, 250, 252));
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
    {
        throw new NotImplementedException();
    }
}

