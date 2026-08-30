use std::time::Duration;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use sysinfo::{Disks, System};
use std::path::PathBuf;

use crate::integrations::catalog::{get_curated_integrations, IntegrationEntry};
use crate::server::auth::is_request_authenticated;
use crate::server::state::{AppState, ProviderProxyRequest};

pub async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "engine": "superagent-core-v2 (Rust)",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

pub async fn redirect_account() -> impl IntoResponse {
    axum::response::Redirect::temporary("/settings/web-app")
}

pub fn check_ollama_port_listening() -> bool {
    use std::net::ToSocketAddrs;
    if let Ok(mut addrs) = "127.0.0.1:11434".to_socket_addrs() {
        if let Some(addr) = addrs.next() {
            return std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(300)).is_ok();
        }
    }
    false
}

static OLLAMA_STATIC_CACHE: std::sync::Mutex<Option<(bool, Option<String>, Option<String>)>> = std::sync::Mutex::new(None);

fn do_detect_ollama_installation() -> (bool, Option<String>, Option<String>) {
    let mut installed = false;
    let mut path: Option<String> = None;
    let mut version: Option<String> = None;

    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
            candidates.push(PathBuf::from(&localappdata).join("Programs").join("Ollama").join("ollama.exe"));
        }
        if let Ok(progfiles) = std::env::var("ProgramFiles") {
            candidates.push(PathBuf::from(&progfiles).join("Ollama").join("ollama.exe"));
        }
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            candidates.push(PathBuf::from(&userprofile).join("AppData").join("Local").join("Programs").join("Ollama").join("ollama.exe"));
        }
    }

    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/usr/local/bin/ollama"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/ollama"));
        candidates.push(PathBuf::from("/Applications/Ollama.app/Contents/Resources/ollama"));
        if let Ok(home) = std::env::var("HOME") {
            candidates.push(PathBuf::from(&home).join(".local").join("bin").join("ollama"));
            candidates.push(PathBuf::from(&home).join("Applications").join("Ollama.app").join("Contents").join("Resources").join("ollama"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/usr/local/bin/ollama"));
        candidates.push(PathBuf::from("/usr/bin/ollama"));
        candidates.push(PathBuf::from("/bin/ollama"));
        if let Ok(home) = std::env::var("HOME") {
            candidates.push(PathBuf::from(&home).join(".local").join("bin").join("ollama"));
        }
    }

    for candidate in &candidates {
        if candidate.exists() {
            installed = true;
            path = Some(candidate.to_string_lossy().to_string());
            break;
        }
    }

    if !installed {
        #[cfg(target_os = "windows")]
        let cmd = std::process::Command::new("where").arg("ollama.exe").output();
        #[cfg(not(target_os = "windows"))]
        let cmd = std::process::Command::new("which").arg("ollama").output();

        if let Ok(output) = cmd {
            if output.status.success() {
                let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let first_line = out_str.lines().next().unwrap_or("").trim().to_string();
                if !first_line.is_empty() {
                    installed = true;
                    path = Some(first_line);
                }
            }
        }
    }

    // If binary wasn't found in standard PATH, check if models directory exists on disk
    if !installed && get_ollama_models_dir().is_some() {
        installed = true;
    }

    let exec_cmd = path.clone().unwrap_or_else(|| "ollama".to_string());
    if let Ok(ver_output) = std::process::Command::new(&exec_cmd).arg("--version").output() {
        if ver_output.status.success() {
            installed = true;
            let ver_str = String::from_utf8_lossy(&ver_output.stdout).trim().to_string();
            let clean_ver = ver_str
                .replace("ollama version is", "")
                .replace("ollama version", "")
                .replace("ollama", "")
                .trim()
                .to_string();
            if !clean_ver.is_empty() {
                version = Some(clean_ver);
            }
        }
    }

    (installed, path, version)
}

pub fn detect_ollama_installation() -> serde_json::Value {
    let (installed, path, version) = {
        let mut lock = OLLAMA_STATIC_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((inst, ref p, ref v)) = *lock {
            if inst {
                (inst, p.clone(), v.clone())
            } else {
                let res = do_detect_ollama_installation();
                *lock = Some(res.clone());
                res
            }
        } else {
            let res = do_detect_ollama_installation();
            *lock = Some(res.clone());
            res
        }
    };

    let running = check_ollama_port_listening();

    serde_json::json!({
        "installed": installed,
        "running": running,
        "version": version,
        "path": path,
        "port": 11434,
        "baseUrl": "http://localhost:11434"
    })
}

pub fn get_ollama_models_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("OLLAMA_MODELS") {
        let p = PathBuf::from(dir);
        if p.exists() {
            return Some(p);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let p = PathBuf::from(&userprofile).join(".ollama").join("models");
            if p.exists() {
                return Some(p);
            }
        }
        if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(&localappdata).join("Programs").join("Ollama").join("models");
            if p.exists() {
                return Some(p);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let p = PathBuf::from(home).join(".ollama").join("models");
            if p.exists() {
                return Some(p);
            }
        }
        let linux_p = PathBuf::from("/usr/share/ollama/.ollama/models");
        if linux_p.exists() {
            return Some(linux_p);
        }
    }

    None
}

