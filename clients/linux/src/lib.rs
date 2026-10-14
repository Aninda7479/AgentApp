//! SuperAgent Linux Dedicated Client Library.
//!
//! Provides the native GTK4 + Libadwaita client architecture, reactive state,
//! and full-duplex communication bridge to SuperAgent Core v2.

pub mod client;
pub mod demo_data;
pub mod state;
pub mod ui;

pub use client::daemon_client::{
    discover_daemon_port, ClientConfig, ConnectionStatus, DaemonClient, DaemonClientError,
    DEFAULT_DAEMON_PORT,
};
pub use state::{AppState, ChatMessage, SessionItem, WorkspaceNav};
pub use ui::run_gtk_app;
