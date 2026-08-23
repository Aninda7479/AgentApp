use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub icon: String,
    pub is_available: bool,
    pub transport: String,
    pub required_keys: Vec<String>,
}

pub fn get_curated_integrations() -> Vec<IntegrationEntry> {
    vec![
        IntegrationEntry {
            id: "composio".to_string(),
            name: "Composio SaaS Bridge".to_string(),
            description: "Connect 200+ authenticated tools including Gmail, Calendar, Slack, WhatsApp, X/Twitter, LinkedIn, and Notion.".to_string(),
            category: "Universal Gateway".to_string(),
            icon: "🔌".to_string(),
            is_available: true,
            transport: "http".to_string(),
            required_keys: vec!["COMPOSIO_API_KEY".to_string()],
        },
        IntegrationEntry {
            id: "github-mcp".to_string(),
            name: "GitHub MCP Server".to_string(),
            description: "Query repositories, search issues, open pull requests, and inspect commits via GitHub API.".to_string(),
            category: "Developer Tools".to_string(),
            icon: "🐙".to_string(),
            is_available: true,
            transport: "stdio".to_string(),
            required_keys: vec!["GITHUB_PERSONAL_ACCESS_TOKEN".to_string()],
        },
        IntegrationEntry {
            id: "postgres-mcp".to_string(),
            name: "PostgreSQL MCP".to_string(),
            description: "Read schema tables, inspect relational structures, and execute safe parameterized queries.".to_string(),
            category: "Databases".to_string(),
            icon: "🐘".to_string(),
            is_available: true,
            transport: "stdio".to_string(),
            required_keys: vec!["DATABASE_URL".to_string()],
        },
        IntegrationEntry {
            id: "telegram".to_string(),
            name: "Telegram Bot Notifications".to_string(),
            description: "Send autonomous routine completion alerts and morning briefings to your Telegram account.".to_string(),
            category: "Messaging".to_string(),
            icon: "✈️".to_string(),
            is_available: true,
            transport: "http".to_string(),
            required_keys: vec!["TELEGRAM_BOT_TOKEN".to_string(), "TELEGRAM_CHAT_ID".to_string()],
        },
    ]
}
