use std::path::{Path, PathBuf};
use anyhow::Result;


use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageProcessOptions {
    pub input_path: String,
    pub output_path: String,
    pub target_format: Option<String>,
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInpaintSpec {
    pub prompt: String,
    pub base_image_path: String,
    pub mask_image_path: Option<String>,
    pub output_path: String,
}

/// Validates and prepares image processing specs for native conversion or AI generation.
pub fn prepare_image_processing(options: &ImageProcessOptions, workspace_root: &Path) -> Result<PathBuf> {
    let input = Path::new(&options.input_path);
    let resolved_input = if input.is_absolute() {
        input.to_path_buf()
    } else {
        workspace_root.join(input)
    };

    if !resolved_input.exists() {
        anyhow::bail!("Input image does not exist: '{}'", resolved_input.display());
    }

    let output = Path::new(&options.output_path);
    let resolved_output = if output.is_absolute() {
        output.to_path_buf()
    } else {
        workspace_root.join(output)
    };

    if let Some(parent) = resolved_output.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }

    // Copy/touch output path destination
    std::fs::copy(&resolved_input, &resolved_output)?;
    Ok(resolved_output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_process_options() {
        let temp_dir = std::env::temp_dir().join(format!("test_img_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let src = temp_dir.join("input.png");

        std::fs::write(&src, b"fake_png_bytes").unwrap();


        let opts = ImageProcessOptions {
            input_path: "input.png".to_string(),
            output_path: "output.png".to_string(),
            target_format: Some("png".to_string()),
            max_width: Some(800),
            max_height: Some(600),
        };

        let result = prepare_image_processing(&opts, &temp_dir).unwrap();
        assert!(result.exists());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
