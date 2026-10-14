//! Settings View for SuperAgent Linux Dedicated UI.
//!
//! Provides the complete 24-module governance settings list and the
//! interactive System Doctor diagnostic probes view.

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
pub fn build_settings_view(state: Arc<RwLock<AppState>>) -> gtk4::Box {
    let main_box = gtk4::Box::new(gtk4::Orientation::Horizontal, 12);
    main_box.set_margin_start(16);
    main_box.set_margin_end(16);
    main_box.set_margin_top(12);
    main_box.set_margin_bottom(16);

    // ─── Left Sidebar: 24-Module Settings List ───────────────────────────────
    let nav_box = gtk4::Box::new(gtk4::Orientation::Vertical, 6);
    nav_box.set_size_request(280, -1);

    let nav_header = adw::PreferencesGroup::new();
    nav_header.set_title("Settings Categories (24 Modules)");

    let module_list = gtk4::ListBox::new();
    module_list.add_css_class("navigation-sidebar");

    let modules = crate::demo_data::get_24_settings_modules();
    for m in &modules {
        let row = adw::ActionRow::new();
        row.set_title(&format!("{}. {}", m.number, m.title));
        row.set_subtitle(&m.category);
        row.set_icon_name(Some(&m.icon_name));
        module_list.append(&row);
    }

    let nav_scroll = gtk4::ScrolledWindow::new();
    nav_scroll.set_child(Some(&module_list));
    nav_scroll.set_vexpand(true);

    nav_box.append(&nav_header);
    nav_box.append(&nav_scroll);
    main_box.append(&nav_box);

    let sep = gtk4::Separator::new(gtk4::Orientation::Vertical);
    main_box.append(&sep);

    // ─── Right Pane: System Doctor & Active Module Stage ─────────────────────
    let detail_box = gtk4::Box::new(gtk4::Orientation::Vertical, 12);
    detail_box.set_hexpand(true);

    // Module 21: System Doctor Diagnostics Showcase
    let doctor_group = adw::PreferencesGroup::new();
    doctor_group.set_title("Module 21: System Doctor Diagnostics");
    doctor_group.set_description(Some(
        "Self-healing environment diagnostics, port accessibility, and subsystem verification.",
    ));

    let status_banner = adw::ActionRow::new();
    status_banner.set_title("Overall Readiness: READY");
    status_banner.set_subtitle("All critical runtime services and dependencies are healthy.");
    status_banner.set_icon_name(Some("emblem-ok-symbolic"));

    let run_diag_btn = gtk4::Button::with_label("Run Full Diagnostics");
    run_diag_btn.add_css_class("suggested-action");
    run_diag_btn.add_css_class("flat");
    status_banner.add_suffix(&run_diag_btn);
    doctor_group.add(&status_banner);

    // Probes List
    let probes_list = gtk4::ListBox::new();
    probes_list.add_css_class("boxed-list");

    let p1 = adw::ActionRow::new();
    p1.set_title("Core v2 Daemon Connectivity [PASS]");
    p1.set_subtitle("Port 1469 | 1.2ms latency | Full-duplex WS active");
    p1.set_icon_name(Some("emblem-ok-symbolic"));
    probes_list.append(&p1);

    let p2 = adw::ActionRow::new();
    p2.set_title("GPU & Direct Rendering Infrastructure [PASS]");
    p2.set_subtitle("Vulkan 1.3 / DRM render node (/dev/dri/renderD128)");
    p2.set_icon_name(Some("emblem-ok-symbolic"));
    probes_list.append(&p2);

    let p3 = adw::ActionRow::new();
    p3.set_title("Desktop Window Capture Subsystem [PASS]");
    p3.set_subtitle("PipeWire / X11 SHM Compositor Available");
    p3.set_icon_name(Some("emblem-ok-symbolic"));
    probes_list.append(&p3);

    let p4 = adw::ActionRow::new();
    p4.set_title("Browser CDP Gateway [WARN]");
    p4.set_subtitle("Port 9222 listening, 2 tabs available (in-page WebMCP enabled)");
    p4.set_icon_name(Some("dialog-warning-symbolic"));
    probes_list.append(&p4);

    let p5 = adw::ActionRow::new();
    p5.set_title("KiCad ECAD CLI Binary [PASS]");
    p5.set_subtitle("kicad-cli v8.0.4 at /usr/bin/kicad-cli");
    p5.set_icon_name(Some("emblem-ok-symbolic"));
    probes_list.append(&p5);

    let probes_scroll = gtk4::ScrolledWindow::new();
    probes_scroll.set_child(Some(&probes_list));
    probes_scroll.set_vexpand(true);

    detail_box.append(&doctor_group);
    detail_box.append(&probes_scroll);
    main_box.append(&detail_box);

    let state_clone = state.clone();
    run_diag_btn.connect_clicked(move |_| {
        let s = state_clone.clone();
        glib::MainContext::default().spawn_local(async move {
            let mut guard = s.write().await;
            guard.run_doctor_diagnostics();
        });
    });

    main_box
}

/// Cross-platform view descriptor for UI inspection and verification.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct SettingsViewDescriptor {
    pub total_modules_count: usize,
    pub active_module_id: String,
    pub doctor_overall_status: String,
    pub doctor_probes_count: usize,
}

impl SettingsViewDescriptor {
    pub fn from_state(state: &AppState) -> Self {
        let (status, count) = if let Some(report) = &state.doctor_report {
            (report.overall_status.clone(), report.probes.len())
        } else {
            ("unknown".to_string(), 0)
        };

        Self {
            total_modules_count: state.settings_modules.len(),
            active_module_id: state.active_settings_module_id.clone(),
            doctor_overall_status: status,
            doctor_probes_count: count,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_view_descriptor() {
        let state = AppState::new();
        let desc = SettingsViewDescriptor::from_state(&state);
        assert_eq!(desc.total_modules_count, 24);
        assert_eq!(desc.active_module_id, "general");
        assert_eq!(desc.doctor_overall_status, "ready");
        assert_eq!(desc.doctor_probes_count, 6);
    }
}
