//! GTK4 and Libadwaita Window View Layer for Linux Dedicated UI.
//!
//! Provides the primary application shell including `AdwApplicationWindow`,
//! `AdwHeaderBar`, `NavigationSplitView`, sidebar navigation across all 10 workspaces,
//! session management, and content stack views.

use std::sync::Arc;
use tokio::sync::RwLock;

use crate::client::daemon_client::DaemonClient;
use crate::state::{AppState, WorkspaceNav};

#[cfg(target_os = "linux")]
use gtk4::prelude::*;
#[cfg(target_os = "linux")]
use libadwaita as adw;
#[cfg(target_os = "linux")]
use libadwaita::prelude::*;

#[cfg(target_os = "linux")]
pub fn build_main_window(
    app: &adw::Application,
    client: DaemonClient,
    state: Arc<RwLock<AppState>>,
) -> adw::ApplicationWindow {
    // ─── Header Bar & Window Title ───────────────────────────────────────────
    let header_bar = adw::HeaderBar::new();
    let title = adw::WindowTitle::new("SuperAgent", "Dedicated Linux Client (GTK4 + Libadwaita)");
    header_bar.set_title_widget(Some(&title));

    // ─── Navigation Split View ───────────────────────────────────────────────
    let split_view = adw::NavigationSplitView::new();

    // ─── Sidebar: Workspaces & Sessions Navigation ───────────────────────────
    let sidebar_box = gtk4::Box::new(gtk4::Orientation::Vertical, 6);
    sidebar_box.set_margin_top(8);
    sidebar_box.set_margin_bottom(8);
    sidebar_box.set_margin_start(8);
    sidebar_box.set_margin_end(8);

    let workspaces_label = gtk4::Label::new(Some("WORKSPACES"));
    workspaces_label.set_xalign(0.0);
    workspaces_label.add_css_class("heading");
    workspaces_label.set_margin_start(4);
    workspaces_label.set_margin_top(4);
    sidebar_box.append(&workspaces_label);

    let workspace_list = gtk4::ListBox::new();
    workspace_list.add_css_class("navigation-sidebar");

    // All 10 workspace items
    for ws in WorkspaceNav::all() {
        let row = adw::ActionRow::new();
        row.set_title(ws.title());
        row.set_icon_name(Some(ws.icon_name()));
        workspace_list.append(&row);
    }

    let ws_scroll = gtk4::ScrolledWindow::new();
    ws_scroll.set_child(Some(&workspace_list));
    ws_scroll.set_min_content_height(260);

    let sep1 = gtk4::Separator::new(gtk4::Orientation::Horizontal);
    sep1.set_margin_top(4);
    sep1.set_margin_bottom(4);

    let sessions_label = gtk4::Label::new(Some("SESSIONS"));
    sessions_label.set_xalign(0.0);
    sessions_label.add_css_class("heading");
    sessions_label.set_margin_start(4);

    let new_chat_btn = gtk4::Button::with_label("+ New Chat");
    new_chat_btn.add_css_class("flat");
    new_chat_btn.add_css_class("accent");

    let session_list = gtk4::ListBox::new();
    session_list.add_css_class("navigation-sidebar");

    let session_scroll = gtk4::ScrolledWindow::new();
    session_scroll.set_child(Some(&session_list));
    session_scroll.set_vexpand(true);

    sidebar_box.append(&ws_scroll);
    sidebar_box.append(&sep1);
    sidebar_box.append(&sessions_label);
    sidebar_box.append(&new_chat_btn);
    sidebar_box.append(&session_scroll);

    let sidebar_page = adw::NavigationPage::new(&sidebar_box, "Navigation");
    split_view.set_sidebar(Some(&sidebar_page));

    // ─── Content: View Stack for all 10 Workspaces ───────────────────────────
    let view_stack = gtk4::Stack::new();
    view_stack.set_transition_type(gtk4::StackTransitionType::Crossfade);

    // 1. Chat View
    let chat_widget = crate::ui::chat_view::build_chat_view(client.clone(), state.clone());
    view_stack.add_titled(&chat_widget, Some("chat"), "Chat");

    // 2. Computer Use View
    let cu_widget = crate::ui::computer_use_view::build_computer_use_view(state.clone());
    view_stack.add_titled(&cu_widget, Some("computer_use"), "Computer Use");

    // 3. Browser Leasing View
    let br_widget = crate::ui::browser_view::build_browser_view(state.clone());
    view_stack.add_titled(&br_widget, Some("browser_leasing"), "Browser Leasing");

    // 4. Security Guardian View
    let sec_widget = crate::ui::security_view::build_security_view(state.clone());
    view_stack.add_titled(&sec_widget, Some("security_guardian"), "Security Guardian");

    // 5. REPL View
    let repl_widget = crate::ui::repl_view::build_repl_view(state.clone());
    view_stack.add_titled(&repl_widget, Some("repl"), "REPL");

    // 6. Companion View Placeholder
    let comp_box = gtk4::Box::new(gtk4::Orientation::Vertical, 12);
    comp_box.set_valign(gtk4::Align::Center);
    comp_box.set_halign(gtk4::Align::Center);
    let comp_icon = gtk4::Image::from_icon_name("avatar-default-symbolic");
    comp_icon.set_pixel_size(64);
    let comp_lbl = gtk4::Label::new(Some(
        "3D Companion & VRM Studio\nInteractive desktop pet and voice companion",
    ));
    comp_lbl.set_justify(gtk4::Justification::Center);
    comp_box.append(&comp_icon);
    comp_box.append(&comp_lbl);
    view_stack.add_titled(&comp_box, Some("companion"), "Companion");

    // 7. Creative View Placeholder
    let creative_box = gtk4::Box::new(gtk4::Orientation::Vertical, 12);
    creative_box.set_valign(gtk4::Align::Center);
    creative_box.set_halign(gtk4::Align::Center);
    let cr_icon = gtk4::Image::from_icon_name("image-x-generic-symbolic");
    cr_icon.set_pixel_size(64);
    let cr_lbl = gtk4::Label::new(Some(
        "Creative Studio\nGenerative Image & Video Diffusion Pipelines",
    ));
    cr_lbl.set_justify(gtk4::Justification::Center);
    creative_box.append(&cr_icon);
    creative_box.append(&cr_lbl);
    view_stack.add_titled(&creative_box, Some("creative"), "Creative");

    // 8. Hardware View Placeholder
    let hw_box = gtk4::Box::new(gtk4::Orientation::Vertical, 12);
    hw_box.set_valign(gtk4::Align::Center);
    hw_box.set_halign(gtk4::Align::Center);
    let hw_icon = gtk4::Image::from_icon_name("circuit-symbolic");
    hw_icon.set_pixel_size(64);
    let hw_lbl = gtk4::Label::new(Some(
        "Hardware & PCB ECAD\nKiCad Schematics, Layout & 3D Gerber Inspection",
    ));
    hw_lbl.set_justify(gtk4::Justification::Center);
    hw_box.append(&hw_icon);
    hw_box.append(&hw_lbl);
    view_stack.add_titled(&hw_box, Some("hardware"), "Hardware");

    // 9. Tasks View Placeholder
    let tasks_box = gtk4::Box::new(gtk4::Orientation::Vertical, 12);
    tasks_box.set_valign(gtk4::Align::Center);
    tasks_box.set_halign(gtk4::Align::Center);
    let tasks_icon = gtk4::Image::from_icon_name("view-list-bullet-symbolic");
    tasks_icon.set_pixel_size(64);
    let tasks_lbl = gtk4::Label::new(Some(
        "Tasks & Scheduled Routines\nKanban Board & Cron Background Automations",
    ));
    tasks_lbl.set_justify(gtk4::Justification::Center);
    tasks_box.append(&tasks_icon);
    tasks_box.append(&tasks_lbl);
    view_stack.add_titled(&tasks_box, Some("tasks"), "Tasks");

    // 10. Settings & System Doctor View
    let set_widget = crate::ui::settings_view::build_settings_view(state.clone());
    view_stack.add_titled(&set_widget, Some("settings"), "Settings");

    // Wire sidebar item activation to stack switching
    let stack_clone = view_stack.clone();
    let state_ws = state.clone();
    workspace_list.connect_row_activated(move |_, row| {
        let index = row.index() as usize;
        let all_ws = WorkspaceNav::all();
        if let Some(target_ws) = all_ws.get(index) {
            let page_name = match target_ws {
                WorkspaceNav::Chat => "chat",
                WorkspaceNav::ComputerUse => "computer_use",
                WorkspaceNav::BrowserLeasing => "browser_leasing",
                WorkspaceNav::SecurityGuardian => "security_guardian",
                WorkspaceNav::Repl => "repl",
                WorkspaceNav::Companion => "companion",
                WorkspaceNav::Creative => "creative",
                WorkspaceNav::Hardware => "hardware",
                WorkspaceNav::Tasks => "tasks",
                WorkspaceNav::Settings => "settings",
            };
            stack_clone.set_visible_child_name(page_name);

            let s = state_ws.clone();
            let tws = *target_ws;
            glib::MainContext::default().spawn_local(async move {
                let mut guard = s.write().await;
                guard.switch_workspace(tws);
            });
        }
    });

    let content_page = adw::NavigationPage::new(&view_stack, "Main Stage");
    split_view.set_content(Some(&content_page));

    // ─── Application Window Container ────────────────────────────────────────
    let toolbar_view = adw::ToolbarView::new();
    toolbar_view.add_top_bar(&header_bar);
    toolbar_view.set_content(Some(&split_view));

    let window = adw::ApplicationWindow::builder()
        .application(app)
        .title("SuperAgent")
        .default_width(1280)
        .default_height(800)
        .content(&toolbar_view)
        .build();

    window
}

