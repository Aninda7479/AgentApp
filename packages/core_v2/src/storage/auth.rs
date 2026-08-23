use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use rand::Rng;
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;

use crate::storage::settings::{get_home_dir, get_superagent_dir};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StoredCredential {
    #[serde(default = "default_username")]
    pub username: String,
    pub salt: String,
    pub hash: String,
    #[serde(default = "default_algo")]
    pub algo: String,
    #[serde(default = "default_keylen")]
    pub keylen: u32,
    #[serde(default, rename = "updatedAt")]
    pub updated_at: Option<u64>,
}

fn default_username() -> String {
    "admin".to_string()
}

fn default_algo() -> String {
    "scrypt".to_string()
}

fn default_keylen() -> u32 {
    64
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuthFile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credential: Option<StoredCredential>,
    #[serde(default, rename = "sessionSecret", skip_serializing_if = "Option::is_none")]
    pub session_secret: Option<String>,
    #[serde(default, rename = "sessionVersion", skip_serializing_if = "Option::is_none")]
    pub session_version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sessions: Option<Vec<serde_json::Value>>,
    #[serde(default, rename = "loginHistory", skip_serializing_if = "Option::is_none")]
    pub login_history: Option<Vec<serde_json::Value>>,
    #[serde(default, rename = "updatedAt", skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionEntry {
    pub token: String,
    pub username: String,
    pub created_at: String,
    pub last_used: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
}

/// Discovers candidate locations for auth.json.
pub fn resolve_auth_file_path(base_dir: Option<&Path>) -> PathBuf {
    let base = match base_dir {
        Some(d) => d.to_path_buf(),
        None => get_superagent_dir(),
    };

    let candidates = [
        base.join("config").join("auth.json"),
        base.join("Config").join("auth.json"),
        base.join("auth").join("auth.json"),
        base.join("auth.json"),
        get_home_dir().join(".superagent").join("config").join("auth.json"),
        get_home_dir().join(".superagent").join("Config").join("auth.json"),
        get_home_dir().join(".superagent").join("auth.json"),
        PathBuf::from(".").join(".superagent").join("config").join("auth.json"),
        PathBuf::from(".").join(".superagent").join("auth.json"),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return candidate.clone();
        }
    }

    base.join("config").join("auth.json")
}

#[derive(Debug, Clone)]
pub struct AuthStore {
    storage_dir: PathBuf,
    sessions: Arc<Mutex<HashMap<String, SessionEntry>>>,
    failed_attempts: Arc<DashMap<String, (u32, DateTime<Utc>)>>,
}

impl AuthStore {
    pub fn new(storage_dir: PathBuf) -> Self {
        if !storage_dir.exists() {
            let _ = fs::create_dir_all(&storage_dir);
        }
        Self {
            storage_dir,
            sessions: Arc::new(Mutex::new(HashMap::new())),
            failed_attempts: Arc::new(DashMap::new()),
        }
    }

    fn credentials_file(&self) -> PathBuf {
        let in_storage = [
            self.storage_dir.join("config").join("auth.json"),
            self.storage_dir.join("Config").join("auth.json"),
            self.storage_dir.join("auth.json"),
        ];

        for candidate in &in_storage {
            if candidate.exists() {
                return candidate.clone();
            }
        }

        let sa_dir = get_superagent_dir();
        if self.storage_dir.starts_with(&sa_dir) || self.storage_dir.to_string_lossy().contains(".superagent") {
            let global_candidates = [
                sa_dir.join("config").join("auth.json"),
                sa_dir.join("Config").join("auth.json"),
                sa_dir.join("auth.json"),
                get_home_dir().join(".superagent").join("config").join("auth.json"),
                get_home_dir().join(".superagent").join("Config").join("auth.json"),
                get_home_dir().join(".superagent").join("auth.json"),
            ];

            for candidate in &global_candidates {
                if candidate.exists() {
                    return candidate.clone();
                }
            }
        }

        self.storage_dir.join("config").join("auth.json")
    }

