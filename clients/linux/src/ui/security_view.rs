//! Security View for SuperAgent Linux Dedicated UI.
//!
//! Provides the 4-Tier Confirmation Modal / Deck, the 16-state `zo` Decision
//! State Machine badge catalog, and the LockScreen Guardian status indicator.

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
pub fn build_security_view(state: Arc<RwLock<AppState>>) -> gtk4::Box {
    let main_box = gtk4::Box::new(gtk4::Orientation::Vertical, 12);
    main_box.set_margin_start(16);
    main_box.set_margin_end(16);
    main_box.set_margin_top(12);
    main_box.set_margin_bottom(16);

    // ─── Header: LockScreen Guardian Status Indicator ────────────────────────
    let guardian_card = adw::PreferencesGroup::new();
    guardian_card.set_title("LockScreen Guardian & Physical Input Watchdog");
    guardian_card.set_description(Some(
        "Monitors systemd-logind session lock events and freezes synthetic input within <10ms.",
    ));

    let shield_row = adw::ActionRow::new();
    shield_row.set_title("Guardian Shield: ARMED (Healthy)");
    shield_row
        .set_subtitle("Platform: Linux logind | Workstation: Unlocked | Intercepted Inputs: 0");
    shield_row.set_icon_name(Some("security-high-symbolic"));

    let lock_test_btn = gtk4::Button::with_label("Simulate Lock");
    lock_test_btn.add_css_class("flat");
    shield_row.add_suffix(&lock_test_btn);

    guardian_card.add(&shield_row);
    main_box.append(&guardian_card);

    // ─── Two-Column Split Layout ─────────────────────────────────────────────
    let split_box = gtk4::Box::new(gtk4::Orientation::Horizontal, 12);
    split_box.set_vexpand(true);

    // 1. Active 4-Tier Confirmation Requests (Left Panel)
    let conf_group = adw::PreferencesGroup::new();
    conf_group.set_title("Active 4-Tier Security Confirmations");
    conf_group.set_description(Some(
        "Tier 1: Takeover | Tier 2: Confirm | Tier 3: Pre-approved | Tier 4: Silent",
    ));

    let conf_list = gtk4::ListBox::new();
    conf_list.add_css_class("boxed-list");

    // Mode 2 Item: Deletion
    let c1 = adw::ActionRow::new();
    c1.set_title("Tier 2 [Always Confirm]: Delete Database Records");
    c1.set_subtitle("DROP TABLE users_temp_migration | Target: db.internal.superagent.io:5432");

    let approve_btn = gtk4::Button::with_label("Approve");
    approve_btn.add_css_class("suggested-action");
    approve_btn.add_css_class("flat");
    let decline_btn = gtk4::Button::with_label("Decline");
    decline_btn.add_css_class("destructive-action");
    decline_btn.add_css_class("flat");

    c1.add_suffix(&decline_btn);
    c1.add_suffix(&approve_btn);
    conf_list.append(&c1);

    // Mode 1 Item: Takeover
    let c2 = adw::ActionRow::new();
    c2.set_title("Tier 1 [User Takeover]: Change Account Password");
    c2.set_subtitle("Autonomous submission forbidden | Destination: auth.enterprise.com");
    let takeover_btn = gtk4::Button::with_label("Takeover Viewport");
    takeover_btn.add_css_class("accent");
    takeover_btn.add_css_class("flat");
    c2.add_suffix(&takeover_btn);
    conf_list.append(&c2);

    let conf_scroll = gtk4::ScrolledWindow::new();
    conf_scroll.set_child(Some(&conf_list));
    conf_scroll.set_vexpand(true);
    conf_scroll.set_hexpand(true);

    let left_box = gtk4::Box::new(gtk4::Orientation::Vertical, 6);
    left_box.append(&conf_group);
    left_box.append(&conf_scroll);
    split_box.append(&left_box);

    // 2. 16-State `zo` Decision Machine Badges (Right Panel)
    let zo_group = adw::PreferencesGroup::new();
    zo_group.set_title("16-State `zo` Security Decision Engine");
    zo_group.set_description(Some(
        "Deterministic reason codes, retryability flags, and recovery actions.",
    ));

    let zo_list = gtk4::ListBox::new();
    zo_list.add_css_class("boxed-list");

    let z1 = adw::ActionRow::new();
    z1.set_title("approval_cancelled [Retryable: YES]");
    z1.set_subtitle("Source: approval | User dismissed prompt before decision.");
    zo_list.append(&z1);

    let z2 = adw::ActionRow::new();
    z2.set_title("browser_capability_blocked [Strict Block]");
    z2.set_subtitle("Source: browser | Domain policy strictly forbids capability.");
    zo_list.append(&z2);

    let z3 = adw::ActionRow::new();
    z3.set_title("enterprise_policy_blocked [Strict Block]");
    z3.set_subtitle("Source: enterprise | Admin-enforced JSON policy blocks action.");
    zo_list.append(&z3);

    let z4 = adw::ActionRow::new();
    z4.set_title("site_status_blocked [Strict Block]");
    z4.set_subtitle("Source: site_status | Flagged as deceptive or malware destination.");
    zo_list.append(&z4);

    let z5 = adw::ActionRow::new();
    z5.set_title("user_declined [Recorded]");
    z5.set_subtitle("Source: user_decision | User explicitly clicked 'Decline'.");
    zo_list.append(&z5);

    let zo_scroll = gtk4::ScrolledWindow::new();
    zo_scroll.set_child(Some(&zo_list));
    zo_scroll.set_vexpand(true);
    zo_scroll.set_hexpand(true);

    let right_box = gtk4::Box::new(gtk4::Orientation::Vertical, 6);
    right_box.append(&zo_group);
    right_box.append(&zo_scroll);
    split_box.append(&right_box);

    main_box.append(&split_box);

    let _ = state;
    main_box
}

/// Cross-platform view descriptor for UI inspection and verification.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct SecurityViewDescriptor {
    pub is_shield_armed: bool,
    pub is_workstation_locked: bool,
    pub pending_confirmations_count: usize,
    pub zo_decision_states_count: usize,
}

impl SecurityViewDescriptor {
    pub fn from_state(state: &AppState) -> Self {
        Self {
            is_shield_armed: !state.guardian_shield.is_workstation_locked,
            is_workstation_locked: state.guardian_shield.is_workstation_locked,
            pending_confirmations_count: state.security_confirmations.len(),
            zo_decision_states_count: state.zo_states.len(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_security_view_descriptor() {
        let state = AppState::new();
        let desc = SecurityViewDescriptor::from_state(&state);
        assert!(desc.is_shield_armed);
        assert!(!desc.is_workstation_locked);
        assert_eq!(desc.pending_confirmations_count, 2);
        assert_eq!(desc.zo_decision_states_count, 16);
    }
}
