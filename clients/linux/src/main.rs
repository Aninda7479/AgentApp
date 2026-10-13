//! SuperAgent Linux Dedicated Client CLI & GUI Entrypoint.

use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use superagent_core_v2::protocol::events::WireMessage;
#[cfg(target_os = "linux")]
use superagent_linux_client::ui::run_gtk_app;
use superagent_linux_client::{AppState, ClientConfig, DaemonClient};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let args: Vec<String> = std::env::args().collect();
    let mut explicit_port: Option<u16> = None;
    let mut explicit_server: Option<String> = None;
    let mut token: Option<String> = None;
    let mut headless = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--port" => {
                if i + 1 < args.len() {
                    explicit_port = args[i + 1].parse().ok();
                    i += 1;
                }
            }
            "--server" => {
                if i + 1 < args.len() {
                    explicit_server = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            "--token" => {
                if i + 1 < args.len() {
                    token = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            "--headless" => {
                headless = true;
            }
            "--help" | "-h" => {
                println!("SuperAgent Dedicated Linux Client (GTK4 + Libadwaita)");
                println!("Usage: superagent-linux [OPTIONS]");
                println!();
                println!("Options:");
                println!("  --port <PORT>        Connect to daemon on specific port");
                println!("  --server <URL>       Connect to custom daemon server URL");
                println!("  --token <TOKEN>      Authentication session token");
                println!("  --headless           Run in headless daemon streaming mode");
                println!("  -h, --help           Display this help message");
                return Ok(());
            }
            _ => {}
        }
        i += 1;
    }

    let config = ClientConfig::discover(explicit_server.as_deref(), explicit_port, token);

    info!("Initializing SuperAgent Linux Client");
    info!("Target Daemon HTTP: {}", config.http_base_url);
    info!("Target Daemon WS: {}", config.ws_base_url);

    let client = DaemonClient::new(config.clone());
    let state = Arc::new(RwLock::new(AppState::new()));

    // Seed default session
    {
        let mut st = state.write().await;
        st.add_session("default-session".to_string(), "Primary Session".to_string());
    }

    // Start background WebSocket event listener loop
    let _ws_handle = client.start_ws_loop();

    // Subscribe to default session
    client.subscribe_session("default-session").await;

    // Background task bridging daemon events into AppState
    let mut event_rx = client.subscribe_events();
    let state_bridge = state.clone();
    tokio::spawn(async move {
        while let Ok(msg) = event_rx.recv().await {
            match msg {
                WireMessage::AgentEvent { data, .. } => {
                    let mut guard = state_bridge.write().await;
                    guard.apply_stream_event(&data);
                }
                WireMessage::SessionSync { data, .. } => {
                    let mut guard = state_bridge.write().await;
                    guard.apply_session_sync(&data);
                }
                _ => {}
            }
        }
    });

    if headless || !cfg!(target_os = "linux") {
        if !cfg!(target_os = "linux") && !headless {
            println!(
                "Note: GTK4 / Libadwaita GUI is native to Linux. Running headless client loop."
            );
        }
        println!(
            "Connected to SuperAgent core daemon at {}",
            config.http_base_url
        );
        println!("Listening for streaming events... (Press Ctrl+C to stop)");

        // Keep runtime active
        tokio::signal::ctrl_c().await?;
        println!("\nShutting down Linux client.");
    } else {
        #[cfg(target_os = "linux")]
        {
            run_gtk_app(client, state);
        }
    }

    Ok(())
}
