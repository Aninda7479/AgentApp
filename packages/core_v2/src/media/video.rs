use std::path::Path;
use anyhow::Result;


use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaTranscodeOptions {
    pub input_file: String,
    pub output_file: String,
    pub format: Option<String>,
    pub audio_only: Option<bool>,
}

/// Transcodes or extracts audio/video using system `ffmpeg`.
pub async fn transcode_media(options: &MediaTranscodeOptions, workspace_root: &Path) -> Result<String> {
    let input = Path::new(&options.input_file);
    let resolved_input = if input.is_absolute() {
        input.to_path_buf()
    } else {
        workspace_root.join(input)
    };

    if !resolved_input.exists() {
        anyhow::bail!("Input media file not found: '{}'", resolved_input.display());
    }

    let output = Path::new(&options.output_file);
    let resolved_output = if output.is_absolute() {
        output.to_path_buf()
    } else {
        workspace_root.join(output)
    };

    if let Some(parent) = resolved_output.parent() {
        if !parent.exists() {
            tokio::fs::create_dir_all(parent).await?;
        }
    }

    let mut cmd = Command::new("ffmpeg");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    cmd.arg("-y").arg("-i").arg(&resolved_input);

    if options.audio_only.unwrap_or(false) {
        cmd.arg("-vn").arg("-acodec").arg("libmp3lame");
    }

    cmd.arg(&resolved_output);

    let output_res = cmd.output().await;
    match output_res {
        Ok(out) => {
            if out.status.success() {
                Ok(format!("Successfully transcoded media to '{}'", resolved_output.display()))
            } else {
                let err_msg = String::from_utf8_lossy(&out.stderr);
                anyhow::bail!("FFmpeg transcode failed: {}", err_msg)
            }
        }
        Err(e) => {
            anyhow::bail!("Failed to execute ffmpeg: {}. Please ensure ffmpeg is installed.", e)
        }
    }
}
