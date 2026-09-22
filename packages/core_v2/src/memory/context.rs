use crate::types::{ChatMessage, ContentBlock};

/// Manages short-term conversation history, system prompt injection,
/// and token limit estimation / truncation.
#[derive(Debug, Clone)]
pub struct ConversationContext {
    system_prompt: Option<String>,
    history: Vec<ChatMessage>,
    max_token_limit: usize,
    summarize_threshold: f64,
    summarized_prefix: Option<String>,
}

impl Default for ConversationContext {
    fn default() -> Self {
        Self::new(128_000) // Default 128k token ceiling
    }
}

impl ConversationContext {
    /// Creates a new `ConversationContext` with a specified maximum token limit.
    pub fn new(max_token_limit: usize) -> Self {
        Self {
            system_prompt: None,
            history: Vec::new(),
            max_token_limit,
            summarize_threshold: 0.75,
            summarized_prefix: None,
        }
    }

    /// Sets or updates the system prompt.
    pub fn set_system_prompt(&mut self, prompt: impl Into<String>) {
        self.system_prompt = Some(prompt.into());
    }

    /// Gets the current system prompt, if any.
    pub fn get_system_prompt(&self) -> Option<&str> {
        self.system_prompt.as_deref()
    }

    /// Adds a message to the history and enforces token limits.
    pub fn add_message(&mut self, message: ChatMessage) {
        self.history.push(message);
        self.enforce_token_limit();
    }

    /// Convenience helper to append a user text message.
    pub fn add_user_message(&mut self, text: impl Into<String>) {
        self.add_message(ChatMessage::user(text));
    }

    /// Convenience helper to append an assistant text message.
    pub fn add_assistant_message(&mut self, text: impl Into<String>) {
        self.add_message(ChatMessage::assistant(text));
    }

    /// Convenience helper to append a tool result message.
    pub fn add_tool_result(
        &mut self,
        tool_use_id: impl Into<String>,
        content: impl Into<String>,
        is_error: bool,
    ) {
        self.add_message(ChatMessage::tool_result(tool_use_id, content, is_error));
    }

    /// Returns a slice of the conversation history (excluding system prompt).
    pub fn history(&self) -> &[ChatMessage] {
        &self.history
    }

    /// Returns all messages, prepending system prompt as a System message if present.
    pub fn all_messages(&self) -> Vec<ChatMessage> {
        let mut msgs = Vec::new();
        if let Some(ref sys) = self.system_prompt {
            msgs.push(ChatMessage::system(sys));
        }
        if let Some(ref prefix) = self.summarized_prefix {
            msgs.push(ChatMessage::system(prefix));
        }
        msgs.extend(self.history.clone());
        msgs
    }

    /// Estimates total token count across system prompt and message history.
    /// Uses a character-based heuristic (~4 characters per token).
    pub fn estimate_tokens(&self) -> usize {
        let mut total_chars = 0;
        if let Some(ref sys) = self.system_prompt {
            total_chars += sys.len();
        }
        if let Some(ref prefix) = self.summarized_prefix {
            total_chars += prefix.len();
        }
        for msg in &self.history {
            for block in &msg.content {
                match block {
                    ContentBlock::Text { text } => total_chars += text.len(),
                    ContentBlock::ToolUse { name, input, .. } => {
                        total_chars += name.len() + input.to_string().len();
                    }
                    ContentBlock::ToolResult { content, .. } => {
                        total_chars += content.len();
                    }
                    ContentBlock::Image { data, .. } => {
                        total_chars += data.len().min(1000);
                    }
                    ContentBlock::Audio { data, .. } => {
                        total_chars += data.len().min(1000);
                    }
                    ContentBlock::Video { data, .. } => {
                        total_chars += data.len().min(1000);
                    }
                    ContentBlock::Document { filename, data, .. } => {
                        total_chars += filename.len() + data.len().min(2000);
                    }
                }
            }
        }
        if total_chars == 0 {
            0
        } else {
            (total_chars + 3) / 4
        }
    }

    /// Trims oldest user/assistant/tool messages if estimated tokens exceed max_token_limit.
    pub fn enforce_token_limit(&mut self) {
        if self.max_token_limit == 0 {
            return;
        }

        let threshold_limit = (self.max_token_limit as f64 * self.summarize_threshold) as usize;

        if self.estimate_tokens() > threshold_limit {
            let keep_count = 6;
            if self.history.len() > keep_count {
                let summarize_count = self.history.len() - keep_count;
                let mut summary_text = String::new();
                for msg in self.history.drain(0..summarize_count) {
                    summary_text.push_str(&format!("{:?}: {}\n", msg.role, msg.text_content()));
                }

                let new_summary = format!("[Previous conversation summary]:\n{}", summary_text);

                if let Some(existing) = &self.summarized_prefix {
                    self.summarized_prefix = Some(format!("{}\n{}", existing, new_summary));
                } else {
                    self.summarized_prefix = Some(new_summary);
                }
            }
        }

        while self.estimate_tokens() > self.max_token_limit && !self.history.is_empty() {
            self.history.remove(0);
        }
    }

    /// Clears message history (retaining system prompt).
    pub fn clear_history(&mut self) {
        self.history.clear();
    }
}

