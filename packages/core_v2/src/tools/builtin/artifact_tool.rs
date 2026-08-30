use std::collections::HashMap;
use std::path::{Path, PathBuf};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};

use crate::artifact::{ArtifactManifest, ArtifactRuntimeState};
use crate::storage::settings::get_superagent_dir;
use crate::tools::r#trait::Tool;

fn get_artifacts_storage_dir() -> PathBuf {
    let sa_dir = get_superagent_dir();
    let dir = sa_dir.join("artifacts");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir
}

fn sanitize_artifact_id(raw: &str) -> String {
    let sanitized: String = raw
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c.to_ascii_lowercase() } else { '-' })
        .collect();
    let trimmed = sanitized.trim_matches('-');
    if trimmed.is_empty() {
        format!("artifact-{}", uuid::Uuid::new_v4().to_string().chars().take(8).collect::<String>())
    } else {
        trimmed.to_string()
    }
}

/// Helper function to validate that an artifact sub-path is safely inside the artifact folder.
fn validate_path_in_artifact(path_str: &str, artifact_dir: &Path) -> Result<PathBuf> {
    let target = Path::new(path_str);
    if target.is_absolute() {
        anyhow::bail!("Security Error: Absolute paths inside artifact are forbidden");
    }
    for comp in target.components() {
        match comp {
            std::path::Component::ParentDir => {
                anyhow::bail!("Security Error: Parent directory '..' traversal is forbidden");
            }
            std::path::Component::Prefix(_) | std::path::Component::RootDir => {
                anyhow::bail!("Security Error: Root or prefix paths inside artifact are forbidden");
            }
            _ => {}
        }
    }
    Ok(artifact_dir.join(target))
}

/// Tool for creating or updating interactive micro-app artifacts safely in ~/.superagent/artifacts
pub struct CreateArtifactTool;

impl CreateArtifactTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CreateArtifactTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for CreateArtifactTool {
    fn name(&self) -> &str {
        "create_artifact"
    }

