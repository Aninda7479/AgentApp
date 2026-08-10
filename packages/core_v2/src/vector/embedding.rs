use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

/// Computes the cosine similarity between two float slices.
/// Returns 0.0 if vectors are empty, have mismatched lengths, or have zero magnitude.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.is_empty() || a.len() != b.len() {
        return 0.0;
    }

    let mut dot_product = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;

    for (&x, &y) in a.iter().zip(b.iter()) {
        dot_product += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }

    let norm_product = (norm_a * norm_b).sqrt();
    if norm_product == 0.0 || norm_product.is_nan() {
        0.0
    } else {
        (dot_product / norm_product).clamp(-1.0, 1.0)
    }
}

/// A lightweight embedding model generating dense feature vectors (default 128-dim)
/// from input text using character n-grams, word tokens, and TF-IDF normalization.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SimpleEmbeddingModel {
    pub dimensions: usize,
}

impl Default for SimpleEmbeddingModel {
    fn default() -> Self {
        Self { dimensions: 128 }
    }
}

impl SimpleEmbeddingModel {
    /// Creates a new `SimpleEmbeddingModel` with 128 dimensions.
    pub fn new() -> Self {
        Self::default()
    }

    /// Creates a new `SimpleEmbeddingModel` with specified dimensions.
    pub fn with_dimensions(dimensions: usize) -> Self {
        Self { dimensions }
    }

    /// Embeds input text into a normalized dense feature vector of size `dimensions`.
    pub fn embed(&self, text: &str) -> Vec<f32> {
        if text.trim().is_empty() || self.dimensions == 0 {
            return vec![0.0; self.dimensions];
        }

        let mut vector = vec![0.0f32; self.dimensions];
        let normalized_text = text.to_lowercase();
        let chars: Vec<char> = normalized_text.chars().collect();

        // 1. Character n-grams (2-grams, 3-grams, 4-grams)
        for n in 2..=4 {
            if chars.len() >= n {
                for window in chars.windows(n) {
                    let gram: String = window.iter().collect();
                    let bucket = self.hash_gram(&gram);
                    vector[bucket] += 1.0;
                }
            }
        }

        // 2. Word unigrams & bigrams
        let words: Vec<&str> = normalized_text
            .split_whitespace()
            .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()))
            .filter(|w| !w.is_empty())
            .collect();

        for word in &words {
            let bucket = self.hash_gram(word);
            vector[bucket] += 2.0;
        }

        for window in words.windows(2) {
            let bigram = format!("{} {}", window[0], window[1]);
            let bucket = self.hash_gram(&bigram);
            vector[bucket] += 1.5;
        }

        // 3. TF scaling (sublinear term frequency)
        for val in vector.iter_mut() {
            if *val > 0.0 {
                *val = 1.0 + val.ln();
            }
        }

        // 4. L2 Normalization
        let sum_sq: f32 = vector.iter().map(|&x| x * x).sum();
        let norm = sum_sq.sqrt();

        if norm > 0.0 {
            for val in vector.iter_mut() {
                *val /= norm;
            }
        }

        vector
    }

    fn hash_gram(&self, gram: &str) -> usize {
        let mut hasher = DefaultHasher::new();
        gram.hash(&mut hasher);
        (hasher.finish() as usize) % self.dimensions
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let v1 = vec![1.0, 2.0, 3.0];
        let v2 = vec![1.0, 2.0, 3.0];
        let sim = cosine_similarity(&v1, &v2);
        assert!((sim - 1.0).abs() < 1e-5);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let v1 = vec![1.0, 0.0];
        let v2 = vec![0.0, 1.0];
        let sim = cosine_similarity(&v1, &v2);
        assert!((sim - 0.0).abs() < 1e-5);
    }

    #[test]
    fn test_cosine_similarity_edge_cases() {
        assert_eq!(cosine_similarity(&[], &[]), 0.0);
        assert_eq!(cosine_similarity(&[1.0], &[1.0, 2.0]), 0.0);
        assert_eq!(cosine_similarity(&[0.0, 0.0], &[0.0, 0.0]), 0.0);
    }

    #[test]
    fn test_embedding_dimensions_and_normalization() {
        let model = SimpleEmbeddingModel::new();
        let vector = model.embed("Rust vector embedding test");
        assert_eq!(vector.len(), 128);

        let sum_sq: f32 = vector.iter().map(|&x| x * x).sum();
        let norm = sum_sq.sqrt();
        assert!((norm - 1.0).abs() < 1e-4);
    }

    #[test]
    fn test_embedding_semantic_ranking() {
        let model = SimpleEmbeddingModel::new();
        let query = model.embed("Rust async programming engine");
        let doc1 = model.embed("Rust asynchronous runtime and tokio framework");
        let doc2 = model.embed("Chocolate cake baking instructions and ingredients");

        let sim1 = cosine_similarity(&query, &doc1);
        let sim2 = cosine_similarity(&query, &doc2);

        assert!(
            sim1 > sim2,
            "Expected sim1 ({sim1}) to be higher than sim2 ({sim2})"
        );
    }

    #[test]
    fn test_embedding_empty_text() {
        let model = SimpleEmbeddingModel::new();
        let vec = model.embed("");
        assert_eq!(vec.len(), 128);
        assert!(vec.iter().all(|&x| x == 0.0));
    }
}