pub fn scan_ollama_models_from_disk() -> Vec<serde_json::Value> {
    let mut results = Vec::new();
    let models_dir = match get_ollama_models_dir() {
        Some(d) => d,
        None => return results,
    };

    let manifests_dir = models_dir.join("manifests");
    let blobs_dir = models_dir.join("blobs");
    if !manifests_dir.exists() {
        return results;
    }

    for entry in walkdir::WalkDir::new(&manifests_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            let path = entry.path();
            if let Ok(rel) = path.strip_prefix(&manifests_dir) {
                let comps: Vec<String> = rel
                    .iter()
                    .map(|c| c.to_string_lossy().to_string())
                    .collect();

                if comps.len() >= 2 {
                    let tag = comps.last().cloned().unwrap_or_else(|| "latest".to_string());
                    let model_name = if comps.len() == 4 && comps[0] == "registry.ollama.ai" && comps[1] == "library" {
                        format!("{}:{}", comps[2], tag)
                    } else if comps.len() == 3 && comps[0] == "library" {
                        format!("{}:{}", comps[1], tag)
                    } else if comps.len() == 4 && comps[0] == "registry.ollama.ai" {
                        format!("{}/{}:{}", comps[1], comps[2], tag)
                    } else {
                        let name_part = comps[..comps.len() - 1].join("/");
                        format!("{}:{}", name_part, tag)
                    };

                    let mut total_size: u64 = 0;
                    let mut param_size: Option<String> = None;
                    let mut quant_level: Option<String> = None;
                    let mut family: Option<String> = None;
                    let mut modified_at = String::new();

                    if let Ok(meta) = entry.metadata() {
                        if let Ok(mod_time) = meta.modified() {
                            let dt: chrono::DateTime<chrono::Utc> = mod_time.into();
                            modified_at = dt.to_rfc3339();
                        }
                    }

                    if let Ok(content) = std::fs::read_to_string(path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(layers) = json.get("layers").and_then(|l| l.as_array()) {
                                for layer in layers {
                                    total_size += layer.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                                }
                            }

                            if let Some(config_digest) = json
                                .get("config")
                                .and_then(|c| c.get("digest"))
                                .and_then(|d| d.as_str())
                            {
                                let blob_name = config_digest.replace(':', "-");
                                let blob_path = blobs_dir.join(blob_name);
                                if blob_path.exists() {
                                    if let Ok(blob_content) = std::fs::read_to_string(&blob_path) {
                                        if let Ok(blob_json) = serde_json::from_str::<serde_json::Value>(&blob_content) {
                                            param_size = blob_json.get("model_type").and_then(|v| v.as_str()).map(|s| s.to_string());
                                            quant_level = blob_json.get("file_type").and_then(|v| v.as_str()).map(|s| s.to_string());
                                            family = blob_json.get("model_family").and_then(|v| v.as_str()).map(|s| s.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if param_size.is_none() {
                        let tag_lower = tag.to_lowercase();
                        if tag_lower.ends_with('b') || tag_lower.ends_with('m') {
                            param_size = Some(tag.to_uppercase());
                        }
                    }

                    results.push(serde_json::json!({
                        "name": model_name,
                        "sizeBytes": total_size,
                        "modifiedAt": modified_at,
                        "parameterSize": param_size,
                        "quantLevel": quant_level,
                        "family": family
                    }));
                }
            }
        }
    }

    results
}

pub fn start_ollama_daemon() -> Result<bool, String> {
    if check_ollama_port_listening() {
        return Ok(true);
    }

    let install_info = detect_ollama_installation();
    let exe_path = install_info.get("path").and_then(|p| p.as_str()).map(|s| s.to_string());

    #[cfg(target_os = "windows")]
    {
        if let Some(ref exe) = exe_path {
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "/B", exe, "serve"])
                .spawn();
        } else {
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "/B", "ollama", "serve"])
                .spawn();
        }
    }

    #[cfg(target_os = "macos")]
    {
        if std::path::Path::new("/Applications/Ollama.app").exists() {
            let _ = std::process::Command::new("open").arg("-a").arg("Ollama").spawn();
        } else if let Some(ref exe) = exe_path {
            let _ = std::process::Command::new("nohup")
                .args([exe.as_str(), "serve"])
                .spawn();
        } else {
            let _ = std::process::Command::new("nohup")
                .args(["ollama", "serve"])
                .spawn();
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(ref exe) = exe_path {
            let _ = std::process::Command::new("nohup")
                .args([exe.as_str(), "serve"])
                .spawn();
        } else {
            let _ = std::process::Command::new("nohup")
                .args(["ollama", "serve"])
                .spawn();
        }
    }

    for _ in 0..15 {
        std::thread::sleep(std::time::Duration::from_millis(200));
        if check_ollama_port_listening() {
            return Ok(true);
        }
    }

    Ok(check_ollama_port_listening())
}

#[allow(unused_variables)]
pub fn detect_system_gpus(is_unified: bool, ram_gb: f64) -> Vec<serde_json::Value> {
    let mut gpus = Vec::new();

    #[cfg(target_os = "windows")]
    {
        if let Ok(out) = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object -Property Name, AdapterRAM | ConvertTo-Json"])
            .output()
        {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout);
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                    let items = if v.is_array() { v.as_array().unwrap().clone() } else { vec![v] };
                    for item in items {
                        if let Some(name) = item.get("Name").and_then(|n| n.as_str()) {
                            let raw_ram = item.get("AdapterRAM").and_then(|r| r.as_u64()).unwrap_or(0);
                            let vram_gb = if raw_ram > 0 {
                                ((raw_ram as f64) / (1024.0 * 1024.0 * 1024.0) * 10.0).round() / 10.0
                            } else {
                                0.0
                            };
                            gpus.push(serde_json::json!({
                                "model": name,
                                "vramGB": vram_gb
                            }));
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if is_unified {
            gpus.push(serde_json::json!({
                "model": "Apple Silicon Unified GPU",
                "vramGB": ((ram_gb * 0.75) * 10.0).round() / 10.0
            }));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(out) = std::process::Command::new("nvidia-smi")
            .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
            .output()
        {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout);
                for line in s.lines() {
                    let parts: Vec<&str> = line.split(',').collect();
                    if !parts.is_empty() {
                        let name = parts[0].trim();
                        let vram_mb: f64 = parts.get(1).and_then(|m| m.trim().parse().ok()).unwrap_or(0.0);
                        gpus.push(serde_json::json!({
                            "model": name,
                            "vramGB": ((vram_mb / 1024.0) * 10.0).round() / 10.0
                        }));
                    }
                }
            }
        }
    }

    gpus
}

pub fn detect_npu_tpu(cpu_brand: &str) -> serde_json::Value {
    let lower = cpu_brand.to_lowercase();
    let arch = std::env::consts::ARCH;

    if lower.contains("apple") || (cfg!(target_os = "macos") && arch == "aarch64") {
        return serde_json::json!({
            "detected": true,
            "label": "Apple Neural Engine (ANE)"
        });
    }
    if lower.contains("ultra") || (lower.contains("intel") && lower.contains("core ultra")) {
        return serde_json::json!({
            "detected": true,
            "label": "Intel AI Boost (NPU)"
        });
    }
    if lower.contains("ryzen ai") || lower.contains("8040") || lower.contains("8845") || lower.contains("8945") || lower.contains("hx 370") {
        return serde_json::json!({
            "detected": true,
            "label": "AMD XDNA NPU (Ryzen AI)"
        });
    }
    if lower.contains("snapdragon") || lower.contains("x elite") || lower.contains("x plus") {
        return serde_json::json!({
            "detected": true,
            "label": "Qualcomm Hexagon NPU"
        });
    }

    serde_json::json!({
        "detected": false,
        "label": ""
    })
}

pub fn get_full_system_info_value() -> serde_json::Value {
    let mut sys = System::new_all();
    sys.refresh_all();

    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());
    let total_memory_mb = sys.total_memory() / (1024 * 1024);
    let used_memory_mb = sys.used_memory() / (1024 * 1024);
    let available_memory_mb = sys.available_memory() / (1024 * 1024);
    let free_memory_mb = sys.free_memory() / (1024 * 1024);

    let ram_gb = ((total_memory_mb as f64) / 1024.0 * 10.0).round() / 10.0;
    let ram_free_gb = ((available_memory_mb as f64) / 1024.0 * 10.0).round() / 10.0;

    let cpus = sys.cpus();
    let cpu_count = cpus.len();
    let cpu_brand = cpus.first().map(|c| c.brand().to_string()).unwrap_or_else(|| "System CPU".to_string());
    let cpu_speed_ghz = cpus.first().map(|c| (c.frequency() as f64) / 1000.0).unwrap_or(2.8);
    let cpu_usage_percent: f32 = if cpu_count > 0 {
        cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpu_count as f32
    } else {
        0.0
    };

    let is_unified_memory = cfg!(target_os = "macos") && (std::env::consts::ARCH == "aarch64" || cpu_brand.to_lowercase().contains("apple"));

    let gpus = detect_system_gpus(is_unified_memory, ram_gb);

    let vram_budget_gb = if is_unified_memory {
        ((ram_gb * 0.75) * 10.0).round() / 10.0
    } else if !gpus.is_empty() {
        let max_vram = gpus.iter().filter_map(|g| g.get("vramGB").and_then(|v| v.as_f64())).fold(0.0f64, |acc, x| acc.max(x));
        if max_vram > 0.0 { max_vram } else { 0.0 }
    } else {
        0.0
    };

    let disks = Disks::new_with_refreshed_list();
    let mut storage_list = Vec::new();
    for disk in &disks {
        storage_list.push(serde_json::json!({
            "mount": disk.mount_point().to_string_lossy().to_string(),
            "type": disk.file_system().to_string_lossy().to_string(),
            "freeGB": ((disk.available_space() as f64) / (1024.0 * 1024.0 * 1024.0) * 10.0).round() / 10.0,
            "sizeGB": ((disk.total_space() as f64) / (1024.0 * 1024.0 * 1024.0) * 10.0).round() / 10.0
        }));
    }

    if storage_list.is_empty() {
        storage_list.push(serde_json::json!({
            "mount": if cfg!(target_os = "windows") { "C:\\" } else { "/" },
            "type": "SSD",
            "freeGB": 64.0,
            "sizeGB": 256.0
        }));
    }

    let npu_tpu = detect_npu_tpu(&cpu_brand);
    let ollama = detect_ollama_installation();
    let hostname = System::host_name().unwrap_or_else(|| "localhost".to_string());

    serde_json::json!({
        "os_name": os_name,
        "os_version": os_version,
        "arch": std::env::consts::ARCH,
        "hostname": hostname,
        "cpuBrand": cpu_brand,
        "cpu_brand": cpu_brand,
        "cpu_count": cpu_count,
        "cpuCores": cpu_count,
        "cpuSpeedGHz": ((cpu_speed_ghz * 10.0).round() / 10.0),
        "cpu_speed_ghz": cpu_speed_ghz,
        "cpu_usage_percent": cpu_usage_percent,
        "total_memory_mb": total_memory_mb,
        "used_memory_mb": used_memory_mb,
        "available_memory_mb": available_memory_mb,
        "free_memory_mb": free_memory_mb,
        "ramGB": ram_gb,
        "ramFreeGB": ram_free_gb,
        "vramBudgetGB": vram_budget_gb,
        "isUnifiedMemory": is_unified_memory,
        "is_unified_memory": is_unified_memory,
        "gpus": gpus,
        "storage": storage_list,
        "npuTpu": npu_tpu,
        "npu_tpu": npu_tpu,
        "ollama": ollama
    })
}

pub async fn get_system_info() -> impl IntoResponse {
    Json(get_full_system_info_value())
}

pub async fn get_providers_status(State(state): State<AppState>) -> impl IntoResponse {
    let settings = state.settings_store.load().unwrap_or_default();

    let check_provider = |key_name: &str, env_var: &str| -> bool {
        if std::env::var(env_var).map(|v| !v.trim().is_empty()).unwrap_or(false) {
            return true;
        }
        if let Some(val) = settings.api_keys.get(key_name) {
            return !val.trim().is_empty();
        }
        false
    };

    Json(serde_json::json!({
        "openai": { "configured": check_provider("openai", "OPENAI_API_KEY") },
        "anthropic": { "configured": check_provider("anthropic", "ANTHROPIC_API_KEY") },
        "gemini": { "configured": check_provider("gemini", "GEMINI_API_KEY") },
        "openrouter": { "configured": check_provider("openrouter", "OPENROUTER_API_KEY") },
        "deepseek": { "configured": check_provider("deepseek", "DEEPSEEK_API_KEY") },
        "groq": { "configured": check_provider("groq", "GROQ_API_KEY") },
        "ollama": { "configured": true }
    }))
}

pub fn is_private_or_loopback_host(host: &str) -> bool {
    let h = host.to_lowercase();
    if h == "localhost" || h == "127.0.0.1" || h == "::1" {
        return false;
    }
    if let Ok(ip) = h.parse::<std::net::IpAddr>() {
        match ip {
            std::net::IpAddr::V4(v4) => {
                let oct = v4.octets();
                // 169.254.x.x link local / cloud metadata
                if oct[0] == 169 && oct[1] == 254 {
                    return true;
                }
                // 10.x.x.x
                if oct[0] == 10 {
                    return true;
                }
                // 172.16.x.x - 172.31.x.x
                if oct[0] == 172 && (16..=31).contains(&oct[1]) {
                    return true;
                }
                // 192.168.x.x
                if oct[0] == 192 && oct[1] == 168 {
                    return true;
                }
            }
            std::net::IpAddr::V6(v6) => {
                if v6.is_loopback() || v6.is_multicast() {
                    return true;
                }
            }
        }
    }
    false
}

pub async fn handle_provider_proxy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<ProviderProxyRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if !is_request_authenticated(&state, &headers) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    let parsed_url = url::Url::parse(&req.url).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid URL" })),
        )
    })?;

    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Only http and https protocols allowed" })),
        ));
    }

    if let Some(host) = parsed_url.host_str() {
        if is_private_or_loopback_host(host) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({ "error": "Access to private or link-local address is denied" })),
            ));
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("SuperAgent/0.21.0 (Windows; x64)")
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
        })?;

    let method = match req.method.as_deref().unwrap_or("GET").to_uppercase().as_str() {
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        _ => reqwest::Method::GET,
    };

    let mut request_builder = client.request(method, parsed_url);
    if let Some(hdrs) = req.headers {
        for (k, v) in hdrs {
            if let Ok(name) = reqwest::header::HeaderName::from_bytes(k.as_bytes()) {
                if let Ok(val) = reqwest::header::HeaderValue::from_str(&v) {
                    request_builder = request_builder.header(name, val);
                }
            }
        }
    }

    if let Some(body_val) = req.body {
        if let Some(s) = body_val.as_str() {
            request_builder = request_builder.header(reqwest::header::CONTENT_TYPE, "application/json").body(s.to_string());
        } else {
            request_builder = request_builder.json(&body_val);
        }
    }

    match request_builder.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let ok = resp.status().is_success();
            let text = resp.text().await.unwrap_or_default();
            let data: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::String(text));

            Ok(Json(serde_json::json!({
                "ok": ok,
                "status": status,
                "data": data
            })))
        }
        Err(err) => Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "ok": false,
                "error": err.to_string()
            })),
        )),
    }
}