    fn description(&self) -> &str {
        "Creates or updates an interactive micro-app artifact (web widget, dashboard, calculator, game, scraper, tool) in SuperAgent's Artifacts repository (~/.superagent/artifacts). Automatically generates manifest.json and writes all application files (HTML, CSS, JS, Python, etc.)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Unique identifier slug for the artifact (e.g. 'pomodoro-timer', 'kanban-board', 'unit-converter'). Will be converted to lowercase alphanumeric and hyphens."
                },
                "name": {
                    "type": "string",
                    "description": "Human-readable display name of the artifact (e.g. 'Pomodoro Focus Timer', 'Kanban Board')"
                },
                "description": {
                    "type": "string",
                    "description": "Short summary explaining what the artifact does"
                },
                "type": {
                    "type": "string",
                    "enum": ["web", "static", "python", "node"],
                    "description": "Runtime type: 'web' or 'static' for HTML/CSS/JS web apps, 'python' for Python scripts, 'node' for Node.js servers (default: 'web')"
                },
                "entry": {
                    "type": "string",
                    "description": "Main entry file name (default: 'index.html' for web/static, 'main.py' for python, 'index.js' for node)"
                },
                "icon": {
                    "type": "string",
                    "description": "Optional icon or emoji (e.g. 'Clock', 'Sparkles', 'Code', 'Calculator', 'Zap')"
                },
                "files": {
                    "type": "object",
                    "description": "Map of relative filenames to their string content (e.g. { 'index.html': '<!DOCTYPE html>...', 'styles.css': '...', 'app.js': '...' })"
                },
                "html": {
                    "type": "string",
                    "description": "Shorthand for providing single-file index.html content directly if 'files' is not supplied"
                }
            },
            "required": ["name"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let name = input["name"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required parameter 'name'"))?;

        let raw_id = input["id"]
            .as_str()
            .unwrap_or(name);
        let id = sanitize_artifact_id(raw_id);

        let description = input["description"]
            .as_str()
            .unwrap_or("SuperAgent interactive micro-app artifact")
            .to_string();

        let artifact_type = input["type"]
            .as_str()
            .unwrap_or("web")
            .to_string();

        let default_entry = match artifact_type.as_str() {
            "python" => "main.py",
            "node" => "index.js",
            _ => "index.html",
        };

        let entry = input["entry"]
            .as_str()
            .unwrap_or(default_entry)
            .to_string();

        let icon = input["icon"]
            .as_str()
            .map(|s| s.to_string());

        let storage_root = get_artifacts_storage_dir();
        let artifact_dir = storage_root.join(&id);
        tokio::fs::create_dir_all(&artifact_dir)
            .await
            .map_err(|e| anyhow!("Failed to create artifact directory '{}': {}", artifact_dir.display(), e))?;

        // 1. Prepare files map
        let mut files_to_write: HashMap<String, String> = HashMap::new();

        if let Some(files_obj) = input.get("files").and_then(|f| f.as_object()) {
            for (fname, content_val) in files_obj {
                if let Some(content_str) = content_val.as_str() {
                    files_to_write.insert(fname.clone(), content_str.to_string());
                }
            }
        }

        if files_to_write.is_empty() {
            if let Some(html) = input.get("html").and_then(|h| h.as_str()) {
                files_to_write.insert(entry.clone(), html.to_string());
            } else if let Some(code) = input.get("code").and_then(|c| c.as_str()) {
                files_to_write.insert(entry.clone(), code.to_string());
            }
        }

        if files_to_write.is_empty() {
            // Provide a default template if none supplied
            let default_html = format!(
                r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{}</title>
  <script src="/api/artifacts/sdk.js"></script>
  <style>
    body {{
      font-family: system-ui, -apple-system, sans-serif;
      padding: 2rem;
      background: #0f172a;
      color: #f8fafc;
      margin: 0;
    }}
    .card {{
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 1rem;
      padding: 1.5rem;
      max-width: 600px;
      margin: 0 auto;
      backdrop-filter: blur(12px);
    }}
  </style>
</head>
<body>
  <div class="card">
    <h2>{}</h2>
    <p>{}</p>
  </div>
</body>
</html>"#,
                name, name, description
            );
            files_to_write.insert(entry.clone(), default_html);
        }

        // 2. Write all application files safely inside the artifact directory
        for (rel_path, content) in &files_to_write {
            let safe_file_path = validate_path_in_artifact(rel_path, &artifact_dir)?;
            if let Some(parent) = safe_file_path.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            tokio::fs::write(&safe_file_path, content)
                .await
                .map_err(|e| anyhow!("Failed to write artifact file '{}': {}", safe_file_path.display(), e))?;
        }

        // 3. Write manifest.json
        let manifest = ArtifactManifest {
            name: name.to_string(),
            description: description.clone(),
            version: "1.0.0".to_string(),
            artifact_type: artifact_type.clone(),
            icon,
            logo: None,
            entry: entry.clone(),
            port: Some(3080),
        };

        let manifest_file = artifact_dir.join("manifest.json");
        let manifest_json = serde_json::to_string_pretty(&manifest)?;
        tokio::fs::write(&manifest_file, manifest_json)
            .await
            .map_err(|e| anyhow!("Failed to write manifest.json: {}", e))?;

        let file_count = files_to_write.len();
        let file_names: Vec<String> = files_to_write.keys().cloned().collect();

        Ok(format!(
            "Successfully created Artifact '{}' (id: '{}') with {} file(s): [{}].\nArtifact directory: {}\nPreview in SuperAgent Artifacts page or via URL: http://localhost:1469/api/artifacts/{}/view/",
            name,
            id,
            file_count,
            file_names.join(", "),
            artifact_dir.display(),
            id
        ))
    }
}

/// Tool for listing all installed artifacts in ~/.superagent/artifacts
pub struct ListArtifactsTool;

impl ListArtifactsTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ListArtifactsTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for ListArtifactsTool {
    fn name(&self) -> &str {
        "list_artifacts"
    }

