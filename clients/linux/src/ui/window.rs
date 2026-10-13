//! GTK4 and Libadwaita Window View Layer for Linux Dedicated UI.
//!
//! Provides the primary application shell including `AdwApplicationWindow`,
//! `AdwHeaderBar`, `NavigationSplitView`, chat messages list view, and composer.

use std::sync::Arc;
use tokio::sync::RwLock;

use crate::client::daemon_client::DaemonClient;
use crate::state::AppState;

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
    let title = adw::WindowTitle::new("SuperAgent", "Autonomous Agent (GTK4 + Libadwaita)");
    header_bar.set_title_widget(Some(&title));

    // ─── Navigation Split View ───────────────────────────────────────────────
    let split_view = adw::NavigationSplitView::new();

    // ─── Sidebar: Sessions Navigation ────────────────────────────────────────
    let sidebar_box = gtk4::Box::new(gtk4::Orientation::Vertical, 6);
    sidebar_box.set_margin_top(8);
    sidebar_box.set_margin_bottom(8);
    sidebar_box.set_margin_start(8);
    sidebar_box.set_margin_end(8);

    let new_chat_btn = gtk4::Button::with_label("+ New Chat");
    new_chat_btn.add_css_class("flat");
    new_chat_btn.add_css_class("accent");

    let session_list = gtk4::ListBox::new();
    session_list.add_css_class("navigation-sidebar");

    let session_scroll = gtk4::ScrolledWindow::new();
    session_scroll.set_child(Some(&session_list));
    session_scroll.set_vexpand(true);

    sidebar_box.append(&new_chat_btn);
    sidebar_box.append(&session_scroll);

    let sidebar_page = adw::NavigationPage::new(&sidebar_box, "Sessions");
    split_view.set_sidebar(Some(&sidebar_page));

    // ─── Content: Chat Stream & Composer ─────────────────────────────────────
    let content_box = gtk4::Box::new(gtk4::Orientation::Vertical, 6);

    let message_list = gtk4::ListBox::new();
    message_list.set_selection_mode(gtk4::SelectionMode::None);
    message_list.add_css_class("boxed-list");

    let message_scroll = gtk4::ScrolledWindow::new();
    message_scroll.set_child(Some(&message_list));
    message_scroll.set_vexpand(true);
    message_scroll.set_margin_start(12);
    message_scroll.set_margin_end(12);
    message_scroll.set_margin_top(8);

    let sep = gtk4::Separator::new(gtk4::Orientation::Horizontal);

    // Composer input bar
    let composer_box = gtk4::Box::new(gtk4::Orientation::Horizontal, 8);
    composer_box.set_margin_top(8);
    composer_box.set_margin_bottom(12);
    composer_box.set_margin_start(12);
    composer_box.set_margin_end(12);

    let entry = gtk4::Entry::new();
    entry.set_placeholder_text(Some("Ask SuperAgent anything..."));
    entry.set_hexpand(true);

    let send_btn = gtk4::Button::with_label("Send");
    send_btn.add_css_class("suggested-action");

    composer_box.append(&entry);
    composer_box.append(&send_btn);

    content_box.append(&message_scroll);
    content_box.append(&sep);
    content_box.append(&composer_box);

    let content_page = adw::NavigationPage::new(&content_box, "Chat");
    split_view.set_content(Some(&content_page));

    // ─── Application Window Container ────────────────────────────────────────
    let toolbar_view = adw::ToolbarView::new();
    toolbar_view.add_top_bar(&header_bar);
    toolbar_view.set_content(Some(&split_view));

    let window = adw::ApplicationWindow::builder()
        .application(app)
        .title("SuperAgent")
        .default_width(1100)
        .default_height(750)
        .content(&toolbar_view)
        .build();

    // Wire send action
    let client_clone = client.clone();
    let state_clone = state.clone();
    let entry_clone = entry.clone();
    send_btn.connect_clicked(move |_| {
        let text = entry_clone.text().to_string();
        if text.trim().is_empty() {
            return;
        }
        entry_clone.set_text("");

        let c = client_clone.clone();
        let s = state_clone.clone();
        glib::MainContext::default().spawn_local(async move {
            let active_id = {
                let mut guard = s.write().await;
                let sid = guard
                    .active_session_id
                    .clone()
                    .unwrap_or_else(|| "default-session".to_string());
                guard.add_user_message(&sid, &text);
                sid
            };

            let run_req = superagent_core_v2::protocol::dtos::AgentRunRequest {
                session_id: active_id,
                prompt: text,
                config: None,
                current_attachments: None,
            };

            let _ = c.agent_run(&run_req).await;
        });
    });

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
        }
    }
}
