use std::path::{Path, PathBuf};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};

use crate::tools::r#trait::Tool;

/// Tool for listing, discovering, and loading specialized agent skill instructions.
#[derive(Clone)]
pub struct SkillTool {
    workspace_root: PathBuf,
}

impl SkillTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }

    /// Resolves common skill directories in order of precedence:
    /// 1. `<workspace_root>/.superagent/skills`
    /// 2. `<workspace_root>/skills`
    /// 3. `~/.superagent/skills`
    /// 4. `~/.claude/skills`
    /// 5. `~/.gemini/antigravity/builtin/skills`
    fn get_search_directories(&self) -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        // Workspace-level skills
        dirs.push(self.workspace_root.join(".superagent").join("skills"));
        dirs.push(self.workspace_root.join("skills"));

        // Global user directories
        if let Some(home) = dirs_next() {
            dirs.push(home.join(".superagent").join("skills"));
            dirs.push(home.join(".claude").join("skills"));
            dirs.push(home.join(".gemini").join("antigravity").join("builtin").join("skills"));
        }

        dirs
    }
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiscoveredSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
}

#[async_trait]
impl Tool for SkillTool {
    fn name(&self) -> &str {
        "skill"
    }

    fn description(&self) -> &str {
        "Discovers, lists, and loads specialized agent skill instructions and workflows from the workspace and user environment."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "load", "show", "read"],
                    "description": "Action to perform: 'list' available skills, or 'load'/'show' full instructions for a specific skill (default: 'list')"
                },
                "name": {
                    "type": "string",
                    "description": "Skill name or ID to load (e.g. 'code-reviewer', 'playwright-cli')"
                },
                "skill_name": {
                    "type": "string",
                    "description": "Alternative key for skill name or ID"
                }
            }
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let action = input
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("list")
            .to_lowercase();

        let target_name = input
            .get("name")
            .or_else(|| input.get("skill_name"))
            .or_else(|| input.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();

        let search_dirs = self.get_search_directories();

        if (action == "load" || action == "show" || action == "read") && !target_name.is_empty() {
            // Find and load specific skill
            return self.load_skill(&search_dirs, target_name).await;
        }

        // Default or "list" action
        self.list_available_skills(&search_dirs).await
    }
}

