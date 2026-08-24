#[derive(Debug, Clone, Default)]
pub struct Composer {
    buffer: String,
    cursor: usize,
    history: Vec<String>,
    history_index: Option<usize>,
    saved_draft: String,
}

impl Composer {
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            cursor: 0,
            history: Vec::new(),
            history_index: None,
            saved_draft: String::new(),
        }
    }

    pub fn text(&self) -> &str {
        &self.buffer
    }

    pub fn cursor_pos(&self) -> usize {
        self.cursor
    }

    pub fn is_empty(&self) -> bool {
        self.buffer.trim().is_empty()
    }

    pub fn is_slash_command(&self) -> bool {
        self.buffer.starts_with('/')
    }

    pub fn insert_char(&mut self, c: char) {
        if self.cursor >= self.buffer.len() {
            self.buffer.push(c);
        } else {
            let byte_pos = self
                .buffer
                .char_indices()
                .nth(self.cursor)
                .map(|(i, _)| i)
                .unwrap_or(self.buffer.len());
            self.buffer.insert(byte_pos, c);
        }
        self.cursor += 1;
    }

    pub fn insert_str(&mut self, s: &str) {
        for c in s.chars() {
            self.insert_char(c);
        }
    }

    pub fn backspace(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
            let byte_pos = self
                .buffer
                .char_indices()
                .nth(self.cursor)
                .map(|(i, _)| i)
                .unwrap_or(0);
            self.buffer.remove(byte_pos);
        }
    }

    pub fn delete(&mut self) {
        if self.cursor < self.char_count() {
            let byte_pos = self
                .buffer
                .char_indices()
                .nth(self.cursor)
                .map(|(i, _)| i)
                .unwrap_or(0);
            self.buffer.remove(byte_pos);
        }
    }

    pub fn move_left(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
        }
    }

    pub fn move_right(&mut self) {
        if self.cursor < self.char_count() {
            self.cursor += 1;
        }
    }

    pub fn move_home(&mut self) {
        self.cursor = 0;
    }

    pub fn move_end(&mut self) {
        self.cursor = self.char_count();
    }

    pub fn clear(&mut self) {
        self.buffer.clear();
        self.cursor = 0;
        self.history_index = None;
    }

    pub fn set_text(&mut self, text: &str) {
        self.buffer = text.to_string();
        self.cursor = self.char_count();
    }

    pub fn submit(&mut self) -> String {
        let submitted = self.buffer.trim().to_string();
        if !submitted.is_empty() {
            if self.history.last().map(|s| s.as_str()) != Some(&submitted) {
                self.history.push(submitted.clone());
            }
        }
        self.clear();
        submitted
    }

    pub fn history(&self) -> &[String] {
        &self.history
    }

    pub fn history_up(&mut self) {
        if self.history.is_empty() {
            return;
        }
        match self.history_index {
            None => {
                self.saved_draft = self.buffer.clone();
                let last_idx = self.history.len() - 1;
                self.history_index = Some(last_idx);
                let text = self.history[last_idx].clone();
                self.set_text(&text);
            }
            Some(idx) => {
                if idx > 0 {
                    let next_idx = idx - 1;
                    self.history_index = Some(next_idx);
                    let text = self.history[next_idx].clone();
                    self.set_text(&text);
                }
            }
        }
    }

    pub fn history_down(&mut self) {
        if let Some(idx) = self.history_index {
            if idx + 1 < self.history.len() {
                let next_idx = idx + 1;
                self.history_index = Some(next_idx);
                let text = self.history[next_idx].clone();
                self.set_text(&text);
            } else {
                self.history_index = None;
                let draft = std::mem::take(&mut self.saved_draft);
                self.set_text(&draft);
            }
        }
    }

    pub fn char_count(&self) -> usize {
        self.buffer.chars().count()
    }
}
