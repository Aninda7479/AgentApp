use std::fs;
use std::path::Path;

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

fn main() {
    println!("cargo:rerun-if-changed=ui-dist");
    println!("cargo:rerun-if-changed=../ui/dist");

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let ui_dist_dir = Path::new(&manifest_dir).join("ui-dist");
    let source_ui_dist = Path::new(&manifest_dir).join("../ui/dist");

    if !ui_dist_dir.exists() {
        let _ = fs::create_dir_all(&ui_dist_dir);
    }

    // If source packages/ui/dist exists and has index.html, sync files into ui-dist
    if source_ui_dist.exists() && source_ui_dist.join("index.html").exists() {
        let _ = copy_dir_all(&source_ui_dist, &ui_dist_dir);
    }

    // Ensure at least index.html exists so RustEmbed does not fail
    let index_file = ui_dist_dir.join("index.html");
    if !index_file.exists() {
        let placeholder = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SuperAgent</title>
</head>
<body>
  <div id="root">SuperAgent Web UI is preparing...</div>
</body>
</html>"#;
        let _ = fs::write(&index_file, placeholder);
    }
}