impl SkillTool {
    async fn list_available_skills(&self, search_dirs: &[PathBuf]) -> Result<String> {
        let mut skills = Vec::new();

        for dir in search_dirs {
            if !dir.exists() {
                continue;
            }

            if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    if path.is_file() {
                        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        if filename.ends_with(".json") {
                            if let Ok(content) = tokio::fs::read_to_string(&path).await {
                                if let Ok(parsed) = serde_json::from_str::<Value>(&content) {
                                    let id = parsed.get("id").and_then(|v| v.as_str()).unwrap_or(filename).to_string();
                                    let name = parsed.get("name").and_then(|v| v.as_str()).unwrap_or(&id).to_string();
                                    let description = parsed.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    skills.push(DiscoveredSkill {
                                        id,
                                        name,
                                        description,
                                        path: path.display().to_string(),
                                    });
                                }
                            }
                        } else if filename.eq_ignore_ascii_case("skill.md") || filename.ends_with(".skill.md") {
                            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("skill");
                            skills.push(DiscoveredSkill {
                                id: stem.to_string(),
                                name: stem.to_string(),
                                description: "Markdown agent skill instructions".to_string(),
                                path: path.display().to_string(),
                            });
                        }
                    } else if path.is_dir() {
                        // Check for skill folder containing SKILL.md
                        let skill_md = path.join("SKILL.md");
                        let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("skill");
                        if skill_md.exists() {
                            skills.push(DiscoveredSkill {
                                id: dir_name.to_string(),
                                name: dir_name.to_string(),
                                description: format!("Skill directory: {}", dir_name),
                                path: skill_md.display().to_string(),
                            });
                        }
                    }
                }
            }
        }

        if skills.is_empty() {
            return Ok("No skills found. Skills can be placed in '.superagent/skills/' as JSON or SKILL.md files.".to_string());
        }

        let mut output = format!("Found {} available skill(s):\n\n", skills.len());
        output.push_str("| Skill Name / ID | Description | Location |\n");
        output.push_str("| :--- | :--- | :--- |\n");
        for s in &skills {
            output.push_str(&format!(
                "| `{}` | {} | `{}` |\n",
                s.name, s.description, s.path
            ));
        }
        output.push_str("\nTo load complete instructions for any skill, call: `skill(action: \"load\", name: \"<id>\")`");
        Ok(output)
    }

    async fn load_skill(&self, search_dirs: &[PathBuf], target: &str) -> Result<String> {
        let lower_target = target.to_lowercase();

        for dir in search_dirs {
            if !dir.exists() {
                continue;
            }

            // 1. Check direct file: <target>.json, <target>.md, <target>/SKILL.md
            let direct_json = dir.join(format!("{}.json", target));
            if direct_json.exists() {
                return self.read_skill_file(&direct_json).await;
            }

            let direct_folder_skill = dir.join(target).join("SKILL.md");
            if direct_folder_skill.exists() {
                return self.read_skill_file(&direct_folder_skill).await;
            }

            // 2. Iterate directory for fuzzy / case-insensitive match
            if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                    if name == lower_target || name.replace('_', "-") == lower_target.replace('_', "-") {
                        if path.is_file() {
                            return self.read_skill_file(&path).await;
                        } else if path.is_dir() {
                            let inner_skill = path.join("SKILL.md");
                            if inner_skill.exists() {
                                return self.read_skill_file(&inner_skill).await;
                            }
                        }
                    }
                }
            }
        }

        Err(anyhow!(
            "Skill '{}' not found across search directories. Use `skill(action: \"list\")` to see available skills.",
            target
        ))
    }

    async fn read_skill_file(&self, path: &Path) -> Result<String> {
        let content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| anyhow!("Failed to read skill at '{}': {}", path.display(), e))?;

        if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
            if let Ok(parsed) = serde_json::from_str::<Value>(&content) {
                let name = parsed.get("name").and_then(|v| v.as_str()).unwrap_or("Skill");
                let desc = parsed.get("description").and_then(|v| v.as_str()).unwrap_or("");
                let script = parsed.get("executionScript").or_else(|| parsed.get("execution_script")).and_then(|v| v.as_str()).unwrap_or("");

                let mut out = format!("# Skill: {}\n\n{}\n\n", name, desc);
                if !script.is_empty() {
                    out.push_str(&format!("## Execution Script\n```javascript\n{}\n```\n", script));
                }
                return Ok(out);
            }
        }

        Ok(content)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_skill_tool_list_and_load() {
        let temp_dir = std::env::temp_dir().join(format!("test_skills_{}", rand::random::<u32>()));
        let skills_dir = temp_dir.join(".superagent").join("skills");
        tokio::fs::create_dir_all(&skills_dir).await.unwrap();

        // Write a test skill JSON
        let skill_json = json!({
            "id": "code-review",
            "name": "Code Reviewer",
            "description": "Reviews code against best practices",
            "executionScript": "export async function run() { return true; }"
        });
        tokio::fs::write(skills_dir.join("code-review.json"), skill_json.to_string()).await.unwrap();

        let tool = SkillTool::new(temp_dir.clone());

        // Test listing skills
        let list_res = tool.execute(json!({ "action": "list" })).await.unwrap();
        assert!(list_res.contains("Code Reviewer"));
        assert!(list_res.contains("code-review"));

        // Test loading skill
        let load_res = tool.execute(json!({ "action": "load", "name": "code-review" })).await.unwrap();
        assert!(load_res.contains("# Skill: Code Reviewer"));
        assert!(load_res.contains("Reviews code against best practices"));
        assert!(load_res.contains("export async function run"));

        // Clean up
        let _ = tokio::fs::remove_dir_all(temp_dir).await;
    }
}
