use crate::shortcuts::history_search::HistorySearch;
use crate::skills::RunnableSkill;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PaletteItemKind {
    Command,
    Skill,
}

#[derive(Debug, Clone)]
pub struct PaletteItem {
    pub name: String,
    pub description: String,
    pub aliases: Vec<String>,
    pub kind: PaletteItemKind,
    pub origin: Option<String>,
    pub prompt: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CommandPaletteState {
    pub items: Vec<PaletteItem>,
    pub selected_index: usize,
    pub query: String,
}

impl CommandPaletteState {
    pub fn new(skills: &[RunnableSkill]) -> Self {
        let mut items = Vec::new();

        // Built-in slash commands
        let commands = [
            ("model", "List or switch AI models and providers", vec!["m"]),
            ("permissions", "Show, set, or cycle tool execution permission levels", vec!["perm"]),
            ("diff", "Review pending file modifications made by agent", vec!["d"]),
            ("compact", "Compact conversation context to save tokens", vec![]),
            ("doctor", "Run setup checkup and diagnostics", vec!["diag"]),
            ("init", "Generate project AGENTS.md in current directory", vec!["i"]),
            ("config", "Show SuperAgent configuration and paths", vec![]),
            ("mcp", "Show attached Model Context Protocol servers", vec![]),
            ("review", "Perform automated code review on current workspace", vec![]),
            ("security", "Run workspace security audit", vec![]),
            ("plan", "Generate detailed architectural implementation plan", vec![]),
            ("cost", "Display estimated session token cost", vec![]),
            ("startup", "Manage OS auto-start on boot (enable, disable, status)", vec![]),
            ("learn", "Self-improving skill loop: record insights, codify skills", vec!["l"]),
            ("theme", "List or switch terminal visual themes", vec!["t"]),
            ("status", "Show session status and server info", vec!["stat"]),
            ("btw", "Ask a quick side question without polluting history", vec![]),
            ("clear", "Clear conversation history", vec!["cls"]),
            ("help", "Show available slash commands and key shortcuts", vec!["h", "?"]),
            ("exit", "Quit SuperAgent", vec!["quit", "q"]),
        ];

        for (name, desc, aliases) in commands {
            items.push(PaletteItem {
                name: name.to_string(),
                description: desc.to_string(),
                aliases: aliases.into_iter().map(|s| s.to_string()).collect(),
                kind: PaletteItemKind::Command,
                origin: None,
                prompt: None,
            });
        }

        for skill in skills {
            items.push(PaletteItem {
                name: skill.name.clone(),
                description: skill.description.clone(),
                aliases: vec![],
                kind: PaletteItemKind::Skill,
                origin: Some(skill.origin.clone()),
                prompt: Some(skill.prompt.clone()),
            });
        }

        Self {
            items,
            selected_index: 0,
            query: String::new(),
        }
    }

    pub fn set_query(&mut self, query: String) {
        self.query = query;
        self.selected_index = 0;
    }

    pub fn filtered_items(&self) -> Vec<&PaletteItem> {
        let q = self.query.trim().trim_start_matches('/');
        if q.is_empty() {
            return self.items.iter().collect();
        }

        self.items
            .iter()
            .filter(|item| {
                HistorySearch::fuzzy_match(q, &item.name, false)
                    || item.aliases.iter().any(|a| HistorySearch::fuzzy_match(q, a, false))
                    || HistorySearch::fuzzy_match(q, &item.description, false)
            })
            .collect()
    }

    pub fn next(&mut self) {
        let count = self.filtered_items().len();
        if count > 0 {
            self.selected_index = (self.selected_index + 1) % count;
        }
    }

    pub fn previous(&mut self) {
        let count = self.filtered_items().len();
        if count > 0 {
            self.selected_index = if self.selected_index == 0 {
                count - 1
            } else {
                self.selected_index - 1
            };
        }
    }

    pub fn selected_item(&self) -> Option<&PaletteItem> {
        let filtered = self.filtered_items();
        if self.selected_index < filtered.len() {
            Some(filtered[self.selected_index])
        } else {
            None
        }
    }
}
