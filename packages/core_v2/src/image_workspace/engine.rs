use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::Instant;

use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use sysinfo::System;
use tokio::io::AsyncWriteExt;
use tracing::{error, info};

use crate::image_workspace::types::{
    EngineManifest, EngineStatus, GenerateImageRequest, GenerationProgressEvent, GpuBackend,
    HardwareProfile, UpdateInfo,
};
use crate::storage::settings::get_superagent_dir;

fn extract_zip_archive(archive_path: &Path, target_dir: &Path) -> Result<()> {
    let file = fs::File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.is_dir() {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)?;
                }
            }
            let mut outfile = fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = file.unix_mode() {
                let _ = fs::set_permissions(&outpath, fs::Permissions::from_mode(mode));
            }
        }
    }
    Ok(())
}

#[derive(Clone)]
pub struct EngineManager {
    engine_dir: PathBuf,
    is_downloading: Arc<RwLock<bool>>,
    download_progress: Arc<RwLock<f32>>,
    last_error: Arc<RwLock<Option<String>>>,
}

static HARDWARE_PROFILE_CACHE: std::sync::Mutex<Option<(std::time::Instant, HardwareProfile)>> = std::sync::Mutex::new(None);

impl EngineManager {
    pub fn new() -> Self {
        let base = get_superagent_dir();
        let engine_dir = base.join("engines").join("sd-cpp");
        if !engine_dir.exists() {
            let _ = fs::create_dir_all(&engine_dir);
        }
        Self {
            engine_dir,
            is_downloading: Arc::new(RwLock::new(false)),
            download_progress: Arc::new(RwLock::new(0.0)),
            last_error: Arc::new(RwLock::new(None)),
        }
    }

    pub fn with_dir(engine_dir: PathBuf) -> Self {
        if !engine_dir.exists() {
            let _ = fs::create_dir_all(&engine_dir);
        }
        Self {
            engine_dir,
            is_downloading: Arc::new(RwLock::new(false)),
            download_progress: Arc::new(RwLock::new(0.0)),
            last_error: Arc::new(RwLock::new(None)),
        }
    }

    pub fn get_engine_dir(&self) -> &Path {
        &self.engine_dir
    }

    pub fn manifest_path(&self) -> PathBuf {
        self.engine_dir.join("manifest.json")
    }

