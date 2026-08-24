use similar::{ChangeTag, TextDiff};
use crate::commands::{DiffFileChange, DiffStatus};

#[derive(Debug, Clone)]
pub struct DiffLine {
    pub tag: ChangeTag,
    pub old_line_no: Option<usize>,
    pub new_line_no: Option<usize>,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct DiffViewerState {
    pub files: Vec<DiffFileChange>,
    pub selected_file_index: usize,
}

impl DiffViewerState {
    pub fn new(files: Vec<DiffFileChange>) -> Self {
        Self {
            files,
            selected_file_index: 0,
        }
    }

    pub fn current_file(&self) -> Option<&DiffFileChange> {
        self.files.get(self.selected_file_index)
    }

    pub fn current_file_mut(&mut self) -> Option<&mut DiffFileChange> {
        self.files.get_mut(self.selected_file_index)
    }

    pub fn next_file(&mut self) {
        if !self.files.is_empty() {
            self.selected_file_index = (self.selected_file_index + 1) % self.files.len();
        }
    }

    pub fn previous_file(&mut self) {
        if !self.files.is_empty() {
            self.selected_file_index = if self.selected_file_index == 0 {
                self.files.len() - 1
            } else {
                self.selected_file_index - 1
            };
        }
    }

    pub fn accept_current(&mut self) {
        if let Some(file) = self.current_file_mut() {
            file.status = DiffStatus::Accepted;
        }
    }

    pub fn reject_current(&mut self) {
        if let Some(file) = self.current_file_mut() {
            file.status = DiffStatus::Rejected;
        }
    }

    pub fn accept_all(&mut self) {
        for file in &mut self.files {
            file.status = DiffStatus::Accepted;
        }
    }

    pub fn generate_diff_lines(original: &str, modified: &str) -> Vec<DiffLine> {
        let diff = TextDiff::from_lines(original, modified);
        let mut lines = Vec::new();

        for (idx, group) in diff.grouped_ops(3).iter().enumerate() {
            if idx > 0 {
                lines.push(DiffLine {
                    tag: ChangeTag::Equal,
                    old_line_no: None,
                    new_line_no: None,
                    content: "───".to_string(),
                });
            }

            for op in group {
                for change in diff.iter_changes(op) {
                    lines.push(DiffLine {
                        tag: change.tag(),
                        old_line_no: change.old_index(),
                        new_line_no: change.new_index(),
                        content: change.value().trim_end_matches(['\r', '\n']).to_string(),
                    });
                }
            }
        }

        lines
    }
}