    fn description(&self) -> &str {
        "Lists all installed interactive micro-app artifacts from SuperAgent's artifacts directory (~/.superagent/artifacts)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {}
        })
    }

    async fn execute(&self, _input: Value) -> Result<String> {
        let storage_root = get_artifacts_storage_dir();
        let mut artifacts: Vec<ArtifactRuntimeState> = Vec::new();

        if let Ok(mut entries) = tokio::fs::read_dir(&storage_root).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if path.is_dir() {
                    let manifest_path = path.join("manifest.json");
                    if let Ok(content) = tokio::fs::read_to_string(&manifest_path).await {
                        if let Ok(manifest) = serde_json::from_str::<ArtifactManifest>(&content) {
                            let id = path
                                .file_name()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_default();

                            let port = manifest.port.unwrap_or(3080);
                            artifacts.push(ArtifactRuntimeState {
                                id,
                                manifest,
                                status: "ready".to_string(),
                                port: Some(port),
                                url: Some(format!("http://localhost:1469/api/artifacts/{}/view/", path.file_name().unwrap_or_default().to_string_lossy())),
                                path: path.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }

        if artifacts.is_empty() {
            return Ok("No artifacts currently installed in ~/.superagent/artifacts. Use 'create_artifact' to build one!".to_string());
        }

        let json_output = serde_json::to_string_pretty(&artifacts)?;
        Ok(json_output)
    }
}

/// Tool for reading an artifact's manifest and file contents
pub struct ReadArtifactTool;

impl ReadArtifactTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ReadArtifactTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for ReadArtifactTool {
    fn name(&self) -> &str {
        "read_artifact"
    }

    fn description(&self) -> &str {
        "Reads the manifest.json or a specific file from an installed artifact in ~/.superagent/artifacts."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Artifact ID slug to read"
                },
                "file": {
                    "type": "string",
                    "description": "Relative file path to read within the artifact (e.g. 'index.html', 'manifest.json'). Defaults to 'manifest.json'."
                }
            },
            "required": ["id"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let id_str = input["id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required parameter 'id'"))?;

        let id = sanitize_artifact_id(id_str);
        let storage_root = get_artifacts_storage_dir();
        let artifact_dir = storage_root.join(&id);

        if !artifact_dir.exists() {
            anyhow::bail!("Artifact with id '{}' was not found in '{}'", id, storage_root.display());
        }

        let file_rel = input["file"]
            .as_str()
            .unwrap_or("manifest.json");

        let target_file = validate_path_in_artifact(file_rel, &artifact_dir)?;
        if !target_file.exists() {
            anyhow::bail!("File '{}' not found in artifact '{}'", file_rel, id);
        }

        let content = tokio::fs::read_to_string(&target_file)
            .await
            .map_err(|e| anyhow!("Failed to read '{}': {}", target_file.display(), e))?;

        Ok(content)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_and_list_artifact() {
        let tool = CreateArtifactTool::new();
        let input = json!({
            "id": "unit-test-timer",
            "name": "Test Timer",
            "description": "A timer created by unit test",
            "type": "web",
            "entry": "index.html",
            "files": {
                "index.html": "<!DOCTYPE html><html><body><h1>Timer</h1></body></html>",
                "style.css": "body { background: black; }"
            }
        });

        let res = tool.execute(input).await.unwrap();
        assert!(res.contains("unit-test-timer"));

        let read_tool = ReadArtifactTool::new();
        let read_res = read_tool.execute(json!({ "id": "unit-test-timer", "file": "index.html" })).await.unwrap();
        assert!(read_res.contains("Timer"));

        let list_tool = ListArtifactsTool::new();
        let list_res = list_tool.execute(json!({})).await.unwrap();
        assert!(list_res.contains("unit-test-timer"));
    }
}

/// Tool that allows any model (including Tier 3 small models) to query its enabled capabilities and tools.
pub struct GetAvailableToolsTool {
    tools_summary: Vec<(String, String)>,
}

impl GetAvailableToolsTool {
    pub fn new(tools_summary: Vec<(String, String)>) -> Self {
        Self { tools_summary }
    }
}

#[async_trait]
impl Tool for GetAvailableToolsTool {
    fn name(&self) -> &str {
        "get_available_tools"
    }

    fn description(&self) -> &str {
        "Returns the list of all tools and capabilities currently enabled for you in this session, with their names and descriptions. Call this when asked about your tools or capabilities."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {}
        })
    }

    async fn execute(&self, _input: Value) -> Result<String> {
        if self.tools_summary.is_empty() {
            return Ok("No tools are currently enabled in this session. You can provide direct text and code responses.".to_string());
        }

        let mut out = String::from("Currently available tools in this session:\n\n");
        for (name, desc) in &self.tools_summary {
            out.push_str(&format!("- **{}**: {}\n", name, desc));
        }
        out.push_str("\nYou can call any of the tools listed above to fulfill user requests.");
        Ok(out)
    }
}
