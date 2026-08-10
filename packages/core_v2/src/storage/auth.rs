use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use chrono::Utc;
use rand::Rng;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthCredentials {
    pub username: String,
    pub password_hash: String,
    pub salt: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct AuthStore {
    storage_dir: PathBuf,
    sessions: Arc<Mutex<HashMap<String, String>>>,
}

impl AuthStore {
    pub fn new(storage_dir: PathBuf) -> Self {
        if !storage_dir.exists() {
            let _ = fs::create_dir_all(&storage_dir);
        }
        Self {
            storage_dir,
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn credentials_file(&self) -> PathBuf {
        self.storage_dir.join("auth.json")
    }

    fn load_credentials_map(&self) -> HashMap<String, AuthCredentials> {
        let file_path = self.credentials_file();
        if !file_path.exists() {
            return HashMap::new();
        }
        fs::read_to_string(file_path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default()
    }

    fn save_credentials_map(&self, map: &HashMap<String, AuthCredentials>) -> Result<()> {
        if !self.storage_dir.exists() {
            fs::create_dir_all(&self.storage_dir)?;
        }
        let json = serde_json::to_string_pretty(map)?;
        fs::write(self.credentials_file(), json)?;
        Ok(())
    }

    pub fn ensure_seeded(&self, default_user: &str, default_pass: &str) -> Result<()> {
        let mut map = self.load_credentials_map();
        if map.contains_key(default_user) {
            return Ok(());
        }

        let salt = generate_salt();
        let password_hash = hash_password(default_pass, &salt);
        let creds = AuthCredentials {
            username: default_user.to_string(),
            password_hash,
            salt,
            created_at: Utc::now().to_rfc3339(),
        };

        map.insert(default_user.to_string(), creds);
        self.save_credentials_map(&map)
    }

    pub fn verify_password(&self, username: &str, pass: &str) -> bool {
        let map = self.load_credentials_map();
        if let Some(creds) = map.get(username) {
            let hash = hash_password(pass, &creds.salt);
            hash == creds.password_hash
        } else {
            false
        }
    }

    pub fn create_session_token(&self, username: &str) -> String {
        let token = format!("sess_{}", uuid::Uuid::new_v4());
        let mut sessions = self.sessions.lock().unwrap();
        sessions.insert(token.clone(), username.to_string());
        token
    }

    pub fn validate_session_token(&self, token: &str) -> Option<String> {
        let sessions = self.sessions.lock().unwrap();
        sessions.get(token).cloned()
    }

    pub fn change_password(&self, username: &str, old_pass: &str, new_pass: &str) -> Result<()> {
        let mut map = self.load_credentials_map();
        let creds = map
            .get_mut(username)
            .ok_or_else(|| anyhow!("User '{}' not found", username))?;

        let old_hash = hash_password(old_pass, &creds.salt);
        if old_hash != creds.password_hash {
            return Err(anyhow!("Invalid current password"));
        }

        let new_salt = generate_salt();
        let new_hash = hash_password(new_pass, &new_salt);
        creds.salt = new_salt;
        creds.password_hash = new_hash;

        self.save_credentials_map(&map)
    }
}

fn generate_salt() -> String {
    let mut rng = rand::thread_rng();
    let bytes: [u8; 16] = rng.gen();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hash_password(password: &str, salt: &str) -> String {
    let combined = format!("{}:{}", salt, password);
    sha256(combined.as_bytes())
}

use sha2::{Digest, Sha256};

fn sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_hash() {
        assert_eq!(
            sha256(b"hello"),
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn test_auth_store_seeding_and_verification() {
        let dir = std::env::temp_dir().join(format!("test_auth_{}", uuid::Uuid::new_v4()));
        let store = AuthStore::new(dir.clone());

        assert!(store.ensure_seeded("admin", "secret123").is_ok());
        assert!(store.verify_password("admin", "secret123"));
        assert!(!store.verify_password("admin", "wrongpass"));
        assert!(!store.verify_password("nonexistent", "secret123"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn test_session_tokens() {
        let dir = std::env::temp_dir().join(format!("test_auth_sess_{}", uuid::Uuid::new_v4()));
        let store = AuthStore::new(dir.clone());

        let token = store.create_session_token("admin");
        assert_eq!(store.validate_session_token(&token), Some("admin".to_string()));
        assert_eq!(store.validate_session_token("invalid_token"), None);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn test_change_password() {
        let dir = std::env::temp_dir().join(format!("test_auth_pwd_{}", uuid::Uuid::new_v4()));
        let store = AuthStore::new(dir.clone());

        store.ensure_seeded("user1", "oldpass").unwrap();
        assert!(store.verify_password("user1", "oldpass"));

        // Changing with wrong old password should fail
        assert!(store.change_password("user1", "wrongold", "newpass").is_err());

        // Changing with correct old password should succeed
        assert!(store.change_password("user1", "oldpass", "newpass").is_ok());
        assert!(!store.verify_password("user1", "oldpass"));
        assert!(store.verify_password("user1", "newpass"));

        let _ = fs::remove_dir_all(dir);
    }
}
