// MainWindow.xaml.cs - WinUI 3 Main Window Codebehind
using System;
using System.Collections.Specialized;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using SuperAgent.ViewModels;
using SuperAgent.Views;
using Windows.System;

namespace SuperAgent;

public sealed partial class MainWindow : Window
{
    public MainViewModel ViewModel { get; }

    public MainWindow()
    {
        ViewModel = new MainViewModel();
        this.InitializeComponent();

        ViewModel.ActiveMessages.CollectionChanged += ActiveMessages_CollectionChanged;
        ViewModel.PropertyChanged += ViewModel_PropertyChanged;

        _ = ViewModel.InitializeAsync();
    }

    private void ViewModel_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName is nameof(ViewModel.StreamingToken) or nameof(ViewModel.StreamingThought))
        {
            ScrollToBottom();
        }
    }

    private void ActiveMessages_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        ScrollToBottom();
    }

    private void ScrollToBottom()
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            ChatScrollViewer?.ChangeView(null, ChatScrollViewer.ScrollableHeight, null, false);
        });
    }

    private void NavView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.IsSettingsSelected)
        {
            ChatPageGrid.Visibility = Visibility.Collapsed;
            SettingsFrame.Visibility = Visibility.Visible;
            SettingsFrame.Navigate(typeof(SettingsPage), ViewModel);
        }
        else
        {
            SettingsFrame.Visibility = Visibility.Collapsed;
            ChatPageGrid.Visibility = Visibility.Visible;
        }
    }

    private async void SessionsListView_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (SessionsListView.SelectedItem is SessionItem selected)
        {
            SettingsFrame.Visibility = Visibility.Collapsed;
            ChatPageGrid.Visibility = Visibility.Visible;
            await ViewModel.SelectSessionAsync(selected.Id);
        }
    }

    private void ComposerInputBox_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Enter)
        {
            var isShiftDown = Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Shift)
                .HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);

            if (!isShiftDown)
            {
                e.Handled = true;
                _ = ViewModel.SendMessageAsync();
            }
        }
    }
}
