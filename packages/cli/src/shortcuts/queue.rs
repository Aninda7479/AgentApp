use std::collections::VecDeque;

#[derive(Debug, Clone, Default)]
pub struct TurnQueueManager {
    queue: VecDeque<String>,
}

impl TurnQueueManager {
    pub fn new() -> Self {
        Self {
            queue: VecDeque::new(),
        }
    }

    pub fn enqueue(&mut self, prompt: String) {
        let trimmed = prompt.trim().to_string();
        if !trimmed.is_empty() {
            self.queue.push_back(trimmed);
        }
    }

    pub fn dequeue(&mut self) -> Option<String> {
        self.queue.pop_front()
    }

    pub fn len(&self) -> usize {
        self.queue.len()
    }

    pub fn is_empty(&self) -> bool {
        self.queue.is_empty()
    }

    pub fn clear(&mut self) {
        self.queue.clear();
    }

    pub fn peek_all(&self) -> Vec<String> {
        self.queue.iter().cloned().collect()
    }
}
