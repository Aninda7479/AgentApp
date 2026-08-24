pub struct HistorySearch {
    history: Vec<String>,
    active: bool,
    query: String,
    matched_indices: Vec<usize>,
    current_index: usize,
    case_sensitive: bool,
}

impl HistorySearch {
    pub fn new(initial_history: Vec<String>) -> Self {
        Self {
            history: initial_history,
            active: false,
            query: String::new(),
            matched_indices: Vec::new(),
            current_index: 0,
            case_sensitive: false,
        }
    }

    pub fn add_history(&mut self, item: &str) {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            return;
        }
        if self.history.last().map(|s| s.as_str()) != Some(trimmed) {
            self.history.push(trimmed.to_string());
        }
    }

    pub fn history(&self) -> &[String] {
        &self.history
    }

    pub fn start_search(&mut self) {
        self.active = true;
        self.query.clear();
        self.update_matches();
    }

    pub fn cancel_search(&mut self) {
        self.active = false;
        self.query.clear();
        self.matched_indices.clear();
        self.current_index = 0;
    }

    pub fn is_active(&self) -> bool {
        self.active
    }

    pub fn query(&self) -> &str {
        &self.query
    }

    pub fn set_query(&mut self, query: String) {
        self.query = query;
        self.update_matches();
    }

    pub fn append_char(&mut self, c: char) {
        self.query.push(c);
        self.update_matches();
    }

    pub fn pop_char(&mut self) {
        self.query.pop();
        self.update_matches();
    }

    pub fn next_match(&mut self) -> Option<&str> {
        if self.matched_indices.is_empty() {
            return None;
        }
        self.current_index = (self.current_index + 1) % self.matched_indices.len();
        self.current_match()
    }

    pub fn previous_match(&mut self) -> Option<&str> {
        if self.matched_indices.is_empty() {
            return None;
        }
        self.current_index = if self.current_index == 0 {
            self.matched_indices.len() - 1
        } else {
            self.current_index - 1
        };
        self.current_match()
    }

    pub fn current_match(&self) -> Option<&str> {
        if self.matched_indices.is_empty() || self.current_index >= self.matched_indices.len() {
            return None;
        }
        let hist_idx = self.matched_indices[self.current_index];
        self.history.get(hist_idx).map(|s| s.as_str())
    }

    pub fn matched_count(&self) -> usize {
        self.matched_indices.len()
    }

    pub fn fuzzy_match(query: &str, text: &str, case_sensitive: bool) -> bool {
        if query.is_empty() {
            return true;
        }
        let q: String = if case_sensitive {
            query.to_string()
        } else {
            query.to_lowercase()
        };
        let t: String = if case_sensitive {
            text.to_string()
        } else {
            text.to_lowercase()
        };

        let mut q_chars = q.chars();
        let mut target = match q_chars.next() {
            Some(c) => c,
            None => return true,
        };

        for c in t.chars() {
            if c == target {
                match q_chars.next() {
                    Some(next_c) => target = next_c,
                    None => return true,
                }
            }
        }
        false
    }

    fn update_matches(&mut self) {
        self.matched_indices.clear();
        for (i, item) in self.history.iter().enumerate().rev() {
            if Self::fuzzy_match(&self.query, item, self.case_sensitive) {
                self.matched_indices.push(i);
            }
        }
        self.current_index = 0;
    }
}
