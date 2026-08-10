use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const ACTIVE_FILE: &str = "active.json";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PartnerReaction {
    pub emoji: String,
    pub line: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PartnerManifest {
    pub schema: String,
    pub id: String,
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub version: Option<String>,
    pub description: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub accent: Option<String>,
    #[serde(default)]
    pub emoji: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub face_overlay: Option<bool>,
    #[serde(default)]
    pub laptop: Option<bool>,
    #[serde(default)]
    pub pillow: Option<bool>,
    #[serde(default)]
    pub reactions: Option<HashMap<String, PartnerReaction>>,
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default)]
    pub dp: Option<String>,
    #[serde(default)]
    pub dp_path: Option<String>,
    #[serde(default)]
    pub dp_url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ActivePartnerState {
    pub id: Option<String>,
}

pub fn get_partners_dir(user_data: &Path) -> PathBuf {
    user_data.join("partners")
}

pub fn get_default_lily(user_data: &Path) -> PartnerManifest {
    let lily_folder = user_data.join("lily").to_string_lossy().to_string();
    let mut reactions = HashMap::new();
    reactions.insert(
        "idle".to_string(),
        PartnerReaction {
            emoji: "🧍".to_string(),
            line: "Ready when you are.".to_string(),
        },
    );
    reactions.insert(
        "thinking".to_string(),
        PartnerReaction {
            emoji: "🤔".to_string(),
            line: "Hmm, let me think…".to_string(),
        },
    );
    reactions.insert(
        "working".to_string(),
        PartnerReaction {
            emoji: "💻".to_string(),
            line: "On it!".to_string(),
        },
    );
    reactions.insert(
        "happy".to_string(),
        PartnerReaction {
            emoji: "🙂".to_string(),
            line: "Nice.".to_string(),
        },
    );
    reactions.insert(
        "celebrate".to_string(),
        PartnerReaction {
            emoji: "🎉".to_string(),
            line: "Done!".to_string(),
        },
    );
    reactions.insert(
        "sad".to_string(),
        PartnerReaction {
            emoji: "😢".to_string(),
            line: "That didn't go well.".to_string(),
        },
    );
    reactions.insert(
        "sleeping".to_string(),
        PartnerReaction {
            emoji: "😴".to_string(),
            line: "zzz".to_string(),
        },
    );

    PartnerManifest {
        schema: "superagent-partner".to_string(),
        id: "lily".to_string(),
        name: "Lily".to_string(),
        kind: "girl".to_string(),
        version: Some("1.0.0".to_string()),
        description: "A cute anime companion who works, sleeps, and keeps you company.".to_string(),
        author: Some("SuperAgent".to_string()),
        accent: Some("#ff8fb3".to_string()),
        emoji: Some("🧍".to_string()),
        model: Some("models/lily/v1/girl_web.glb".to_string()),
        face_overlay: Some(false),
        laptop: Some(true),
        pillow: Some(true),
        reactions: Some(reactions),
        folder: Some(lily_folder),
        dp: None,
        dp_path: None,
        dp_url: None,
    }
}

pub fn is_valid_manifest(manifest: &PartnerManifest) -> bool {
    if manifest.schema != "superagent-partner" {
        return false;
    }
    if manifest.id.is_empty() || manifest.name.is_empty() || manifest.kind.is_empty() || manifest.description.is_empty() {
        return false;
    }
    manifest.id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

pub fn list_partners(user_data: &Path) -> Vec<PartnerManifest> {
    let mut out = Vec::new();
    out.push(get_default_lily(user_data));

    let partners_dir = get_partners_dir(user_data);
    if let Ok(entries) = fs::read_dir(&partners_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    if folder_name == "lily" {
                        continue;
                    }
                    let folder_path = entry.path();
                    let manifest_path = folder_path.join("partner.json");
                    if manifest_path.exists() {
                        if let Ok(raw) = fs::read_to_string(&manifest_path) {
                            if let Ok(mut manifest) = serde_json::from_str::<PartnerManifest>(&raw) {
                                if is_valid_manifest(&manifest) {
                                    manifest.folder = Some(folder_path.to_string_lossy().to_string());
                                    out.push(manifest);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    out
}

pub fn get_partner(user_data: &Path, id: &str) -> Option<PartnerManifest> {
    if id == "lily" {
        return Some(get_default_lily(user_data));
    }
    let folder_path = get_partners_dir(user_data).join(id);
    let manifest_path = folder_path.join("partner.json");
    if manifest_path.exists() {
        if let Ok(raw) = fs::read_to_string(&manifest_path) {
            if let Ok(mut manifest) = serde_json::from_str::<PartnerManifest>(&raw) {
                if is_valid_manifest(&manifest) {
                    manifest.folder = Some(folder_path.to_string_lossy().to_string());
                    return Some(manifest);
                }
            }
        }
    }
    None
}

pub fn set_active_partner(user_data: &Path, id: Option<String>) -> Result<(), String> {
    let dir = get_partners_dir(user_data);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let active_path = dir.join(ACTIVE_FILE);
    let state = ActivePartnerState { id };
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(active_path, json).map_err(|e| e.to_string())
}

pub fn get_active_partner(user_data: &Path) -> Option<String> {
    let active_path = get_partners_dir(user_data).join(ACTIVE_FILE);
    if active_path.exists() {
        if let Ok(raw) = fs::read_to_string(&active_path) {
            if let Ok(state) = serde_json::from_str::<ActivePartnerState>(&raw) {
                return state.id;
            }
        }
    }
    None
}

pub fn remove_partner(user_data: &Path, id: &str) -> Result<(), String> {
    if id == "lily" {
        return Err("Cannot remove built-in partner".to_string());
    }
    let target = get_partners_dir(user_data).join(id);
    if target.exists() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())?;
    }
    Ok(())
}
