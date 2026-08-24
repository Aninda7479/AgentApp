use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RunnableSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub prompt: String,
    pub discovered: bool,
    pub origin: String,
}

pub fn get_builtin_skills() -> Vec<RunnableSkill> {
    vec![
        RunnableSkill {
            id: "explain".to_string(),
            name: "explain".to_string(),
            description: "Explain how the selected code / file works, step by step".to_string(),
            prompt: "Explain the currently relevant code in this project. Walk through the key files, their responsibilities, and how data flows between them. Be concrete and cite file paths.".to_string(),
            discovered: false,
            origin: "builtin".to_string(),
        },
        RunnableSkill {
            id: "write-tests".to_string(),
            name: "write-tests".to_string(),
            description: "Generate a test suite for the project using its existing framework".to_string(),
            prompt: "Look at this project, detect its language and test framework, and write a meaningful test suite covering the core modules. Create the test files and run them to verify they pass.".to_string(),
            discovered: false,
            origin: "builtin".to_string(),
        },
        RunnableSkill {
            id: "scaffold".to_string(),
            name: "scaffold".to_string(),
            description: "Scaffold a new project (pick a sensible stack and structure)".to_string(),
            prompt: "Scaffold a new project in this directory. Choose a sensible language and folder structure for the goal, create the entry files, and verify it builds/runs.".to_string(),
            discovered: false,
            origin: "builtin".to_string(),
        },
        RunnableSkill {
            id: "refactor".to_string(),
            name: "refactor".to_string(),
            description: "Review the codebase and apply safe refactors".to_string(),
            prompt: "Review this codebase for duplication, dead code, and unclear structure. Propose and apply safe refactors, then verify nothing breaks.".to_string(),
            discovered: false,
            origin: "builtin".to_string(),
        },
        RunnableSkill {
            id: "docs".to_string(),
            name: "docs".to_string(),
            description: "Generate a README and inline documentation for the project".to_string(),
            prompt: "Generate clear documentation for this project: a README with setup, usage, and architecture notes, plus any missing inline doc comments for public APIs.".to_string(),
            discovered: false,
            origin: "builtin".to_string(),
        },
        RunnableSkill {
            id: "fix".to_string(),
            name: "fix".to_string(),
            description: "Find and fix the most likely bug reported in the last message".to_string(),
            prompt: "Find and fix the bug described in the user request. Reproduce it, locate the root cause, apply a minimal fix, and verify it with a test or command.".to_string(),
            discovered: false,
            origin: "builtin".to_string(),
        },
    ]
}

/// Parses a markdown skill file with optional YAML frontmatter.
pub fn parse_skill_file<P: AsRef<Path>>(file_path: P, origin: &str) -> Option<RunnableSkill> {
    let p = file_path.as_ref();
    let content = fs::read_to_string(p).ok()?;

    let mut name = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("skill")
        .to_string();

    if name.eq_ignore_ascii_case("skill") || name.eq_ignore_ascii_case("readme") {
        if let Some(parent) = p.parent().and_then(|p| p.file_name()).and_then(|s| s.to_str()) {
            if parent != "skills" && parent != ".claude" && parent != ".superagent" {
                name = parent.to_string();
            }
        }
    }

    let mut description = "Discovered skill".to_string();

    // Check for YAML frontmatter
    if content.starts_with("---") {
        if let Some(end_idx) = content[3..].find("---") {
            let frontmatter = &content[3..3 + end_idx];
            for line in frontmatter.lines() {
                if let Some((k, v)) = line.split_once(':') {
                    let key = k.trim().to_lowercase();
                    let val = v.trim().trim_matches('"').trim_matches('\'').to_string();
                    if key == "name" {
                        name = val;
                    } else if key == "description" {
                        description = val;
                    }
                }
            }
        }
    } else {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("# ") {
                name = trimmed.trim_start_matches("# ").trim().to_string();
                break;
            }
        }
    }

    let id = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect::<String>();

    Some(RunnableSkill {
        id,
        prompt: format!("Use the \"{}\" skill. {}\n\n{}", name, description, content),
        name,
        description,
        discovered: true,
        origin: origin.to_string(),
    })
}

/// Discovers skill markdown files across local workspace and global user directories.
pub fn discover_project_skills(root: &Path) -> Vec<RunnableSkill> {
    let home = superagent_core_v2::storage::get_home_dir();
    let locations: Vec<(PathBuf, &'static str)> = vec![
        (root.join(".superagent").join("skills"), "local .superagent"),
        (root.join(".claude").join("skills"), "local .claude"),
        (root.join(".agents").join("skills"), "local .agents"),
        (root.join("skills"), "local skills"),
        (home.join(".superagent").join("skills"), "global .superagent"),
        (home.join(".claude").join("skills"), "global .claude"),
    ];

    let mut found = Vec::new();
    let mut seen_ids = HashSet::new();

    for (dir, origin) in locations {
        if !dir.is_dir() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let mut candidate = None;

                if path.is_dir() {
                    let s = path.join("SKILL.md");
                    let p = path.join("prompt.md");
                    let r = path.join("README.md");
                    if s.is_file() {
                        candidate = Some(s);
                    } else if p.is_file() {
                        candidate = Some(p);
                    } else if r.is_file() {
                        candidate = Some(r);
                    }
                } else if path.is_file() {
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if ext.eq_ignore_ascii_case("md") {
                            candidate = Some(path);
                        }
                    }
                }

                if let Some(skill_file) = candidate {
                    if let Some(skill) = parse_skill_file(&skill_file, origin) {
                        if !seen_ids.contains(&skill.id) {
                            seen_ids.insert(skill.id.clone());
                            found.push(skill);
                        }
                    }
                }
            }
        }
    }

    found
}

/// Returns the merged list of all built-in and discovered skills.
pub fn get_runnable_skills(root: &Path) -> Vec<RunnableSkill> {
    let mut skills = get_builtin_skills();
    let mut seen_ids: HashSet<String> = skills.iter().map(|s| s.id.clone()).collect();

    for discovered in discover_project_skills(root) {
        if !seen_ids.contains(&discovered.id) {
            seen_ids.insert(discovered.id.clone());
            skills.push(discovered);
        }
    }

    skills
}