    fn load_auth_file(&self) -> AuthFile {
        let file_path = self.credentials_file();
        let content = if file_path.exists() {
            fs::read_to_string(&file_path).unwrap_or_default()
        } else {
            let bak = file_path.with_extension("json.bak");
            if bak.exists() {
                fs::read_to_string(&bak).unwrap_or_default()
            } else {
                String::new()
            }
        };

        if content.trim().is_empty() {
            return AuthFile::default();
        }

        // Try parsing primary AuthFile format (Node.js/Desktop schema)
        if let Ok(file) = serde_json::from_str::<AuthFile>(&content) {
            if file.credential.is_some() || file.session_secret.is_some() || file.sessions.is_some() {
                return file;
            }
        }

        // Fallback: Check if it's a legacy HashMap<String, AuthCredentials>
        #[derive(Deserialize)]
        struct LegacyCred {
            username: Option<String>,
            password_hash: String,
            salt: String,
            #[serde(default)]
            is_default: bool,
        }

        if let Ok(map) = serde_json::from_str::<HashMap<String, LegacyCred>>(&content) {
            if let Some(admin) = map.get("admin").or_else(|| map.values().next()) {
                return AuthFile {
                    credential: Some(StoredCredential {
                        username: admin.username.clone().unwrap_or_else(|| "admin".into()),
                        salt: admin.salt.clone(),
                        hash: admin.password_hash.clone(),
                        algo: "sha256".into(),
                        keylen: 32,
                        updated_at: None,
                    }),
                    session_secret: None,
                    session_version: Some(if admin.is_default { 0 } else { 1 }),
                    sessions: None,
                    login_history: None,
                    updated_at: None,
                };
            }
        }

        AuthFile::default()
    }

    fn save_auth_file(&self, file: &AuthFile) -> Result<()> {
        let file_path = self.credentials_file();
        if let Some(parent) = file_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }

        // Create backup file before writing
        let bak_path = file_path.with_extension("json.bak");
        if file_path.exists() {
            let _ = fs::copy(&file_path, &bak_path);
        }

