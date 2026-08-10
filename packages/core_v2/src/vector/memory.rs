use std::collections::HashMap;
use std::path::Path;

use crate::vector::store::VectorStore;

/// Manages semantic memories using an underlying `VectorStore`.
#[derive(Debug, Clone, Default)]
pub struct SemanticMemoryManager {
    store: VectorStore,
}

impl SemanticMemoryManager {
    /// Creates a new `SemanticMemoryManager`.
    pub fn new() -> Self {
        Self {
            store: VectorStore::new(),
        }
    }

    /// Creates a `SemanticMemoryManager` wrapping an existing `VectorStore`.
    pub fn with_store(store: VectorStore) -> Self {
        Self { store }
    }

    /// Stores a memory text under a given category into the vector store.
    /// Returns the ID of the stored memory document.
    pub fn remember(&mut self, text: &str, category: &str) -> String {
        let mut metadata = HashMap::new();
        metadata.insert("category".to_string(), category.to_string());
        metadata.insert("type".to_string(), "semantic_memory".to_string());

        self.store.insert(text, metadata)
    }

    /// Recalls context matching the given query up to `max_memories` count.
    /// Returns a formatted context string suitable for inclusion in prompts.
    pub fn recall_context(&self, query: &str, max_memories: usize) -> String {
        if max_memories == 0 || query.trim().is_empty() {
            return String::new();
        }

        let results = self.store.search(query, max_memories, 0.01);
        if results.is_empty() {
            return String::new();
        }

        let mut lines = Vec::new();
        lines.push("Relevant Semantic Memories:".to_string());

        for (doc, _score) in results {
            let category = doc
                .metadata
                .get("category")
                .cloned()
                .unwrap_or_else(|| "general".to_string());
            lines.push(format!("- [{}] {}", category, doc.text));
        }

        lines.join("\n")
    }

    /// Returns a reference to the underlying `VectorStore`.
    pub fn store(&self) -> &VectorStore {
        &self.store
    }

    /// Returns a mutable reference to the underlying `VectorStore`.
    pub fn store_mut(&mut self) -> &mut VectorStore {
        &mut self.store
    }

    /// Saves stored memories to disk at the given path.
    pub fn save_to_disk(&self, path: &Path) -> anyhow::Result<()> {
        self.store.save_to_disk(path)
    }

    /// Loads memories from disk from the given path.
    pub fn load_from_disk(path: &Path) -> anyhow::Result<Self> {
        let store = VectorStore::load_from_disk(path)?;
        Ok(Self { store })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remember_and_store_size() {
        let mut memory = SemanticMemoryManager::new();
        let id1 = memory.remember("User prefers dark theme for the UI", "user_preferences");
        let id2 = memory.remember("Build output directory is target/release", "project_config");

        assert!(!id1.is_empty());
        assert!(!id2.is_empty());
        assert_eq!(memory.store().len(), 2);
    }

    #[test]
    fn test_recall_context_formatting() {
        let mut memory = SemanticMemoryManager::new();
        memory.remember(
            "User prefers Rust language for performance critical modules",
            "preferences",
        );
        memory.remember(
            "Use PostgreSQL database for persistent user data storage",
            "architecture",
        );
        memory.remember("Baking chocolate cake needs cocoa powder", "recipes");

        let context = memory.recall_context("language performance preference", 2);

        assert!(context.starts_with("Relevant Semantic Memories:"));
        assert!(context.contains("- [preferences] User prefers Rust language for performance critical modules"));
        assert!(!context.contains("chocolate cake"));
    }

    #[test]
    fn test_recall_context_empty() {
        let memory = SemanticMemoryManager::new();
        let context = memory.recall_context("anything", 5);
        assert_eq!(context, "");
    }
}
