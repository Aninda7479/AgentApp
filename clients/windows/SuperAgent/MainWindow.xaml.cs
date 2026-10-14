// MainWindow.xaml.cs - WinUI 3 Main Window Codebehind
using System;
using System.Collections.Specialized;
using System.Linq;
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
            NavigateToWorkspace("Settings");
            return;
        }

        if (args.SelectedItem is NavigationViewItem item && item.Tag is string tag)
        {
            NavigateToWorkspace(tag);
        }
    }

    private void NavigateToWorkspace(string workspaceTag)
    {
        ViewModel.ActiveWorkspace = workspaceTag;

        if (workspaceTag == "Chat")
        {
            WorkspaceFrame.Visibility = Visibility.Collapsed;
            ChatPageGrid.Visibility = Visibility.Visible;
            return;
        }

        ChatPageGrid.Visibility = Visibility.Collapsed;
        WorkspaceFrame.Visibility = Visibility.Visible;

        Type? pageType = workspaceTag switch
        {
            "ComputerUse" => typeof(ComputerUsePage),
            "BrowserLeasing" => typeof(BrowserLeasingPage),
            "ReplConsole" => typeof(ReplConsolePage),
            "SecurityGuardian" => typeof(SecurityGuardianPage),
            "Companion" => typeof(CompanionPage),
            "CreativeStudio" => typeof(CreativeStudioPage),
            "PcbEcad" => typeof(PcbEcadPage),
            "Tasks" => typeof(TasksPage),
            "Settings" => typeof(SettingsPage),
            _ => null
        };

        if (pageType != null)
        {
            WorkspaceFrame.Navigate(pageType, ViewModel);
        }
    }

    private async void SessionsListView_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (SessionsListView.SelectedItem is SessionItem selected)
        {
            NavigateToWorkspace("Chat");

            // Sync NavView selection back to Chat
            if (NavView.MenuItems.OfType<NavigationViewItem>().FirstOrDefault(i => (string?)i.Tag == "Chat") is { } chatItem)
            {
                NavView.SelectedItem = chatItem;
            }

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
