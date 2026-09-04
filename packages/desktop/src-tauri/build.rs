fn main() {
    // Ensure externalBin placeholder or actual binaries exist so tauri_build does not panic during check/dev
    if let Ok(target) = std::env::var("TARGET") {
        let ext = if target.contains("windows") { ".exe" } else { "" };
        let binaries_dir = std::path::Path::new("binaries");
        let _ = std::fs::create_dir_all(binaries_dir);

        for bin in &["circle-native", "dictation-native"] {
            let bin_filename = format!("{}-{}{}", bin, target, ext);
            let bin_path = binaries_dir.join(&bin_filename);
            if !bin_path.exists() {
                // Check if binary was compiled into workspace target directory
                let target_dirs = [
                    std::path::PathBuf::from(format!("../../../target/release/superagent-{}{}", bin, ext)),
                    std::path::PathBuf::from(format!("../../../target/debug/superagent-{}{}", bin, ext)),
                    std::path::PathBuf::from(format!("../../../target/{}/release/superagent-{}{}", target, bin, ext)),
                    std::path::PathBuf::from(format!("../../../target/{}/debug/superagent-{}{}", target, bin, ext)),
                ];

                let mut copied = false;
                for candidate in &target_dirs {
                    if candidate.exists() {
                        if std::fs::copy(candidate, &bin_path).is_ok() {
                            copied = true;
                            break;
                        }
                    }
                }

                if !copied {
                    // Create placeholder stub so tauri_build succeeds during check/dev
                    let _ = std::fs::write(&bin_path, b"");
                }
            }
        }
    }

    tauri_build::build();
}
