//! Canonical wire protocol and IPC contracts for SuperAgent.
//!
//! Standardizes commands, strongly typed events, and request/response DTOs
//! across the Core daemon and client frontends.

pub mod commands;
pub mod dtos;
pub mod events;

pub use commands::*;
pub use dtos::*;
pub use events::*;
