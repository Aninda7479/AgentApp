use serde::{Deserialize, Serialize};

fn default_artifact_type() -> String {
    "static".to_string()
}

fn default_entry() -> String {
    "index.html".to_string()
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ArtifactManifest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub version: String,
    #[serde(rename = "type", default = "default_artifact_type")]
    pub artifact_type: String, // "web", "python", "node", "static"
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
    #[serde(default = "default_entry")]
    pub entry: String,
    #[serde(default)]
    pub port: Option<u16>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ArtifactRuntimeState {
    pub id: String,
    pub manifest: ArtifactManifest,
    pub status: String, // "stopped", "running", "error"
    pub port: Option<u16>,
    pub url: Option<String>,
    pub path: String,
}
