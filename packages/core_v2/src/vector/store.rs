use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

use crate::vector::embedding::{cosine_similarity, SimpleEmbeddingModel};

/// Represents a document stored within the vector database with its text, embedding, and metadata.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VectorDocument {
    pub id: String,
    pub text: String,
    pub vector: Vec<f32>,
    pub metadata: HashMap<String, String>,
    pub timestamp: String,
}

/// An in-memory vector store with persistence capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorStore {
    documents: Vec<VectorDocument>,
    #[serde(skip, default)]
    model: SimpleEmbeddingModel,
}

impl Default for VectorStore {
    fn default() -> Self {
        Self::new()
    }
}

impl VectorStore {
    /// Creates a new, empty `VectorStore`.
    pub fn new() -> Self {
        Self {
            documents: Vec::new(),
            model: SimpleEmbeddingModel::new(),
        }
    }

    /// Resolves the default persistent storage path at `~/.superagent/vector_db.json`.
    pub fn default_db_path() -> anyhow::Result<PathBuf> {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| anyhow::anyhow!("Could not determine user home directory"))?;
        Ok(PathBuf::from(home).join(".superagent").join("vector_db.json"))
    }

    /// Inserts a text document with associated metadata into the store.
    /// Returns the generated document unique identifier.
    pub fn insert(&mut self, text: &str, metadata: HashMap<String, String>) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let vector = self.model.embed(text);
        let timestamp = chrono::Utc::now().to_rfc3339();

        let doc = VectorDocument {
            id: id.clone(),
            text: text.to_string(),
            vector,
            metadata,
            timestamp,
        };

        self.documents.push(doc);
        id
    }

    /// Searches stored documents by cosine similarity against `query`.
    /// Returns top `limit` documents meeting or exceeding `min_score`, sorted by score descending.
    pub fn search(&self, query: &str, limit: usize, min_score: f32) -> Vec<(VectorDocument, f32)> {
        if query.trim().is_empty() || limit == 0 {
            return Vec::new();
        }

        let query_vec = self.model.embed(query);
        let mut results: Vec<(VectorDocument, f32)> = self
            .documents
            .iter()
            .map(|doc| {
                let score = cosine_similarity(&query_vec, &doc.vector);
                (doc.clone(), score)
            })
            .filter(|(_, score)| *score >= min_score)
            .collect();

        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        if results.len() > limit {
            results.truncate(limit);
        }

        results
    }

    /// Persists the vector store to disk at the specified `path`.
    pub fn save_to_disk(&self, path: &Path) -> anyhow::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json)?;
        Ok(())
    }

    /// Loads a `VectorStore` from disk from the specified `path`.
    pub fn load_from_disk(path: &Path) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let mut store: VectorStore = serde_json::from_str(&content)?;
        store.model = SimpleEmbeddingModel::new();
        Ok(store)
    }

    /// Returns the number of documents in the store.
    pub fn len(&self) -> usize {
        self.documents.len()
    }

    /// Returns `true` if the store contains no documents.
    pub fn is_empty(&self) -> bool {
        self.documents.is_empty()
    }

    /// Returns a slice of stored documents.
    pub fn documents(&self) -> &[VectorDocument] {
        &self.documents
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_insert_and_count() {
        let mut store = VectorStore::new();
        assert!(store.is_empty());

        let mut meta = HashMap::new();
        meta.insert("author".to_string(), "alice".to_string());

        let id = store.insert("First vector document", meta);
        assert!(!id.is_empty());
        assert_eq!(store.len(), 1);

        let doc = &store.documents()[0];
        assert_eq!(doc.id, id);
        assert_eq!(doc.text, "First vector document");
        assert_eq!(doc.metadata.get("author").unwrap(), "alice");
        assert_eq!(doc.vector.len(), 128);
    }

    #[test]
    fn test_search_ranking() {
        let mut store = VectorStore::new();

        store.insert(
            "Rust is a high performance systems programming language focusing on memory safety",
            HashMap::new(),
        );
        store.insert(
            "Python is a popular dynamically typed language used for web dev and machine learning",
            HashMap::new(),
        );
        store.insert(
            "Baking sourdough bread requires flour water salt and wild yeast culture",
            HashMap::new(),
        );

        let results = store.search("memory safe system language", 2, 0.0);
        assert!(!results.is_empty());
        assert_eq!(results.len(), 2);
        assert!(results[0].0.text.contains("Rust"));
        assert!(results[0].1 > results[1].1);
    }

    #[test]
    fn test_min_score_filtering() {
        let mut store = VectorStore::new();
        store.insert("Quantum computing and qubit manipulation", HashMap::new());

        let results = store.search("Baking apple pie pastry", 5, 0.8);
        assert!(results.is_empty());
    }

    #[test]
    fn test_persistence_save_and_load() {
        let mut store = VectorStore::new();
        let mut meta = HashMap::new();
        meta.insert("env".to_string(), "production".to_string());

        store.insert("Persistent memory test entry", meta);

        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join(format!("test_vec_db_{}.json", uuid::Uuid::new_v4()));

        store.save_to_disk(&file_path).expect("Failed to save store");

        let loaded_store = VectorStore::load_from_disk(&file_path).expect("Failed to load store");
        assert_eq!(loaded_store.len(), 1);
        assert_eq!(loaded_store.documents()[0].text, "Persistent memory test entry");
        assert_eq!(
            loaded_store.documents()[0].metadata.get("env").unwrap(),
            "production"
        );

        // Verify search still functions on reloaded store
        let search_res = loaded_store.search("Persistent memory test entry", 1, 0.0);
        assert_eq!(search_res.len(), 1);

        let _ = std::fs::remove_file(&file_path);
    }
}