#[cfg(not(target_os = "linux"))]
#[derive(Debug, Clone, Default)]
pub struct LinuxUiStub;

#[cfg(not(target_os = "linux"))]
impl LinuxUiStub {
    pub fn description() -> &'static str {
        "SuperAgent Linux Dedicated UI (GTK4 + Libadwaita). Native view layer active on target_os = \"linux\"."
    }

    pub fn workspace_count() -> usize {
        WorkspaceNav::all().len()
    }

    pub fn supported_workspaces() -> &'static [WorkspaceNav] {
        WorkspaceNav::all()
    }

    pub fn verify_shell_architecture() -> bool {
        WorkspaceNav::all().len() == 10
    }
}

/// Runs the GTK4 / Libadwaita application loop.
pub fn run_gtk_app(client: DaemonClient, state: Arc<RwLock<AppState>>) -> i32 {
    #[cfg(target_os = "linux")]
    {
        let app = adw::Application::builder()
            .application_id("com.superagent.linux")
            .build();

        let client_clone = client.clone();
        let state_clone = state.clone();

        app.connect_activate(move |application| {
            let window = build_main_window(application, client_clone.clone(), state_clone.clone());
            window.present();
        });

        app.run().into()
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = (client, state);
        println!("{}", LinuxUiStub::description());
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ui_stub_or_linux_declaration() {
        #[cfg(not(target_os = "linux"))]
        {
            assert!(LinuxUiStub::description().contains("GTK4 + Libadwaita"));
            assert_eq!(LinuxUiStub::workspace_count(), 10);
            assert!(LinuxUiStub::verify_shell_architecture());
            assert_eq!(LinuxUiStub::supported_workspaces().len(), 10);
        }
    }

    #[test]
    fn test_all_10_workspaces_in_shell() {
        let workspaces = WorkspaceNav::all();
        assert_eq!(workspaces.len(), 10);

        // Verify all 10 required workspaces
        assert_eq!(workspaces[0], WorkspaceNav::Chat);
        assert_eq!(workspaces[1], WorkspaceNav::ComputerUse);
        assert_eq!(workspaces[2], WorkspaceNav::BrowserLeasing);
        assert_eq!(workspaces[3], WorkspaceNav::SecurityGuardian);
        assert_eq!(workspaces[4], WorkspaceNav::Repl);
        assert_eq!(workspaces[5], WorkspaceNav::Companion);
        assert_eq!(workspaces[6], WorkspaceNav::Creative);
        assert_eq!(workspaces[7], WorkspaceNav::Hardware);
        assert_eq!(workspaces[8], WorkspaceNav::Tasks);
        assert_eq!(workspaces[9], WorkspaceNav::Settings);

        for ws in workspaces {
            assert!(!ws.title().is_empty());
            assert!(!ws.icon_name().is_empty());
        }
    }

    #[test]
    fn test_ui_descriptors_integration() {
        let state = AppState::new();

        let chat_desc = crate::ui::chat_view::ChatViewDescriptor::new();
        assert!(chat_desc.shows_trajectory);

        let cu_desc = crate::ui::computer_use_view::ComputerUseViewDescriptor::from_state(&state);
        assert_eq!(cu_desc.detected_windows_count, 4);

        let br_desc = crate::ui::browser_view::BrowserViewDescriptor::from_state(&state);
        assert_eq!(br_desc.claimed_tabs_count, 2);

        let sec_desc = crate::ui::security_view::SecurityViewDescriptor::from_state(&state);
        assert!(sec_desc.is_shield_armed);

        let repl_desc = crate::ui::repl_view::ReplViewDescriptor::from_state(&state);
        assert_eq!(repl_desc.variable_count, 3);

        let set_desc = crate::ui::settings_view::SettingsViewDescriptor::from_state(&state);
        assert_eq!(set_desc.total_modules_count, 24);
        assert_eq!(set_desc.doctor_probes_count, 6);
    }
}