/// Prepares an adaptive history slice from a full session history.
/// If a large time gap has passed (e.g. > 2 hours), or if the message history is long,
/// it compacts older conversation turns into a structured summary context prefix and keeps
/// the most recent N turns in active working memory.
/// Returns (adapted_messages, optional_summary_prefix).
pub fn prepare_adaptive_history(
    messages: &[ChatMessage],
    last_activity_timestamp_ms: Option<i64>,
    gap_threshold_secs: u64,
    max_verbatim_messages: usize,
) -> (Vec<ChatMessage>, Option<String>) {
    if messages.is_empty() {
        return (Vec::new(), None);
    }

    let now_ms = chrono::Utc::now().timestamp_millis();
    let is_gap = if let Some(last_ts) = last_activity_timestamp_ms {
        let diff_secs = ((now_ms - last_ts).max(0) / 1000) as u64;
        diff_secs >= gap_threshold_secs
    } else {
        false
    };

    let total_len = messages.len();

    // If gap occurred, use a tighter verbatim window (e.g. 4 turns) so new topic is focused
    let keep_count = if is_gap {
        max_verbatim_messages.min(4)
    } else {
        max_verbatim_messages
    };

    if total_len <= keep_count && !is_gap {
        // Conversation is fresh and within reasonable size
        return (messages.to_vec(), None);
    }

    let split_idx = total_len.saturating_sub(keep_count);
    let (older_messages, recent_messages) = messages.split_at(split_idx);

    let mut summary_parts = Vec::new();
    if is_gap {
        let hours_ago = if let Some(last_ts) = last_activity_timestamp_ms {
            ((now_ms - last_ts).max(0) / (1000 * 3600)) as u64
        } else {
            0
        };
        summary_parts.push(format!(
            "[Notice: Conversation resumed after ~{} hour(s) gap. Older context has been compacted to save tokens. Detailed past messages can be retrieved using the 'recall_memory' tool.]",
            hours_ago.max(1)
        ));
    }

    if !older_messages.is_empty() {
        let mut key_excerpts = Vec::new();
        for msg in older_messages {
            let txt = msg.text_content();
            let clean = txt.trim();
            if !clean.is_empty() {
                let role_label = match msg.role {
                    crate::types::Role::User => "User",
                    crate::types::Role::Assistant => "SuperAgent",
                    crate::types::Role::System => "System",
                    crate::types::Role::Tool => "Tool",
                };
                let snippet: String = clean.chars().take(160).collect();
                let suffix = if clean.chars().count() > 160 {
                    "..."
                } else {
                    ""
                };
                key_excerpts.push(format!("- {}: {}{}", role_label, snippet, suffix));
            }
        }

        if !key_excerpts.is_empty() {
            summary_parts.push(format!(
                "[Previous Conversation Summary & Key Topics]:\n{}",
                key_excerpts.join("\n")
            ));
        }
    }

    let summary = if summary_parts.is_empty() {
        None
    } else {
        Some(summary_parts.join("\n\n"))
    };

    (recent_messages.to_vec(), summary)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conversation_context_basic() {
        let mut ctx = ConversationContext::new(100);
        ctx.set_system_prompt("System prompt");
        ctx.add_user_message("Hello");
        ctx.add_assistant_message("Hi there!");

        let all = ctx.all_messages();
        assert_eq!(all.len(), 3);
        assert_eq!(ctx.get_system_prompt(), Some("System prompt"));
        assert!(ctx.estimate_tokens() > 0);
    }

    #[test]
    fn test_token_limit_enforcement() {
        let mut ctx = ConversationContext::new(10); // Very small limit (~40 chars)
        ctx.add_user_message(
            "This is a long message that exceeds 40 characters in total length easily",
        );
        ctx.add_user_message("Second message");

        // The first long message should have been trimmed to enforce limit
        assert_eq!(ctx.history().len(), 1);
        assert_eq!(ctx.history()[0].text_content(), "Second message");
    }

    #[test]
    fn test_prepare_adaptive_history_no_gap() {
        let messages = vec![
            ChatMessage::user("Hi"),
            ChatMessage::assistant("Hello!"),
            ChatMessage::user("How are you?"),
            ChatMessage::assistant("Great!"),
        ];
        let (recent, summary) = prepare_adaptive_history(&messages, None, 7200, 10);
        assert_eq!(recent.len(), 4);
        assert!(summary.is_none());
    }

    #[test]
    fn test_prepare_adaptive_history_with_time_gap() {
        let messages = vec![
            ChatMessage::user("Write python script for data processing"),
            ChatMessage::assistant("Here is the script..."),
            ChatMessage::user("Thanks!"),
            ChatMessage::assistant("You are welcome!"),
            ChatMessage::user("I need a video downloaded"),
        ];
        let three_hours_ago = chrono::Utc::now().timestamp_millis() - (3 * 3600 * 1000);
        let (recent, summary) = prepare_adaptive_history(&messages, Some(three_hours_ago), 7200, 6);
        assert!(recent.len() <= 4);
        assert!(summary.is_some());
        let s = summary.unwrap();
        assert!(s.contains("Conversation resumed after"));
        assert!(s.contains("recall_memory"));
    }
}