    pub fn binary_candidates() -> &'static [&'static str] {
        if cfg!(windows) {
            &["sd-cli.exe", "sd.exe", "sd-server.exe", "sd"]
        } else {
            &["sd-cli", "sd", "sd-server"]
        }
    }

    pub fn binary_name() -> &'static str {
        if cfg!(windows) {
            "sd-cli.exe"
        } else {
            "sd-cli"
        }
    }

    pub fn binary_path(&self) -> PathBuf {
        let candidates = Self::binary_candidates();

        // 1. Check directly in engine_dir
        for name in candidates {
            let direct = self.engine_dir.join(name);
            if direct.is_file() {
                return direct;
            }
        }

        // 2. Check in bin/ subdirectory
        for name in candidates {
            let bin_nested = self.engine_dir.join("bin").join(name);
            if bin_nested.is_file() {
                return bin_nested;
            }
        }

        // 3. Search nested subdirectories
        if let Ok(entries) = fs::read_dir(&self.engine_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    for name in candidates {
                        let nested = entry.path().join(name);
                        if nested.is_file() {
                            return nested;
                        }
                        let bin_nested = entry.path().join("bin").join(name);
                        if bin_nested.is_file() {
                            return bin_nested;
                        }
                    }
                }
            }
        }

        self.engine_dir.join(Self::binary_name())
    }

    /// Read the installed engine manifest if available
    pub fn read_manifest(&self) -> Option<EngineManifest> {
        let path = self.manifest_path();
        if path.exists() {
            if let Ok(content) = fs::read_to_string(path) {
                return serde_json::from_str(&content).ok();
            }
        }
        None
    }

    /// Write or update the engine manifest
    pub fn write_manifest(&self, manifest: &EngineManifest) -> Result<()> {
        let content = serde_json::to_string_pretty(manifest)?;
        fs::write(self.manifest_path(), content)?;
        Ok(())
    }

    /// Check if the binary is present and executable
    pub fn is_installed(&self) -> bool {
        self.binary_path().exists()
    }

    /// Returns current status of the engine
    pub fn get_status(&self) -> EngineStatus {
        let installed = self.is_installed();
        let manifest = self.read_manifest();
        let binary_path = if installed {
            Some(self.binary_path().to_string_lossy().to_string())
        } else {
            None
        };

        let is_dl = *self.is_downloading.read().unwrap();
        let prog = *self.download_progress.read().unwrap();
        let err = self.last_error.read().unwrap().clone();

        EngineStatus {
            installed,
            version: manifest.as_ref().map(|m| m.version.clone()),
            backend: manifest.as_ref().map(|m| m.backend.clone()),
            binary_path,
            installed_at: manifest.as_ref().map(|m| m.installed_at),
            is_running: false,
            is_downloading: is_dl,
            download_progress: if is_dl { Some(prog) } else { None },
            error: err,
        }
    }

    /// Detect system hardware (OS, GPU, VRAM, RAM, Storage) and recommend backend & model
    pub fn detect_hardware() -> HardwareProfile {
        {
            let lock = HARDWARE_PROFILE_CACHE.lock().unwrap_or_else(|e| e.into_inner());
            if let Some((instant, ref hw)) = *lock {
                if instant.elapsed() < std::time::Duration::from_secs(30) {
                    return hw.clone();
                }
            }
        }

        let mut sys = System::new_all();
        sys.refresh_all();

        let os = std::env::consts::OS.to_string();
        let arch = std::env::consts::ARCH.to_string();
        let total_ram_mb = sys.total_memory() / (1024 * 1024);
        let available_ram_mb = Some(sys.available_memory() / (1024 * 1024));

        let cpu_brand = sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default();
        let npu_info = crate::server::routes::system::detect_npu_tpu(&cpu_brand);
        let npu_detected = npu_info.get("detected").and_then(|v| v.as_bool());
        let npu_label = npu_info.get("label").and_then(|v| v.as_str()).map(|s| s.to_string()).filter(|s| !s.is_empty());

        let mut gpu_name: Option<String> = None;
        let mut vram_mb: Option<u64> = None;
        #[allow(unused_mut)]
        let mut has_rocm_driver = false;

        // Try detecting GPU on Windows via powershell WMI or nvidia-smi
        #[cfg(windows)]
        {
            if let Ok(output) = crate::server::routes::system::silent_command("powershell")
                .args(["-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Sort-Object -Property AdapterRAM -Descending | Select-Object -First 1 Name, AdapterRAM | ConvertTo-Json"])
                .output()
            {
                if output.status.success() {
                    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(n) = val.get("Name").and_then(|v| v.as_str()) {
                            if !n.is_empty() {
                                gpu_name = Some(n.to_string());
                            }
                        }
                        if let Some(bytes) = val.get("AdapterRAM").and_then(|v| v.as_u64()) {
                            if bytes > 0 {
                                vram_mb = Some(bytes / (1024 * 1024));
                            }
                        }
                    }
                }
            }

            // Prefer nvidia-smi for NVIDIA precise VRAM if available
            if let Ok(output) = crate::server::routes::system::silent_command("nvidia-smi")
                .args(["--query-gpu=memory.total", "--format=csv,noheader,nounits"])
                .output()
            {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if let Ok(v) = text.parse::<u64>() {
                    vram_mb = Some(v);
                }
            }
        }

        // macOS Apple Silicon (M1/M2/M3/M4/M5) vs Intel Mac detection
        #[cfg(target_os = "macos")]
        {
            if arch == "aarch64" {
                let mut chip_name = "Apple Silicon GPU".to_string();
                if let Ok(output) = crate::server::routes::system::silent_command("sysctl")
                    .args(["-n", "machdep.cpu.brand_string"])
                    .output()
                {
                    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !name.is_empty() {
                        chip_name = format!("{} (Metal)", name);
                    }
                }
                gpu_name = Some(chip_name);

                // Unified memory budget scaling:
                // >= 32GB: 85% budget for AI compute
                // >= 16GB: 80% budget
                // Base 8GB: 75% budget
                let factor = if total_ram_mb >= 32768 {
                    85
                } else if total_ram_mb >= 16384 {
                    80
                } else {
                    75
                };
                vram_mb = Some((total_ram_mb * factor) / 100);
            } else {
                gpu_name = Some("Intel Mac Integrated / Dedicated GPU".to_string());
                vram_mb = Some(2048);
            }
        }

        // Linux GPU detection: NVIDIA, AMD ROCm/Vulkan, and Intel Arc
        #[cfg(target_os = "linux")]
        {
            // 1. Check NVIDIA via nvidia-smi
            if let Ok(output) = crate::server::routes::system::silent_command("nvidia-smi")
                .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
                .output()
            {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let parts: Vec<&str> = text.split(',').collect();
                if let Some(n) = parts.first() {
                    gpu_name = Some(n.trim().to_string());
                }
                if let Some(v) = parts.get(1) {
                    if let Ok(val) = v.trim().parse::<u64>() {
                        vram_mb = Some(val);
                    }
                }
            }

            // 2. Check for AMD ROCm kernel driver (/dev/kfd)
            if std::path::Path::new("/dev/kfd").exists() {
                has_rocm_driver = true;
            }

            // 3. Fallback: Check sysfs for AMD / Intel Arc GPU
            if gpu_name.is_none() {
                if let Ok(entries) = std::fs::read_dir("/sys/class/drm") {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let name_str = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        if name_str.starts_with("card") && !name_str.contains('-') {
                            let vram_path = path.join("device").join("mem_info_vram_total");
                            if vram_path.exists() {
                                if let Ok(content) = std::fs::read_to_string(&vram_path) {
                                    if let Ok(bytes) = content.trim().parse::<u64>() {
                                        vram_mb = Some(bytes / (1024 * 1024));
                                        if has_rocm_driver {
                                            gpu_name = Some("AMD Radeon GPU (ROCm)".to_string());
                                        } else {
                                            gpu_name = Some("AMD Radeon GPU (Vulkan)".to_string());
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Determine recommended backend
        let is_apple_silicon = os == "macos" && arch == "aarch64";
        let gpu_lower = gpu_name.as_ref().map(|n| n.to_lowercase()).unwrap_or_default();
        let has_nvidia = gpu_lower.contains("nvidia") || gpu_lower.contains("geforce") || gpu_lower.contains("rtx") || gpu_lower.contains("gtx") || gpu_lower.contains("quadro") || gpu_lower.contains("tesla");
        let has_amd = gpu_lower.contains("amd") || gpu_lower.contains("radeon");
        let has_intel_arc = gpu_lower.contains("intel") && (gpu_lower.contains("arc") || gpu_lower.contains("iris") || gpu_lower.contains("xe"));

        let recommended_backend = if is_apple_silicon {
            GpuBackend::Metal
        } else if has_nvidia {
            GpuBackend::Cuda
        } else if has_amd && has_rocm_driver {
            GpuBackend::Rocm
        } else if has_amd || has_intel_arc || gpu_name.is_some() {
            GpuBackend::Vulkan
        } else if os == "macos" {
            GpuBackend::Cpu
        } else {
            GpuBackend::Cpu
        };

        // Determine storage space
        let disks = sysinfo::Disks::new_with_refreshed_list();
        let (storage_free_gb, storage_total_gb, storage_mount) = if let Some(first_disk) = disks.iter().next() {
            let free_gb = ((first_disk.available_space() as f64) / (1024.0 * 1024.0 * 1024.0) * 10.0).round() / 10.0;
            let total_gb = ((first_disk.total_space() as f64) / (1024.0 * 1024.0 * 1024.0) * 10.0).round() / 10.0;
            let mount = first_disk.mount_point().to_string_lossy().to_string();
            (Some(free_gb), Some(total_gb), Some(mount))
        } else {
            (None, None, None)
        };

        // Determine recommended model based on available VRAM / unified memory & GPU capabilities
        let effective_vram = if is_apple_silicon {
            (total_ram_mb * 3) / 4
        } else {
            vram_mb.unwrap_or(2048)
        };

        let recommended_model_id = if is_apple_silicon {
            if total_ram_mb >= 32768 {
                "flux-schnell".to_string()
            } else if total_ram_mb >= 16384 {
                "sdxl".to_string()
            } else {
                // 8GB - 12GB unified memory Mac
                "sd15".to_string()
            }
        } else if has_nvidia || has_amd || has_intel_arc {
            if effective_vram >= 12288 {
                "flux-schnell".to_string()
            } else if effective_vram >= 6144 {
                "sdxl".to_string()
            } else {
                // 4GB VRAM or less (e.g. GTX 1650, RTX 3050 4GB, Radeon RX 6400):
                "sd15".to_string()
            }
        } else if effective_vram >= 8192 {
            "sdxl".to_string()
        } else {
            "sd15".to_string()
        };

        let profile = HardwareProfile {
            os,
            arch,
            gpu_name,
            vram_mb,
            total_ram_mb,
            available_ram_mb,
            recommended_backend,
            recommended_model_id,
            storage_free_gb,
            storage_total_gb,
            storage_mount,
            npu_detected,
            npu_label,
        };

        let mut lock = HARDWARE_PROFILE_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        *lock = Some((std::time::Instant::now(), profile.clone()));
        profile
    }

    /// Install or download the stable-diffusion.cpp engine from upstream GitHub Releases
    pub async fn install(&self, backend_override: Option<GpuBackend>) -> Result<()> {
        let hw = Self::detect_hardware();
        let backend = backend_override.unwrap_or(hw.recommended_backend);

        {
            let mut dl = self.is_downloading.write().unwrap();
            *dl = true;
            let mut prog = self.download_progress.write().unwrap();
            *prog = 0.05;
            let mut err = self.last_error.write().unwrap();
            *err = None;
        }

        let engine_dir = self.engine_dir.clone();
        let is_downloading = self.is_downloading.clone();
        let download_progress = self.download_progress.clone();
        let last_error = self.last_error.clone();

        tokio::spawn(async move {
            info!("Starting engine installation for backend: {:?}", backend);
            let client = reqwest::Client::builder()
                .user_agent("SuperAgent-EngineManager/1.0")
                .tcp_keepalive(Some(std::time::Duration::from_secs(30)))
                .connect_timeout(std::time::Duration::from_secs(30))
                .pool_idle_timeout(std::time::Duration::from_secs(90))
                .redirect(reqwest::redirect::Policy::limited(10))
                .build()
                .unwrap_or_default();

            // Fetch latest release metadata from GitHub
            let release_url = "https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest";
            let release_json: serde_json::Value = match client.get(release_url).send().await {
                Ok(r) if r.status().is_success() => match r.json().await {
                    Ok(j) => j,
                    Err(e) => {
                        let msg = format!("Failed to parse release JSON: {}", e);
                        error!("{}", msg);
                        *last_error.write().unwrap() = Some(msg);
                        *is_downloading.write().unwrap() = false;
                        return;
                    }
                },
                Ok(r) => {
                    let msg = format!("GitHub API returned HTTP {}", r.status());
                    error!("{}", msg);
                    *last_error.write().unwrap() = Some(msg);
                    *is_downloading.write().unwrap() = false;
                    return;
                }
                Err(e) => {
                    let msg = format!("Failed to query GitHub API: {}", e);
                    error!("{}", msg);
                    *last_error.write().unwrap() = Some(msg);
                    *is_downloading.write().unwrap() = false;
                    return;
                }
            };

            let tag_name = release_json["tag_name"].as_str().unwrap_or("latest").to_string();
            let assets = match release_json["assets"].as_array() {
                Some(a) => a,
                None => {
                    *last_error.write().unwrap() = Some("No assets found in release".to_string());
                    *is_downloading.write().unwrap() = false;
                    return;
                }
            };

            // Score and prioritize assets
            let os_filter = if cfg!(windows) {
                "win"
            } else if cfg!(target_os = "macos") {
                "darwin"
            } else {
                "linux"
            };

            let mut matched_asset = None;
            let mut best_score = -1;

            for asset in assets {
                let name = asset["name"].as_str().unwrap_or("").to_lowercase();
                if !name.ends_with(".zip") && !name.ends_with(".tar.gz") {
                    continue;
                }

                let matches_os = if os_filter == "darwin" {
                    name.contains("darwin") || name.contains("macos") || name.contains("arm64")
                } else {
                    name.contains(os_filter)
                };
                if !matches_os {
                    continue;
                }

                let mut score = 0;
                // Prioritize main binary package
                if name.starts_with("sd-") {
                    score += 20;
                }

                match backend {
                    GpuBackend::Cuda => {
                        if name.contains("cuda12") || name.contains("cuda") || name.contains("cu12") {
                            score += 50;
                        }
                    }
                    GpuBackend::Vulkan => {
                        if name.contains("vulkan") {
                            score += 50;
                        }
                    }
                    GpuBackend::Metal => {
                        if name.contains("arm64") || name.contains("macos") || name.contains("metal") {
                            score += 50;
                        }
                    }
                    GpuBackend::Rocm => {
                        if name.contains("rocm") || name.contains("hip") {
                            score += 50;
                        } else if name.contains("vulkan") {
                            score += 40; // Fallback to Vulkan for AMD GPUs if no ROCm binary in release
                        }
                    }
                    GpuBackend::Cpu => {
                        if name.contains("cpu") || (!name.contains("cuda") && !name.contains("vulkan") && !name.contains("rocm")) {
                            score += 50;
                        }
                    }
                }

                if score > best_score {
                    best_score = score;
                    matched_asset = Some(asset);
                }
            }

            let asset = match matched_asset {
                Some(a) => a,
                None => {
                    let msg = format!("No compatible engine build found for {} ({:?})", os_filter, backend);
                    error!("{}", msg);
                    *last_error.write().unwrap() = Some(msg);
                    *is_downloading.write().unwrap() = false;
                    return;
                }
            };

            let asset_name = asset["name"].as_str().unwrap_or("sd-cpp.zip");
            let download_url = match asset["browser_download_url"].as_str() {
                Some(u) => u.to_string(),
                None => {
                    *last_error.write().unwrap() = Some("Missing download URL in asset".to_string());
                    *is_downloading.write().unwrap() = false;
                    return;
                }
            };

            let total_size_hint = asset["size"].as_u64().unwrap_or(0);
            info!("Downloading engine build '{}' from {}", asset_name, download_url);
            *download_progress.write().unwrap() = 0.10;

            let download_res = match client.get(&download_url).send().await {
                Ok(r) if r.status().is_success() => r,
                Ok(r) => {
                    let msg = format!("Download failed: HTTP {}", r.status());
                    error!("{}", msg);
                    *last_error.write().unwrap() = Some(msg);
                    *is_downloading.write().unwrap() = false;
                    return;
                }
                Err(e) => {
                    let msg = format!("Download connection error: {}", e);
                    error!("{}", msg);
                    *last_error.write().unwrap() = Some(msg);
                    *is_downloading.write().unwrap() = false;
                    return;
                }
            };

            let total_size = download_res.content_length().unwrap_or(total_size_hint);
            let archive_path = engine_dir.join(asset_name);

            let file_create_res = tokio::fs::File::create(&archive_path).await;
            let mut file = match file_create_res {
                Ok(f) => f,
                Err(e) => {
                    let msg = format!("Failed to create archive file: {}", e);
                    error!("{}", msg);
                    *last_error.write().unwrap() = Some(msg);
                    *is_downloading.write().unwrap() = false;
                    return;
                }
            };

            let mut stream = download_res.bytes_stream();
            let mut downloaded: u64 = 0;

            while let Some(chunk_res) = stream.next().await {
                match chunk_res {
                    Ok(chunk) => {
                        if let Err(e) = file.write_all(&chunk).await {
                            let msg = format!("Failed writing archive chunk: {}", e);
                            error!("{}", msg);
                            *last_error.write().unwrap() = Some(msg);
                            *is_downloading.write().unwrap() = false;
                            return;
                        }
                        downloaded += chunk.len() as u64;
                        if total_size > 0 {
                            let fraction = (downloaded as f32) / (total_size as f32);
                            let progress = 0.10 + (fraction * 0.75).clamp(0.0, 0.75);
                            *download_progress.write().unwrap() = progress;
                        }
                    }
                    Err(e) => {
                        let msg = format!("Download stream interrupted: {}", e);
                        error!("{}", msg);
                        *last_error.write().unwrap() = Some(msg);
                        *is_downloading.write().unwrap() = false;
                        return;
                    }
                }
            }

            if let Err(e) = file.flush().await {
                let msg = format!("Failed to flush archive file: {}", e);
                error!("{}", msg);
                *last_error.write().unwrap() = Some(msg);
                *is_downloading.write().unwrap() = false;
                return;
            }
            drop(file);

            *download_progress.write().unwrap() = 0.88;

            // Backup existing binary if present
            let current_bin = engine_dir.join(Self::binary_name());
            let backup_bin = engine_dir.join(format!("{}.bak", Self::binary_name()));
            if current_bin.exists() {
                let _ = fs::copy(&current_bin, &backup_bin);
            }

            // Extract using native zip
            info!("Extracting {} into {}", archive_path.display(), engine_dir.display());
            if let Err(e) = extract_zip_archive(&archive_path, &engine_dir) {
                let msg = format!("Extraction failed: {}", e);
                error!("{}", msg);
                *last_error.write().unwrap() = Some(msg);
                *is_downloading.write().unwrap() = false;
                return;
            }

            // Clean up archive file
            let _ = fs::remove_file(&archive_path);

            *download_progress.write().unwrap() = 0.95;

            // Write manifest
            let manifest = EngineManifest {
                version: tag_name.clone(),
                backend,
                binary_name: Self::binary_name().to_string(),
                installed_at: chrono::Utc::now().timestamp(),
                sha256: String::new(),
                source_url: download_url,
            };

            let manifest_content = serde_json::to_string_pretty(&manifest).unwrap_or_default();
            let _ = fs::write(engine_dir.join("manifest.json"), manifest_content);

            *download_progress.write().unwrap() = 1.0;
            *is_downloading.write().unwrap() = false;
            info!("Engine successfully installed version {}", tag_name);
        });

        Ok(())
    }

    /// Check for engine updates
    pub async fn check_update(&self) -> Result<Option<UpdateInfo>> {
        let manifest = match self.read_manifest() {
            Some(m) => m,
            None => return Ok(None),
        };

        let client = reqwest::Client::builder()
            .user_agent("SuperAgent-EngineManager/1.0")
            .build()?;

        let release_url = "https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest";
        let release_json: serde_json::Value = client.get(release_url).send().await?.json().await?;

        let latest = release_json["tag_name"].as_str().unwrap_or("").to_string();
        let changelog = release_json["body"].as_str().map(|s| s.to_string());

        if !latest.is_empty() && latest != manifest.version {
            let download_url = release_json["html_url"].as_str().unwrap_or("").to_string();
            Ok(Some(UpdateInfo {
                current: manifest.version,
                latest,
                changelog,
                download_url,
            }))
        } else {
            Ok(None)
        }
    }

    /// Rollback engine to previous backup binary
    pub fn rollback(&self) -> Result<()> {
        let bin_name = Self::binary_name();
        let current_bin = self.engine_dir.join(bin_name);
        let backup_bin = self.engine_dir.join(format!("{}.bak", bin_name));

        if !backup_bin.exists() {
            return Err(anyhow!("No backup binary found to rollback to"));
        }

        fs::copy(&backup_bin, &current_bin)?;
        info!("Successfully rolled back to previous engine binary");
        Ok(())
    }

    /// Uninstall the engine
    pub fn uninstall(&self) -> Result<()> {
        if self.engine_dir.exists() {
            fs::remove_dir_all(&self.engine_dir)?;
            let _ = fs::create_dir_all(&self.engine_dir);
            info!("Successfully uninstalled image engine");
        }
        Ok(())
    }

    /// Dynamically construct hardware-acceleration, backend, and memory management arguments for sd-cli
    pub fn build_acceleration_args(&self, req: &GenerateImageRequest, model_path: &Path) -> Vec<String> {
        let hw = Self::detect_hardware();
        let mut args: Vec<String> = Vec::new();

        let is_apple_silicon = hw.os == "macos" && hw.arch == "aarch64";
        let available_vram_mb = hw.vram_mb.unwrap_or(2048);

        // 1. Model size estimation
        let model_size_mb = if let Ok(meta) = std::fs::metadata(model_path) {
            (meta.len() / (1024 * 1024)) as u64
        } else {
            3000
        };

        // 2. RNG method and Backend targeting
        match hw.recommended_backend {
            GpuBackend::Cuda => {
                args.push("--rng".to_string());
                args.push("cuda".to_string());
            }
            GpuBackend::Metal => {
                // Metal auto-targets Apple Silicon GPU
                args.push("--rng".to_string());
                args.push("cpu".to_string());
            }
            GpuBackend::Vulkan | GpuBackend::Rocm => {
                args.push("--rng".to_string());
                args.push("cpu".to_string());
            }
            GpuBackend::Cpu => {
                args.push("--rng".to_string());
                args.push("cpu".to_string());
                let threads = std::thread::available_parallelism()
                    .map(|n| n.get())
                    .unwrap_or(4)
                    .max(1);
                args.push("-t".to_string());
                args.push(threads.to_string());
            }
        }

        // 3. Dynamic Offload Strategy:
        // - On Apple Silicon (Metal): NEVER offload to CPU because memory is 100% unified.
        // - On CPU mode: Offloading to CPU is not applicable.
        // - On Discrete GPUs (CUDA / Vulkan / ROCm):
        //   If model size > 85% of available VRAM, offload weights to CPU RAM to prevent CUDA Out Of Memory.
        //   If model fits in VRAM (e.g. SD 1.5 ~1.5GB on 4GB VRAM), DO NOT offload, keeping execution 100% inside GPU VRAM.
        let needs_offload = if is_apple_silicon || hw.recommended_backend == GpuBackend::Cpu {
            false
        } else {
            model_size_mb > (available_vram_mb * 85 / 100)
        };

        if needs_offload {
            args.push("--offload-to-cpu".to_string());
        }

        // 4. VAE Tiling:
        // VAE decode is memory-intensive at high resolutions.
        // Tiling is enabled if model is large (>2.2GB weights) or available VRAM is under 6GB on high-res (>512x512).
        let width = req.width.unwrap_or(1024);
        let height = req.height.unwrap_or(1024);
        let is_high_res = (width * height) > (512 * 512);
        let needs_tiling = !is_apple_silicon && (model_size_mb > 2200 || available_vram_mb < 6144 || is_high_res);
        if needs_tiling {
            args.push("--vae-tiling".to_string());
        }

        // 5. Flash Attention:
        // Accelerates attention matrices and reduces memory footprint
        if matches!(
            hw.recommended_backend,
            GpuBackend::Cuda | GpuBackend::Metal | GpuBackend::Vulkan | GpuBackend::Rocm
        ) {
            args.push("--fa".to_string());
        }

        // 6. Max VRAM budget for discrete GPUs (when model fits in VRAM)
        if !is_apple_silicon && hw.recommended_backend != GpuBackend::Cpu && !needs_offload && available_vram_mb >= 3072 {
            let budget_gib = (available_vram_mb as f64 / 1024.0 * 0.90).floor();
            if budget_gib >= 2.0 {
                args.push("--max-vram".to_string());
                args.push(format!("{}", budget_gib as u32));
            }
        }

        args
    }

    /// Execute a local image generation via sd-cli asynchronously with real-time step progress streaming
    pub async fn execute_generation_streaming(
        &self,
        req: &GenerateImageRequest,
        model_path: &Path,
        output_path: &Path,
        progress_tx: Option<tokio::sync::mpsc::Sender<GenerationProgressEvent>>,
    ) -> Result<u64> {
        let bin = self.binary_path();
        if !bin.exists() {
            return Err(anyhow!(
                "Image engine binary not found at '{}'. Please install the local image engine first.",
                bin.display()
            ));
        }

        let start = Instant::now();
        let width = req.width.unwrap_or(1024);
        let height = req.height.unwrap_or(1024);
        let steps = req.steps.unwrap_or(20);
        let cfg_scale = req.cfg_scale.unwrap_or(7.0);

        let mut cmd = tokio::process::Command::new(&bin);
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(0x08000000);
        }

        cmd.args([
            "-m",
            &model_path.to_string_lossy(),
            "-p",
            &req.prompt,
            "-o",
            &output_path.to_string_lossy(),
            "-W",
            &width.to_string(),
            "-H",
            &height.to_string(),
            "--steps",
            &steps.to_string(),
            "--cfg-scale",
            &cfg_scale.to_string(),
        ]);

        let perf_args = self.build_acceleration_args(req, model_path);
        cmd.args(&perf_args);

        if let Some(ref neg) = req.negative_prompt {
            if !neg.is_empty() {
                cmd.args(["-n", neg]);
            }
        }

        if let Some(seed) = req.seed {
            cmd.args(["-s", &seed.to_string()]);
        }

        if let Some(ref sampler) = req.sampler {
            if !sampler.is_empty() {
                cmd.args(["--sampling-method", sampler]);
            }
        }

        if let Some(ref init_img_path) = req.init_image {
            if !init_img_path.is_empty() {
                cmd.args(["--init-img", init_img_path]);
                if let Some(strength) = req.strength {
                    cmd.args(["--strength", &strength.to_string()]);
                }
            }
        }

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        info!("Spawning async sd-cli: {:?}", cmd);
        let mut child = cmd.spawn().map_err(|e| anyhow!("Failed to spawn sd-cli: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Send initial progress event
        if let Some(ref tx) = progress_tx {
            let _ = tx.send(GenerationProgressEvent {
                step: 0,
                total_steps: steps,
                progress: 0.0,
                phase: "Loading model weights into VRAM...".to_string(),
                step_time_ms: None,
                eta_seconds: None,
                elapsed_seconds: 0.0,
                preview_data_url: None,
            }).await;
        }

        let mut all_logs = String::new();
        let mut last_step = 0u32;
        let mut last_step_time = Instant::now();
        let mut step_durations: Vec<f32> = Vec::new();

        use tokio::io::AsyncReadExt;

        let (line_tx, mut line_rx) = tokio::sync::mpsc::channel::<String>(200);

        if let Some(mut out) = stdout {
            let tx = line_tx.clone();
            tokio::spawn(async move {
                let mut buf = [0u8; 2048];
                let mut accumulator = Vec::new();
                while let Ok(n) = out.read(&mut buf).await {
                    if n == 0 {
                        break;
                    }
                    for &byte in &buf[..n] {
                        if byte == b'\r' || byte == b'\n' {
                            if !accumulator.is_empty() {
                                let s = String::from_utf8_lossy(&accumulator).trim().to_string();
                                accumulator.clear();
                                if !s.is_empty() {
                                    if tx.send(s).await.is_err() {
                                        return;
                                    }
                                }
                            }
                        } else {
                            accumulator.push(byte);
                        }
                    }
                }
                if !accumulator.is_empty() {
                    let s = String::from_utf8_lossy(&accumulator).trim().to_string();
                    let _ = tx.send(s).await;
                }
            });
        }

        if let Some(mut err) = stderr {
            let tx = line_tx;
            tokio::spawn(async move {
                let mut buf = [0u8; 2048];
                let mut accumulator = Vec::new();
                while let Ok(n) = err.read(&mut buf).await {
                    if n == 0 {
                        break;
                    }
                    for &byte in &buf[..n] {
                        if byte == b'\r' || byte == b'\n' {
                            if !accumulator.is_empty() {
                                let s = String::from_utf8_lossy(&accumulator).trim().to_string();
                                accumulator.clear();
                                if !s.is_empty() {
                                    if tx.send(s).await.is_err() {
                                        return;
                                    }
                                }
                            }
                        } else {
                            accumulator.push(byte);
                        }
                    }
                }
                if !accumulator.is_empty() {
                    let s = String::from_utf8_lossy(&accumulator).trim().to_string();
                    let _ = tx.send(s).await;
                }
            });
        }

        while let Some(line) = line_rx.recv().await {
            all_logs.push_str(&line);
            all_logs.push('\n');

            if let Some(parsed) = parse_step_from_line(&line, steps) {
                let now = Instant::now();
                let step_elapsed_s = now.duration_since(last_step_time).as_secs_f32();
                last_step_time = now;

                let cur_step = parsed.current_step;
                let tot_steps = parsed.total_steps;

                if cur_step > last_step && cur_step > 1 {
                    step_durations.push(step_elapsed_s);
                    if step_durations.len() > 10 {
                        step_durations.remove(0);
                    }
                }
                if cur_step > 0 {
                    last_step = cur_step;
                }

                let avg_step_s = if let Some(speed) = parsed.speed_s_per_it {
                    speed
                } else if !step_durations.is_empty() {
                    step_durations.iter().sum::<f32>() / step_durations.len() as f32
                } else {
                    step_elapsed_s
                };

                let remaining_steps = tot_steps.saturating_sub(cur_step);
                let eta_s = remaining_steps as f32 * avg_step_s;
                let step_ms = (avg_step_s * 1000.0) as u64;
                let elapsed_s = start.elapsed().as_secs_f32();
                let frac = parsed.progress;

                let phase = parsed.phase.unwrap_or_else(|| {
                    if cur_step > 0 {
                        format!("Sampling diffusion latents (Step {}/{})", cur_step, tot_steps)
                    } else {
                        "Processing diffusion pipeline...".to_string()
                    }
                });

                if let Some(ref tx) = progress_tx {
                    let _ = tx.send(GenerationProgressEvent {
                        step: cur_step,
                        total_steps: tot_steps,
                        progress: frac.clamp(0.0, 1.0),
                        phase,
                        step_time_ms: if cur_step > 0 { Some(step_ms) } else { None },
                        eta_seconds: if cur_step > 0 { Some(eta_s) } else { None },
                        elapsed_seconds: elapsed_s,
                        preview_data_url: None,
                    }).await;
                }
            }
        }

        let status = child.wait().await.map_err(|e| anyhow!("Failed to wait on sd-cli: {}", e))?;

        if !status.success() {
            let combined = all_logs.to_lowercase();
            let is_oom = combined.contains("out of memory")
                || combined.contains("bad_alloc")
                || combined.contains("failed to allocate")
                || combined.contains("cannot allocate")
                || combined.contains("exceeded memory")
                || combined.contains("metal: failed to allocate memory")
                || combined.contains("cuda out of memory")
                || combined.contains("killed")
                || combined.contains("abort trap")
                || combined.contains("segmentation fault");

            #[cfg(unix)]
            let is_sigkill = {
                use std::os::unix::process::ExitStatusExt;
                status.signal() == Some(9) || status.code() == Some(137)
            };
            #[cfg(not(unix))]
            let is_sigkill = false;

            if is_oom || is_sigkill {
                return Err(anyhow!(
                    "Out of Memory: The system ran out of available memory (RAM/VRAM) while generating the image. We recommend closing background applications to free up RAM, or switching to Stable Diffusion 1.5 which requires significantly less memory."
                ));
            }

            return Err(anyhow!("sd-cli execution failed:\n{}", all_logs));
        }

        let elapsed = start.elapsed().as_millis() as u64;
        Ok(elapsed)
    }

    /// Execute a local image generation via sd-cli (synchronous wrapper)
    pub fn execute_generation(
        &self,
        req: &GenerateImageRequest,
        model_path: &Path,
        output_path: &Path,
    ) -> Result<u64> {
        let bin = self.binary_path();
        if !bin.exists() {
            return Err(anyhow!(
                "Image engine binary not found at '{}'. Please install the local image engine first.",
                bin.display()
            ));
        }

        let start = Instant::now();
        let width = req.width.unwrap_or(1024);
        let height = req.height.unwrap_or(1024);
        let steps = req.steps.unwrap_or(20);
        let cfg_scale = req.cfg_scale.unwrap_or(7.0);

        let mut cmd = crate::server::routes::system::silent_command(&bin);
        cmd.args([
            "-m",
            &model_path.to_string_lossy(),
            "-p",
            &req.prompt,
            "-o",
            &output_path.to_string_lossy(),
            "-W",
            &width.to_string(),
            "-H",
            &height.to_string(),
            "--steps",
            &steps.to_string(),
            "--cfg-scale",
            &cfg_scale.to_string(),
        ]);

        let perf_args = self.build_acceleration_args(req, model_path);
        cmd.args(&perf_args);

        if let Some(ref neg) = req.negative_prompt {
            if !neg.is_empty() {
                cmd.args(["-n", neg]);
            }
        }

        if let Some(seed) = req.seed {
            cmd.args(["-s", &seed.to_string()]);
        }

        if let Some(ref sampler) = req.sampler {
            if !sampler.is_empty() {
                cmd.args(["--sampling-method", sampler]);
            }
        }

        if let Some(ref init_img_path) = req.init_image {
            if !init_img_path.is_empty() {
                cmd.args(["--init-img", init_img_path]);
                if let Some(strength) = req.strength {
                    cmd.args(["--strength", &strength.to_string()]);
                }
            }
        }

        info!("Spawning sd-cli: {:?}", cmd);
        let output = cmd.output().map_err(|e| anyhow!("Failed to execute sd-cli: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let combined = format!("{}\n{}", stderr, stdout).to_lowercase();

            let is_oom = combined.contains("out of memory")
                || combined.contains("bad_alloc")
                || combined.contains("failed to allocate")
                || combined.contains("cannot allocate")
                || combined.contains("exceeded memory")
                || combined.contains("metal: failed to allocate memory")
                || combined.contains("cuda out of memory")
                || combined.contains("killed")
                || combined.contains("abort trap")
                || combined.contains("segmentation fault");

            #[cfg(unix)]
            let is_sigkill = {
                use std::os::unix::process::ExitStatusExt;
                output.status.signal() == Some(9) || output.status.code() == Some(137)
            };
            #[cfg(not(unix))]
            let is_sigkill = false;

            if is_oom || is_sigkill {
                return Err(anyhow!(
                    "Out of Memory: The system ran out of available memory (RAM/VRAM) while generating the image. We recommend closing background applications to free up RAM, or switching to Stable Diffusion 1.5 which requires significantly less memory."
                ));
            }

            return Err(anyhow!("sd-cli execution failed: {}\n{}", stderr, stdout));
        }

        let elapsed = start.elapsed().as_millis() as u64;
        Ok(elapsed)
    }
}

#[derive(Debug, Clone)]
pub struct ParsedStepInfo {
    pub current_step: u32,
    pub total_steps: u32,
    pub progress: f32,
    pub speed_s_per_it: Option<f32>,
    pub phase: Option<String>,
}

/// Helper to parse step progress from sd-cli stdout/stderr line
fn parse_step_from_line(line: &str, default_total_steps: u32) -> Option<ParsedStepInfo> {
    let lower = line.to_lowercase();
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    // 1. Detect phase keywords
    let mut phase: Option<String> = None;
    if lower.contains("decoding") || lower.contains("decode_first_stage") || lower.contains("decoding 1 latents") {
        phase = Some("Decoding VAE latents into pixels...".to_string());
    } else if lower.contains("sampling completed") {
        phase = Some("Sampling complete. Preparing VAE decoding...".to_string());
    } else if lower.contains("sampling using") || lower.contains("get_sigmas") {
        phase = Some(format!("Sampling diffusion latents (0/{})...", default_total_steps));
    } else if lower.contains("loading model") || lower.contains("loading tensors") || lower.contains("load ") {
        phase = Some("Loading model weights into GPU VRAM...".to_string());
    } else if lower.contains("save result") || lower.contains("saving") || lower.contains("images saved") {
        phase = Some("Finalizing & saving output image...".to_string());
    }

    // 2. Extract speed if present (e.g. "4.13s/it", "500ms/it", "2.15it/s")
    let mut speed_s_per_it: Option<f32> = None;
    if let Some(pos) = lower.rfind("s/it") {
        let before = &lower[..pos];
        let num_str: String = before
            .chars()
            .rev()
            .take_while(|c| c.is_ascii_digit() || *c == '.')
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        if let Ok(v) = num_str.parse::<f32>() {
            speed_s_per_it = Some(v);
        }
    } else if let Some(pos) = lower.rfind("it/s") {
        let before = &lower[..pos];
        let num_str: String = before
            .chars()
            .rev()
            .take_while(|c| c.is_ascii_digit() || *c == '.')
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        if let Ok(v) = num_str.parse::<f32>() {
            if v > 0.0 {
                speed_s_per_it = Some(1.0 / v);
            }
        }
    }

    // 3. Extract "X/Y" step fraction.
    // If multiple "X/Y" exist in the line (due to \r or multi-token logging), pick the LAST valid one.
    let tokens: Vec<&str> = line
        .split(|c: char| c == ' ' || c == '|' || c == '[' || c == ']' || c == '(' || c == ')' || c == '\t')
        .filter(|s| !s.is_empty())
        .collect();

    let mut last_fraction: Option<(u32, u32)> = None;

    for token in tokens {
        if let Some(slash_idx) = token.find('/') {
            let left = &token[..slash_idx];
            let right = &token[slash_idx + 1..];
            if let (Ok(cur), Ok(tot)) = (left.parse::<u32>(), right.parse::<u32>()) {
                if tot > 0 && cur <= tot {
                    last_fraction = Some((cur, tot));
                }
            }
        }
    }

    if let Some((cur, tot)) = last_fraction {
        // Classify the step based on total count and line context
        let detected_phase = if (line.contains('#') || lower.contains("mb/s") || lower.contains("gb/s")) && tot > 100 {
            Some(format!("Loading model weights ({}/{})", cur, tot))
        } else if tot != default_total_steps || lower.contains("latent") || lower.contains("decod") || lower.contains("tile") {
            Some(format!("Decoding VAE latent tiles (Tile {}/{})", cur, tot))
        } else {
            Some(format!("Sampling diffusion latents (Step {}/{})", cur, tot))
        };

        let frac = (cur as f32 / tot as f32).clamp(0.0, 1.0);
        return Some(ParsedStepInfo {
            current_step: cur,
            total_steps: tot,
            progress: frac,
            speed_s_per_it,
            phase: detected_phase.or(phase),
        });
    }

    // 4. If no fraction found but phase was detected
    if let Some(p) = phase {
        return Some(ParsedStepInfo {
            current_step: 0,
            total_steps: default_total_steps,
            progress: 0.0,
            speed_s_per_it,
            phase: Some(p),
        });
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sampling_step() {
        let line = "[INFO ]   |=========================>                        | 12/25 - 4.13s/it";
        let parsed = parse_step_from_line(line, 25).expect("Should parse step");
        assert_eq!(parsed.current_step, 12);
        assert_eq!(parsed.total_steps, 25);
        assert_eq!(parsed.speed_s_per_it, Some(4.13));
        assert!(parsed.phase.unwrap().contains("Step 12/25"));
    }

    #[test]
    fn test_parse_vae_tile_decoding() {
        let line = "[INFO ]   |=====>                                            | 1/9 - 2.31s/it";
        let parsed = parse_step_from_line(line, 20).expect("Should parse VAE tile");
        assert_eq!(parsed.current_step, 1);
        assert_eq!(parsed.total_steps, 9);
        assert_eq!(parsed.speed_s_per_it, Some(2.31));
        assert!(parsed.phase.unwrap().contains("Tile 1/9"));
    }

    #[test]
    fn test_parse_multi_chunk_line() {
        let line = "[INFO ]   |=========================>                        | 1/2 - 5.50s/it  |==================================================| 2/2 - 4.13s/it";
        let parsed = parse_step_from_line(line, 2).expect("Should parse last chunk");
        assert_eq!(parsed.current_step, 2);
        assert_eq!(parsed.total_steps, 2);
        assert_eq!(parsed.speed_s_per_it, Some(4.13));
    }

    #[test]
    fn test_parse_phase_transitions() {
        let line1 = "stable-diffusion.cpp:5335 - decoding 1 latents";
        let parsed1 = parse_step_from_line(line1, 20).expect("Should parse decoding phase");
        assert!(parsed1.phase.unwrap().contains("Decoding VAE"));

        let line2 = "main.cpp:497  - save result image 0 to 'test.png' (success)";
        let parsed2 = parse_step_from_line(line2, 20).expect("Should parse save phase");
        assert!(parsed2.phase.unwrap().contains("saving output"));
    }

    #[test]
    fn test_hardware_detection() {
        let hw = EngineManager::detect_hardware();
        assert!(!hw.os.is_empty());
        assert!(!hw.arch.is_empty());
        assert!(hw.total_ram_mb > 0);
        assert!(!hw.recommended_model_id.is_empty());
    }

    #[test]
    fn test_build_acceleration_args() {
        let engine = EngineManager::new();
        let req = GenerateImageRequest {
            prompt: "a majestic lion".to_string(),
            negative_prompt: None,
            model_id: Some("sd15".to_string()),
            mode: Some("local".to_string()),
            width: Some(512),
            height: Some(512),
            steps: Some(20),
            cfg_scale: Some(7.0),
            seed: None,
            sampler: None,
            init_image: None,
            strength: None,
        };
        let dummy_path = PathBuf::from("sd_model.gguf");
        let args = engine.build_acceleration_args(&req, &dummy_path);
        // Ensure acceleration arguments are populated
        assert!(!args.is_empty());
    }
}