        let json = serde_json::to_string_pretty(file)?;
        fs::write(&file_path, json)?;
        Ok(())
    }

    pub fn is_password_set(&self) -> bool {
        let file = self.load_auth_file();
        if let Some(cred) = file.credential {
            !cred.hash.trim().is_empty()
        } else {
            false
        }
    }

    pub fn get_username(&self) -> String {
        let file = self.load_auth_file();
        file.credential
            .map(|c| c.username)
            .unwrap_or_else(|| "admin".to_string())
    }

    pub fn is_locked(&self, ip: &str) -> bool {
        if let Some(entry) = self.failed_attempts.get(ip) {
            let (count, locked_until) = *entry;
            if count >= 5 && Utc::now() < locked_until {
                return true;
            }
        }
        false
    }

    pub fn record_failed_attempt(&self, ip: &str) {
        let now = Utc::now();
        let mut entry = self.failed_attempts.entry(ip.to_string()).or_insert((0, now));
        entry.0 += 1;
        if entry.0 >= 5 {
            entry.1 = now + Duration::minutes(15);
        }
    }

    pub fn clear_failed_attempts(&self, ip: &str) {
        self.failed_attempts.remove(ip);
    }

    pub fn verify_password(&self, _username: &str, pass: &str) -> bool {
        let file = self.load_auth_file();

        let cred = match file.credential {
            Some(c) => c,
            None => {
                // Default fallback password when no password is set
                return pass == "admin";
            }
        };

        if cred.hash.trim().is_empty() {
            return pass == "admin";
        }

        let algo = cred.algo.to_lowercase();
        if algo == "scrypt" {
            let keylen = if cred.keylen == 0 { 64 } else { cred.keylen as usize };
            if let Ok(candidate_hash) = hash_password_scrypt(pass, &cred.salt, keylen) {
                if candidate_hash.as_bytes().ct_eq(cred.hash.as_bytes()).into() {
                    return true;
                }
            }
        }

        // Check sha256 as fallback or if algo is sha256
        let candidate_hash = hash_password(pass, &cred.salt);
        if candidate_hash.as_bytes().ct_eq(cred.hash.as_bytes()).into() {
            return true;
        }

        // If algo was something else, try scrypt with default 64 len as well
        if algo != "scrypt" {
            if let Ok(candidate_hash) = hash_password_scrypt(pass, &cred.salt, 64) {
                if candidate_hash.as_bytes().ct_eq(cred.hash.as_bytes()).into() {
                    return true;
                }
            }
        }

        false
    }

    pub fn set_password(&self, new_pass: &str, username: Option<&str>) -> Result<()> {
        let mut file = self.load_auth_file();
        let user = username.unwrap_or("admin").trim();

        let salt_bytes = generate_salt_bytes();
        let salt = hex_encode(&salt_bytes);
        let hash = hash_password_scrypt(new_pass, &salt, 64)
            .unwrap_or_else(|_| hash_password(new_pass, &salt));

        file.credential = Some(StoredCredential {
            username: user.to_string(),
            salt,
            hash,
            algo: "scrypt".to_string(),
            keylen: 64,
            updated_at: Some(Utc::now().timestamp_millis() as u64),
        });

        file.session_version = Some(file.session_version.unwrap_or(0) + 1);
        file.session_secret = Some(generate_session_secret());
        self.save_auth_file(&file)
    }

    pub fn ensure_seeded(&self, default_user: &str, default_pass: &str) -> Result<()> {
        if self.is_password_set() {
            return Ok(());
        }
        self.set_password(default_pass, Some(default_user))
    }

    pub fn create_session_token(&self, username: &str) -> String {
        self.create_session_with_metadata(username, None, None)
    }

    pub fn create_session_with_metadata(
        &self,
        username: &str,
        ip: Option<String>,
        user_agent: Option<String>,
    ) -> String {
        let token = format!("sess_{}", uuid::Uuid::new_v4());
        let now = Utc::now().to_rfc3339();
        let entry = SessionEntry {
            token: token.clone(),
            username: username.to_string(),
            created_at: now.clone(),
            last_used: now,
            user_agent,
            ip,
        };
        let mut sessions = self.sessions.lock().unwrap();
        sessions.insert(token.clone(), entry);
        token
    }

    pub fn validate_session_token(&self, token: &str) -> Option<String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(entry) = sessions.get_mut(token) {
            entry.last_used = Utc::now().to_rfc3339();
            Some(entry.username.clone())
        } else {
            None
        }
    }

    pub fn invalidate_session(&self, token: &str) -> bool {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.remove(token).is_some()
    }

    pub fn list_sessions(&self, username: &str) -> Vec<SessionEntry> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .values()
            .filter(|s| s.username == username)
            .cloned()
            .collect()
    }

    pub fn change_password(&self, username: &str, old_pass: &str, new_pass: &str) -> Result<()> {
        if !self.verify_password(username, old_pass) {
            return Err(anyhow!("Invalid current password"));
        }
        self.set_password(new_pass, Some(username))
    }
}

fn generate_salt_bytes() -> [u8; 16] {
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 16];
    rng.fill(&mut bytes[..]);
    bytes
}

fn generate_session_secret() -> String {
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 48];
    rng.fill(&mut bytes[..]);
    hex_encode(&bytes)
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hex_decode(hex_str: &str) -> Result<Vec<u8>> {
    let clean = hex_str.trim();
    if clean.len() % 2 != 0 {
        return Err(anyhow!("Invalid hex length"));
    }
    (0..clean.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&clean[i..i + 2], 16)
                .map_err(|e| anyhow!("Invalid hex byte: {}", e))
        })
        .collect()
}

