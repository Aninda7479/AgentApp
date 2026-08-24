#[derive(Debug, Clone)]
pub struct ModelItem {
    pub provider: String,
    pub model_id: String,
    pub display_name: String,
    pub context_window: &'static str,
    pub capabilities: &'static [&'static str],
}

#[derive(Debug, Clone)]
pub struct ModelPickerState {
    pub models: Vec<ModelItem>,
    pub selected_index: usize,
}

impl Default for ModelPickerState {
    fn default() -> Self {
        Self::new()
    }
}

impl ModelPickerState {
    pub fn new() -> Self {
        let models = vec![
            ModelItem {
                provider: "openai".to_string(),
                model_id: "gpt-4o".to_string(),
                display_name: "GPT-4o (Omni)".to_string(),
                context_window: "128k ctx",
                capabilities: &["vision", "tools", "fast"],
            },
            ModelItem {
                provider: "openai".to_string(),
                model_id: "gpt-4o-mini".to_string(),
                display_name: "GPT-4o Mini".to_string(),
                context_window: "128k ctx",
                capabilities: &["fast", "cheap", "tools"],
            },
            ModelItem {
                provider: "openai".to_string(),
                model_id: "o3-mini".to_string(),
                display_name: "o3-mini (Reasoning)".to_string(),
                context_window: "200k ctx",
                capabilities: &["reasoning", "tools", "math"],
            },
            ModelItem {
                provider: "anthropic".to_string(),
                model_id: "claude-3-5-sonnet-20241022".to_string(),
                display_name: "Claude 3.5 Sonnet".to_string(),
                context_window: "200k ctx",
                capabilities: &["coding", "vision", "tools"],
            },
            ModelItem {
                provider: "anthropic".to_string(),
                model_id: "claude-3-5-haiku-20241022".to_string(),
                display_name: "Claude 3.5 Haiku".to_string(),
                context_window: "200k ctx",
                capabilities: &["fast", "tools"],
            },
            ModelItem {
                provider: "gemini".to_string(),
                model_id: "gemini-2.0-flash".to_string(),
                display_name: "Gemini 2.0 Flash".to_string(),
                context_window: "1M ctx",
                capabilities: &["ultra-fast", "multimodal"],
            },
            ModelItem {
                provider: "gemini".to_string(),
                model_id: "gemini-1.5-pro".to_string(),
                display_name: "Gemini 1.5 Pro".to_string(),
                context_window: "2M ctx",
                capabilities: &["massive-context", "reasoning"],
            },
            ModelItem {
                provider: "deepseek".to_string(),
                model_id: "deepseek-chat".to_string(),
                display_name: "DeepSeek V3".to_string(),
                context_window: "64k ctx",
                capabilities: &["coding", "tools", "fast"],
            },
            ModelItem {
                provider: "deepseek".to_string(),
                model_id: "deepseek-reasoner".to_string(),
                display_name: "DeepSeek R1 (Reasoning)".to_string(),
                context_window: "64k ctx",
                capabilities: &["deep-thinking", "math"],
            },
            ModelItem {
                provider: "groq".to_string(),
                model_id: "llama-3.3-70b-versatile".to_string(),
                display_name: "Llama 3.3 70B (Groq)".to_string(),
                context_window: "128k ctx",
                capabilities: &["realtime-speed"],
            },
            ModelItem {
                provider: "ollama".to_string(),
                model_id: "qwen2.5-coder".to_string(),
                display_name: "Qwen 2.5 Coder (Local)".to_string(),
                context_window: "32k ctx",
                capabilities: &["local", "offline", "coding"],
            },
        ];

        Self {
            models,
            selected_index: 0,
        }
    }

    pub fn next(&mut self) {
        if !self.models.is_empty() {
            self.selected_index = (self.selected_index + 1) % self.models.len();
        }
    }

    pub fn previous(&mut self) {
        if !self.models.is_empty() {
            self.selected_index = if self.selected_index == 0 {
                self.models.len() - 1
            } else {
                self.selected_index - 1
            };
        }
    }

    pub fn selected(&self) -> Option<&ModelItem> {
        self.models.get(self.selected_index)
    }
}
