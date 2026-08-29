pub mod agent;
pub mod circle_search;
pub mod helpers;
pub mod integrations;
pub mod memory;
pub mod usage;
pub mod voice;

pub use helpers::*;
pub use usage::{get_model_pricing, record_usage};

use std::net::ToSocketAddrs;

use axum::{
    extract::{Path as AxumPath, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use sysinfo::System;
use tracing::warn;

use crate::server::state::{AppState, IpcRequest};

/// Returns the machine's non-internal IPv4 addresses for LAN access.
pub fn lan_addresses() -> Vec<String> {
    let mut addrs: Vec<String> = Vec::new();

    // 1. Probe routing table with UDP sockets (no network packets are transmitted for UDP connect)
    let probe_targets = [
        "8.8.8.8:80",
        "1.1.1.1:80",
        "192.168.1.1:80",
        "10.0.0.1:80",
        "172.16.0.1:80",
    ];
    for target in probe_targets {
        if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
            if socket.connect(target).is_ok() {
                if let Ok(local_addr) = socket.local_addr() {
                    if let std::net::IpAddr::V4(ipv4) = local_addr.ip() {
                        if !ipv4.is_loopback() && !ipv4.is_unspecified() && !ipv4.is_link_local() {
                            let s = ipv4.to_string();
                            if !addrs.contains(&s) {
                                addrs.push(s);
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Resolve hostname addresses
    if let Some(host) = System::host_name() {
        if let Ok(lookup) = (host.as_str(), 0).to_socket_addrs() {
            for addr in lookup {
                if let std::net::IpAddr::V4(ipv4) = addr.ip() {
                    if !ipv4.is_loopback() && !ipv4.is_unspecified() && !ipv4.is_link_local() {
                        let s = ipv4.to_string();
                        if !addrs.contains(&s) {
                            addrs.push(s);
                        }
                    }
                }
            }
        }
    }

    addrs
}

// ─── Universal IPC Dispatcher (Delegates to Submodules) ───────────────────────

pub async fn handle_ipc(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
    _headers: HeaderMap,
    Json(req): Json<IpcRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let mut args = req.args;
    if args.is_empty() && !req.extra.is_empty() {
        args.push(serde_json::Value::Object(req.extra.into_iter().collect()));
    }
    let ch = channel.as_str();

    if let Some(res) = agent::handle_agent_channel(ch, &state, args.clone()).await {
        return res;
    }
    if let Some(res) = circle_search::handle_circle_search_channel(ch, &state, args.clone()).await {
        return res;
    }
    if let Some(res) = voice::handle_voice_channel(ch, &state, args.clone()).await {
        return res;
    }
    if let Some(res) = memory::handle_memory_channel(ch, &state, args.clone()).await {
        return res;
    }
    if let Some(res) = usage::handle_usage_channel(ch, &state, args.clone()).await {
        return res;
    }
    if let Some(res) = integrations::handle_integrations_channel(ch, &state, args).await {
        return res;
    }

    warn!("IPC channel not found: {}", ch);
    Ok(Json(serde_json::json!({ "data": null })))
}