fn hash_password_scrypt(password: &str, salt: &str, keylen: usize) -> Result<String> {
    let salt_bytes = if let Ok(bytes) = hex_decode(salt) {
        bytes
    } else {
        salt.as_bytes().to_vec()
    };

    let target_len = if keylen == 0 { 64 } else { keylen };
    let params = scrypt::Params::new(14, 8, 1, target_len)
        .map_err(|e| anyhow!("Invalid scrypt params: {}", e))?;

    let mut output = vec![0u8; target_len];
    scrypt::scrypt(password.as_bytes(), &salt_bytes, &params, &mut output)
        .map_err(|e| anyhow!("Scrypt failed: {}", e))?;

    Ok(hex_encode(&output))
}

fn hash_password(password: &str, salt: &str) -> String {
    use sha2::{Digest, Sha256};
    let combined = format!("{}:{}", salt, password);
    let mut hasher = Sha256::new();
    hasher.update(combined.as_bytes());
    format!("{:x}", hasher.finalize())
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_hash() {
        assert_eq!(
            hash_password("hello", "salt"),
            "9971ac8c89d23eb086b416752262ed48977d131389ddc3e0c5e6eba4ca02276c"
        );
    }



    #[test]
    fn test_auth_store_seeding_and_verification() {
        let dir = std::env::temp_dir().join(format!("test_auth_{}", uuid::Uuid::new_v4()));
        let store = AuthStore::new(dir.clone());

        assert!(store.ensure_seeded("admin", "secret123").is_ok());
        assert!(store.verify_password("admin", "secret123"));
        assert!(!store.verify_password("admin", "wrongpass"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn test_session_tokens() {
        let dir = std::env::temp_dir().join(format!("test_auth_sess_{}", uuid::Uuid::new_v4()));
        let store = AuthStore::new(dir.clone());

        let token = store.create_session_with_metadata("admin", Some("127.0.0.1".into()), Some("Mozilla".into()));
        assert_eq!(store.validate_session_token(&token), Some("admin".to_string()));
        assert_eq!(store.validate_session_token("invalid_token"), None);

        let sessions = store.list_sessions("admin");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].ip.as_deref(), Some("127.0.0.1"));

        assert!(store.invalidate_session(&token));
        assert_eq!(store.validate_session_token(&token), None);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn test_brute_force_lockout() {
        let dir = std::env::temp_dir().join(format!("test_auth_lock_{}", uuid::Uuid::new_v4()));
        let store = AuthStore::new(dir.clone());
        let ip = "192.168.1.100";

        assert!(!store.is_locked(ip));
        for _ in 0..4 {
            store.record_failed_attempt(ip);
            assert!(!store.is_locked(ip));
        }
        store.record_failed_attempt(ip);
        assert!(store.is_locked(ip));

        store.clear_failed_attempts(ip);
        assert!(!store.is_locked(ip));

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

    #[test]
    fn test_scrypt_verification_and_schema() {
        let dir = std::env::temp_dir().join(format!("test_auth_scrypt_{}", uuid::Uuid::new_v4()));
        let store = AuthStore::new(dir.clone());

        // Set password which uses scrypt algo
        store.set_password("MySecurePass123", Some("admin")).unwrap();
        assert!(store.is_password_set());
        assert!(store.verify_password("admin", "MySecurePass123"));
        assert!(!store.verify_password("admin", "wrongpass"));

        // Verify auth.json structure matches @superagent/core format
        let auth_file = dir.join("config").join("auth.json");
        assert!(auth_file.exists());
        let content = fs::read_to_string(&auth_file).unwrap();
        let val: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(val["credential"]["algo"], "scrypt");
        assert_eq!(val["credential"]["keylen"], 64);
        assert_eq!(val["credential"]["username"], "admin");

        let _ = fs::remove_dir_all(dir);
    }
}


