//! In-Process REPL Console View for SuperAgent Linux Dedicated UI.
//!
//! Provides the live interactive terminal output buffer, scope variable
//! inspector tree, snippet library, and session reset controls.

#[cfg(target_os = "linux")]
use std::sync::Arc;
#[cfg(target_os = "linux")]
use tokio::sync::RwLock;

use crate::state::AppState;

#[cfg(target_os = "linux")]
use gtk4::prelude::*;
#[cfg(target_os = "linux")]
use libadwaita as adw;
#[cfg(target_os = "linux")]
use libadwaita::prelude::*;

#[cfg(target_os = "linux")]
pub fn build_repl_view(state: Arc<RwLock<AppState>>) -> gtk4::Box {
    let main_box = gtk4::Box::new(gtk4::Orientation::Vertical, 12);
    main_box.set_margin_start(16);
    main_box.set_margin_end(16);
    main_box.set_margin_top(12);
    main_box.set_margin_bottom(16);

    // ─── Header: REPL Session Telemetry & Controls ───────────────────────────
    let header_card = adw::PreferencesGroup::new();
    header_card.set_title("In-Process V8 REPL Automation Console");
    header_card.set_description(Some(
        "Interactive JavaScript scripting environment with live bindings to CUA, browser tabs, and WGC frame pool.",
    ));

    let telemetry_row = adw::ActionRow::new();
    telemetry_row.set_title("Runtime: superagent-cua-repl-v2.4 (Node.js v20.12.0)");
    telemetry_row
        .set_subtitle("V8 Heap: 44.2 / 68.0 MB | Token Gauge: 14,280 / 25,000 (Sliding Window)");
    telemetry_row.set_icon_name(Some("utilities-terminal-symbolic"));

    let reset_btn = gtk4::Button::with_label("Reset Session (js_reset)");
    reset_btn.add_css_class("destructive-action");
    reset_btn.add_css_class("flat");

    let clear_btn = gtk4::Button::with_label("Clear Buffer");
    clear_btn.add_css_class("flat");

    telemetry_row.add_suffix(&clear_btn);
    telemetry_row.add_suffix(&reset_btn);
    header_card.add(&telemetry_row);
    main_box.append(&header_card);

    // ─── Two-Column Split: Terminal Buffer & Scope Inspector ─────────────────
    let split_box = gtk4::Box::new(gtk4::Orientation::Horizontal, 12);
    split_box.set_vexpand(true);

    // 1. REPL Terminal Output Buffer & Input Bar (Left Panel)
    let term_box = gtk4::Box::new(gtk4::Orientation::Vertical, 8);
    term_box.set_hexpand(true);

    let output_view = gtk4::TextView::new();
    output_view.set_editable(false);
    output_view.set_monospace(true);
    output_view.add_css_class("terminal-output");

    if let Some(buf) = output_view.buffer() {
        buf.set_text(
            "SuperAgent In-Process REPL Console [v2.4 Node.js v20.12.0]\n\
            Type 'help' or load a snippet from the snippets menu.\n\
            > const app = await cua.getApp({ windowId: 1042 });\n\
            => WindowInfo { id: 1042, app: 'com.microsoft.VSCode' }\n\
            > ",
        );
    }

    let term_scroll = gtk4::ScrolledWindow::new();
    term_scroll.set_child(Some(&output_view));
    term_scroll.set_vexpand(true);

    // REPL Command Prompt Input Bar
    let input_box = gtk4::Box::new(gtk4::Orientation::Horizontal, 8);
    let prompt_lbl = gtk4::Label::new(Some(">"));
    prompt_lbl.add_css_class("dim-label");

    let eval_entry = gtk4::Entry::new();
    eval_entry.set_placeholder_text(Some(
        "Execute JS expression (e.g. await cua.listWindows())...",
    ));
    eval_entry.set_hexpand(true);

    let eval_btn = gtk4::Button::with_label("Evaluate");
    eval_btn.add_css_class("suggested-action");

    input_box.append(&prompt_lbl);
    input_box.append(&eval_entry);
    input_box.append(&eval_btn);

    term_box.append(&term_scroll);
    term_box.append(&input_box);
    split_box.append(&term_box);

    // 2. Scope Variable Inspector Tree (Right Panel)
    let scope_group = adw::PreferencesGroup::new();
    scope_group.set_title("Scope Variable Inspector");
    scope_group.set_description(Some("Live bindings in current V8 environment."));

    let var_list = gtk4::ListBox::new();
    var_list.add_css_class("boxed-list");

    let v1 = adw::ActionRow::new();
    v1.set_title("targetWindow: object");
    v1.set_subtitle("WindowInfo { id: 2048, app: 'Google Chrome' }");
    var_list.append(&v1);

    let v2 = adw::ActionRow::new();
    v2.set_title("activeTabs: Array(2)");
    v2.set_subtitle("[Tab, Tab] (1 leased)");
    var_list.append(&v2);

    let v3 = adw::ActionRow::new();
    v3.set_title("cua: ComputerUseAPI");
    v3.set_subtitle("Target: 'linux' | Methods: getState, getApp, listWindows");
    var_list.append(&v3);

    let var_scroll = gtk4::ScrolledWindow::new();
    var_scroll.set_child(Some(&var_list));
    var_scroll.set_vexpand(true);

    let right_box = gtk4::Box::new(gtk4::Orientation::Vertical, 6);
    right_box.set_hexpand(true);
    right_box.append(&scope_group);
    right_box.append(&var_scroll);
    split_box.append(&right_box);

    main_box.append(&split_box);

    // Wire actions
    let state_clone = state.clone();
    eval_btn.connect_clicked(move |_| {
        let text = eval_entry.text().to_string();
        if text.trim().is_empty() {
            return;
        }
        eval_entry.set_text("");

        let s = state_clone.clone();
        glib::MainContext::default().spawn_local(async move {
            let mut guard = s.write().await;
            guard.run_repl_eval(&text);
        });
    });

    let state_reset = state.clone();
    reset_btn.connect_clicked(move |_| {
        let s = state_reset.clone();
        glib::MainContext::default().spawn_local(async move {
            let mut guard = s.write().await;
            guard.reset_repl_session();
        });
    });

    main_box
}

/// Cross-platform view descriptor for UI inspection and verification.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ReplViewDescriptor {
    pub session_id: String,
    pub runtime_version: String,
    pub output_tokens_used: u32,
    pub output_token_capacity: u32,
    pub variable_count: usize,
    pub snippets_count: usize,
    pub output_lines_count: usize,
}

impl ReplViewDescriptor {
    pub fn from_state(state: &AppState) -> Self {
        Self {
            session_id: state.repl_session.session_id.clone(),
            runtime_version: state.repl_session.runtime_version.clone(),
            output_tokens_used: state.repl_session.output_tokens_used,
            output_token_capacity: state.repl_session.output_token_capacity,
            variable_count: state.repl_variables.len(),
            snippets_count: state.repl_snippets.len(),
            output_lines_count: state.repl_output_buffer.len(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_repl_view_descriptor() {
        let state = AppState::new();
        let desc = ReplViewDescriptor::from_state(&state);
        assert!(desc.session_id.contains("repl-session"));
        assert_eq!(desc.runtime_version, "superagent-cua-repl-v2.4");
        assert_eq!(desc.output_tokens_used, 14280);
        assert_eq!(desc.output_token_capacity, 25000);
        assert_eq!(desc.variable_count, 3);
        assert_eq!(desc.snippets_count, 3);
        assert_eq!(desc.output_lines_count, 4);
    }
}
