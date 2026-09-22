use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};

use crate::tools::r#trait::Tool;

/// Tool for asking the user one or more questions, clarifying requirements,
/// or presenting interactive quizzes and surveys.
#[derive(Clone, Default)]
pub struct QuestionTool;

impl QuestionTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for QuestionTool {
    fn name(&self) -> &str {
        "question"
    }

    fn description(&self) -> &str {
        "Asks the user one or more questions, clarification prompts, or quiz items with optional selectable choices."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "Question text when asking a single question"
                },
                "questions": {
                    "type": "array",
                    "description": "Array of question objects for multi-question surveys or quizzes",
                    "items": {
                        "type": "object",
                        "properties": {
                            "question": {
                                "type": "string",
                                "description": "The question text"
                            },
                            "header": {
                                "type": "string",
                                "description": "Optional category or header (e.g. 'Trivia Q1', 'Dev Q2')"
                            },
                            "options": {
                                "type": "array",
                                "description": "Selectable choices (either strings or { label, description } objects)",
                                "items": {
                                    "oneOf": [
                                        { "type": "string" },
                                        {
                                            "type": "object",
                                            "properties": {
                                                "label": { "type": "string" },
                                                "description": { "type": "string" }
                                            },
                                            "required": ["label"]
                                        }
                                    ]
                                }
                            },
                            "is_multi_select": {
                                "type": "boolean",
                                "description": "Whether multiple choices can be selected"
                            }
                        },
                        "required": ["question"]
                    }
                },
                "options": {
                    "type": "array",
                    "description": "Selectable options for a single question",
                    "items": {
                        "oneOf": [
                            { "type": "string" },
                            {
                                "type": "object",
                                "properties": {
                                    "label": { "type": "string" },
                                    "description": { "type": "string" }
                                },
                                "required": ["label"]
                            }
                        ]
                    }
                }
            }
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let mut output = String::new();

        // 1. Check for array of questions (e.g. quiz or survey)
        if let Some(questions_arr) = input.get("questions").and_then(|v| v.as_array()) {
            output.push_str(&format!(
                "Presented {} question(s) to the user:\n\n",
                questions_arr.len()
            ));

            for (idx, q_val) in questions_arr.iter().enumerate() {
                let header = q_val.get("header").and_then(|v| v.as_str()).unwrap_or("");
                let q_text = q_val
                    .get("question")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Untitled Question");

                if !header.is_empty() {
                    output.push_str(&format!("{}. [{}] {}\n", idx + 1, header, q_text));
                } else {
                    output.push_str(&format!("{}. {}\n", idx + 1, q_text));
                }

                if let Some(opts) = q_val.get("options").and_then(|v| v.as_array()) {
                    for (opt_idx, opt) in opts.iter().enumerate() {
                        let opt_label = if let Some(s) = opt.as_str() {
                            s.to_string()
                        } else if let Some(lbl) = opt.get("label").and_then(|v| v.as_str()) {
                            let desc = opt
                                .get("description")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            if desc.is_empty() {
                                lbl.to_string()
                            } else {
                                format!("{} ({})", lbl, desc)
                            }
                        } else {
                            opt.to_string()
                        };

                        let letter = (b'A' + (opt_idx % 26) as u8) as char;
                        output.push_str(&format!("   {}. {}\n", letter, opt_label));
                    }
                }
                output.push('\n');
            }

            output.push_str("Awaiting user's answers or choices.");
            return Ok(output);
        }

        // 2. Check for single question
        if let Some(q_text) = input.get("question").and_then(|v| v.as_str()) {
            output.push_str(&format!("Question: {}\n", q_text));

            if let Some(opts) = input.get("options").and_then(|v| v.as_array()) {
                output.push_str("Options:\n");
                for (opt_idx, opt) in opts.iter().enumerate() {
                    let opt_label = if let Some(s) = opt.as_str() {
                        s.to_string()
                    } else if let Some(lbl) = opt.get("label").and_then(|v| v.as_str()) {
                        let desc = opt
                            .get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        if desc.is_empty() {
                            lbl.to_string()
                        } else {
                            format!("{} ({})", lbl, desc)
                        }
                    } else {
                        opt.to_string()
                    };

                    let letter = (b'A' + (opt_idx % 26) as u8) as char;
                    output.push_str(&format!("  {}. {}\n", letter, opt_label));
                }
            }

            output.push_str("\nAwaiting user's response.");
            return Ok(output);
        }

        // 3. Fallback for raw or malformed input
        Ok("Question presented to the user. Awaiting response.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_question_tool_single() {
        let tool = QuestionTool::new();
        let res = tool
            .execute(json!({
                "question": "What is your favorite language?",
                "options": ["Rust", "TypeScript", "Python", "Go"]
            }))
            .await
            .unwrap();

        assert!(res.contains("What is your favorite language?"));
        assert!(res.contains("A. Rust"));
        assert!(res.contains("B. TypeScript"));
    }

    #[tokio::test]
    async fn test_question_tool_multi_quiz() {
        let tool = QuestionTool::new();
        let res = tool
            .execute(json!({
                "questions": [
                    {
                        "header": "Trivia Q1",
                        "question": "Which planet is known as the Red Planet?",
                        "options": [
                            { "label": "Venus", "description": "" },
                            { "label": "Mars", "description": "" }
                        ]
                    },
                    {
                        "header": "Dev Q2",
                        "question": "Which language powers the SuperAgent core?",
                        "options": ["Rust", "Python"]
                    }
                ]
            }))
            .await
            .unwrap();

        assert!(res.contains("Presented 2 question(s) to the user:"));
        assert!(res.contains("[Trivia Q1] Which planet is known as the Red Planet?"));
        assert!(res.contains("A. Venus"));
        assert!(res.contains("B. Mars"));
        assert!(res.contains("[Dev Q2] Which language powers the SuperAgent core?"));
        assert!(res.contains("A. Rust"));
        assert!(res.contains("Awaiting user's answers or choices."));
    }
}