pub fn compare_semver(a: &str, b: &str) -> i32 {
    let parse = |s: &str| -> Vec<u64> {
        s.trim_start_matches('v')
            .split('.')
            .map(|part| part.chars().take_while(|c| c.is_ascii_digit()).collect::<String>())
            .filter_map(|p| p.parse().ok())
            .collect()
    };
    let va = parse(a);
    let vb = parse(b);
    for i in 0..std::cmp::max(va.len(), vb.len()) {
        let ai = va.get(i).copied().unwrap_or(0);
        let bi = vb.get(i).copied().unwrap_or(0);
        if ai < bi {
            return -1;
        } else if ai > bi {
            return 1;
        }
    }
    0
}

pub async fn fetch_latest_release_info() -> Result<(String, String, Option<String>), anyhow::Error> {
    let client = reqwest::Client::builder()
        .user_agent("SuperAgent-App")
        .timeout(Duration::from_secs(6))
        .build()?;

    // 1. Try redirect on releases/latest
    let head_res = client
        .head("https://github.com/Aninda7479/AgentApp/releases/latest")
        .send()
        .await;

    if let Ok(res) = head_res {
        let final_url = res.url().as_str();
        if let Some(tag_pos) = final_url.rfind("/tag/") {
            let tag = &final_url[tag_pos + 5..];
            let clean_ver = tag.trim_start_matches('v').trim();
            if !clean_ver.is_empty() {
                let release_url = format!("https://github.com/Aninda7479/AgentApp/releases/tag/v{}", clean_ver);
                return Ok((clean_ver.to_string(), release_url, None));
            }
        }
    }

    // 2. Try GitHub API
    let api_res = client
        .get("https://api.github.com/repos/Aninda7479/AgentApp/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await;

    if let Ok(api_res) = api_res {
        if api_res.status().is_success() {
            if let Ok(json) = api_res.json::<serde_json::Value>().await {
                if let Some(tag) = json.get("tag_name").and_then(|v| v.as_str()) {
                    let clean_ver = tag.trim_start_matches('v').trim().to_string();
                    let html_url = json.get("html_url")
                        .and_then(|v| v.as_str())
                        .unwrap_or("https://github.com/Aninda7479/AgentApp/releases")
                        .to_string();
                    let body = json.get("body").and_then(|v| v.as_str()).map(|s| s.to_string());
                    return Ok((clean_ver, html_url, body));
                }
            }
        }
    }

    // 3. Fallback to latest.json manifest
    let manifest_res = client
        .get("https://github.com/Aninda7479/AgentApp/releases/latest/download/latest.json")
        .send()
        .await;

    if let Ok(manifest_res) = manifest_res {
        if manifest_res.status().is_success() {
            if let Ok(json) = manifest_res.json::<serde_json::Value>().await {
                if let Some(ver) = json.get("version").and_then(|v| v.as_str()) {
                    let clean_ver = ver.trim_start_matches('v').trim().to_string();
                    let release_url = format!("https://github.com/Aninda7479/AgentApp/releases/tag/v{}", clean_ver);
                    let notes = json.get("notes").and_then(|v| v.as_str()).map(|s| s.to_string());
                    return Ok((clean_ver, release_url, notes));
                }
            }
        }
    }

    anyhow::bail!("Could not fetch latest release version from GitHub")
}

pub async fn check_for_updates() -> impl IntoResponse {
    let current_version = env!("CARGO_PKG_VERSION");
    match fetch_latest_release_info().await {
        Ok((latest_version, release_url, notes)) => {
            let has_update = compare_semver(current_version, &latest_version) < 0;
            Json(serde_json::json!({
                "current": current_version,
                "latest": latest_version,
                "hasUpdate": has_update,
                "releaseUrl": release_url,
                "notes": notes.unwrap_or_default()
            }))
        }
        Err(e) => {
            Json(serde_json::json!({
                "current": current_version,
                "latest": current_version,
                "hasUpdate": false,
                "releaseUrl": "https://github.com/Aninda7479/AgentApp/releases",
                "error": e.to_string()
            }))
        }
    }
}

pub async fn apply_update() -> impl IntoResponse {
    Json(serde_json::json!({
        "ok": true,
        "message": "SuperAgent Core v2 Daemon is up to date."
    }))
}

pub async fn get_settings(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .settings_store
        .load_raw()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn save_settings(
    State(state): State<AppState>,
    Json(settings): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .settings_store
        .save_raw(&settings)
        .map(|_| Json(serde_json::json!({ "ok": true, "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn list_tools(State(state): State<AppState>) -> impl IntoResponse {
    let schemas = state.tool_registry.list_schemas();
    Json(schemas)
}

pub async fn list_integrations() -> Json<Vec<IntegrationEntry>> {
    Json(get_curated_integrations())
}
