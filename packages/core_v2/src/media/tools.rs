use std::path::PathBuf;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};

use crate::media::pdf::{generate_pdf_document, PdfDocumentSpec};
use crate::media::presentation::{generate_presentation_deck, PresentationSpec};
use crate::tools::builtin::file_ops::validate_path_in_workspace;
use crate::tools::r#trait::Tool;


pub struct GeneratePdfTool {
    workspace_root: PathBuf,
}

impl GeneratePdfTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }
}

#[async_trait]
impl Tool for GeneratePdfTool {
    fn name(&self) -> &str {
        "generate_pdf"
    }

    fn description(&self) -> &str {
        "Generates a formatted PDF document with title, author, and structured sections."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "output_path": { "type": "string", "description": "Output path for the generated PDF file" },
                "title": { "type": "string", "description": "Document title" },
                "author": { "type": "string", "description": "Document author (optional)" },
                "sections": {
                    "type": "array",
                    "description": "List of document sections",
                    "items": {
                        "type": "object",
                        "properties": {
                            "heading": { "type": "string" },
                            "body": { "type": "string" },
                            "bullet_points": { "type": "array", "items": { "type": "string" } }
                        },
                        "required": ["heading", "body"]
                    }
                }
            },
            "required": ["output_path", "title", "sections"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let output_path_str = input["output_path"].as_str().ok_or_else(|| anyhow!("Missing output_path"))?;
        let safe_out = validate_path_in_workspace(output_path_str, &self.workspace_root)?;

        let spec: PdfDocumentSpec = serde_json::from_value(input)?;
        let bytes = generate_pdf_document(&spec, &safe_out)?;
        Ok(format!("Successfully generated PDF ({} bytes) at '{}'", bytes, safe_out.display()))
    }
}

pub struct GeneratePresentationTool {
    workspace_root: PathBuf,
}

impl GeneratePresentationTool {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }
}

#[async_trait]
impl Tool for GeneratePresentationTool {
    fn name(&self) -> &str {
        "generate_presentation"
    }

    fn description(&self) -> &str {
        "Generates a standalone responsive presentation slide deck (HTML5/CSS bundle)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "output_path": { "type": "string", "description": "Output path for the presentation HTML deck" },
                "deck_title": { "type": "string", "description": "Presentation deck title" },
                "subtitle": { "type": "string", "description": "Subtitle" },
                "author": { "type": "string", "description": "Author name" },
                "theme_color": { "type": "string", "description": "Hex theme color (e.g. #3b82f6)" },
                "slides": {
                    "type": "array",
                    "description": "List of slide specifications",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": { "type": "string" },
                            "bullet_points": { "type": "array", "items": { "type": "string" } },
                            "notes": { "type": "string" }
                        },
                        "required": ["title", "bullet_points"]
                    }
                }
            },
            "required": ["output_path", "deck_title", "slides"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let output_path_str = input["output_path"].as_str().ok_or_else(|| anyhow!("Missing output_path"))?;
        let safe_out = validate_path_in_workspace(output_path_str, &self.workspace_root)?;

        let spec: PresentationSpec = serde_json::from_value(input)?;
        let bytes = generate_presentation_deck(&spec, &safe_out)?;
        Ok(format!("Successfully generated presentation deck ({} bytes) at '{}'", bytes, safe_out.display()))
    }
}
