use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, RwLock};
use std::time::Instant;

use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use sysinfo::System;
use tokio::io::AsyncWriteExt;
use tracing::{error, info};

use crate::image_workspace::types::{
    EngineManifest, EngineStatus, GenerateImageRequest, GpuBackend, HardwareProfile, UpdateInfo,
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

    /// Detect system hardware (OS, GPU, VRAM, RAM) and recommend backend & model
    pub fn detect_hardware() -> HardwareProfile {
        let mut sys = System::new_all();
        sys.refresh_all();

        let os = std::env::consts::OS.to_string();
        let arch = std::env::consts::ARCH.to_string();
        let total_ram_mb = sys.total_memory() / (1024 * 1024);

        let mut gpu_name: Option<String> = None;
        let mut vram_mb: Option<u64> = None;

        // Try detecting GPU on Windows via powershell WMI or nvidia-smi
        #[cfg(windows)]
        {
            if let Ok(output) = Command::new("powershell")
                .args(["-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name"])
                .output()
            {
                let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !name.is_empty() {
                    gpu_name = Some(name);
                }
            }

            // Try nvidia-smi for VRAM
            if let Ok(output) = Command::new("nvidia-smi")
                .args(["--query-gpu=memory.total", "--format=csv,noheader,nounits"])
                .output()
            {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if let Ok(v) = text.parse::<u64>() {
                    vram_mb = Some(v);
                }
            }
        }

        // macOS Apple Silicon detection
        #[cfg(target_os = "macos")]
        {
            if arch == "aarch64" {
                gpu_name = Some("Apple Silicon GPU".to_string());
                vram_mb = Some(total_ram_mb); // Unified memory
            }
        }

        // Linux GPU detection
        #[cfg(target_os = "linux")]
        {
            if let Ok(output) = Command::new("nvidia-smi")
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
        }

        // Determine recommended backend
        let is_apple_silicon = os == "macos" && arch == "aarch64";
        let has_nvidia = gpu_name.as_ref().map(|n| n.to_lowercase().contains("nvidia") || n.to_lowercase().contains("geforce") || n.to_lowercase().contains("rtx") || n.to_lowercase().contains("gtx")).unwrap_or(false);

        let recommended_backend = if is_apple_silicon {
            GpuBackend::Metal
        } else if has_nvidia {
            GpuBackend::Cuda
        } else if gpu_name.is_some() {
            GpuBackend::Vulkan
        } else {
            GpuBackend::Cpu
        };

        // Determine recommended model based on available VRAM
        let effective_vram = vram_mb.unwrap_or(if is_apple_silicon { total_ram_mb } else { 2048 });
        let recommended_model_id = if effective_vram >= 8192 {
            "flux-schnell".to_string()
        } else if effective_vram >= 4096 {
            "sdxl".to_string()
        } else {
            "sd15".to_string()
        };

        HardwareProfile {
            os,
            arch,
            gpu_name,
            vram_mb,
            total_ram_mb,
            recommended_backend,
            recommended_model_id,
        }
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

    /// Execute a local image generation via sd-cli
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

        let mut cmd = Command::new(&bin);
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

        info!("Spawning sd-cli: {:?}", cmd);
        let output = cmd.output().map_err(|e| anyhow!("Failed to execute sd-cli: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(anyhow!("sd-cli execution failed: {}\n{}", stderr, stdout));
        }

        let elapsed = start.elapsed().as_millis() as u64;
        Ok(elapsed)
    }
}
