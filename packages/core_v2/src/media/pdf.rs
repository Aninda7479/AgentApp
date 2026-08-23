use std::path::Path;
use anyhow::Result;


use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfSection {
    pub heading: String,
    pub body: String,
    pub bullet_points: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfDocumentSpec {
    pub title: String,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub sections: Vec<PdfSection>,
    pub footer_text: Option<String>,
}

/// Generates a structured PDF document from `PdfDocumentSpec`.
pub fn generate_pdf_document(spec: &PdfDocumentSpec, output_path: &Path) -> Result<usize> {
    if spec.sections.is_empty() {
        anyhow::bail!("Cannot generate PDF: sections list is empty");
    }

    if let Some(parent) = output_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let mut pdf_content = Vec::new();
    // Minimal standard compliant PDF 1.4 header
    pdf_content.extend_from_slice(b"%PDF-1.4\n");
    pdf_content.extend_from_slice(b"%\xE2\xE3\xCF\xD3\n");

    // Catalog & Pages object
    pdf_content.extend_from_slice(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    pdf_content.extend_from_slice(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

    // Construct stream content
    let mut stream_data = String::new();
    stream_data.push_str("BT /F1 20 Tf 50 750 Td (");
    stream_data.push_str(&escape_pdf_string(&spec.title));
    stream_data.push_str(") Tj ET\n");

    let mut y_pos = 710;
    if let Some(ref author) = spec.author {
        stream_data.push_str(&format!("BT /F1 11 Tf 50 {} Td (By: {}) Tj ET\n", y_pos, escape_pdf_string(author)));
        y_pos -= 25;
    }

    for section in &spec.sections {
        if y_pos < 100 {
            break; // Page boundary for single-page preview
        }
        stream_data.push_str(&format!("BT /F1 14 Tf 50 {} Td (", y_pos));

        stream_data.push_str(&escape_pdf_string(&section.heading));
        stream_data.push_str(") Tj ET\n");
        y_pos -= 20;

        for line in section.body.lines() {
            if y_pos < 80 {
                break;
            }
            stream_data.push_str(&format!("BT /F1 10 Tf 50 {} Td (", y_pos));
            stream_data.push_str(&escape_pdf_string(line));
            stream_data.push_str(") Tj ET\n");
            y_pos -= 15;
        }

        if let Some(ref bullets) = section.bullet_points {
            for bullet in bullets {
                if y_pos < 80 {
                    break;
                }
                stream_data.push_str(&format!("BT /F1 10 Tf 65 {} Td (- ", y_pos));
                stream_data.push_str(&escape_pdf_string(bullet));
                stream_data.push_str(") Tj ET\n");
                y_pos -= 15;
            }
        }
        y_pos -= 15;
    }

    // Page object with standard font reference
    let stream_len = stream_data.len();
    pdf_content.extend_from_slice(b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n");
    pdf_content.extend_from_slice(format!("4 0 obj\n<< /Length {} >>\nstream\n{}\nendstream\nendobj\n", stream_len, stream_data).as_bytes());
    pdf_content.extend_from_slice(b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

    // XRef table
    let xref_pos = pdf_content.len();
    pdf_content.extend_from_slice(b"xref\n0 6\n0000000000 65535 f \n0000000015 00000 n \n0000000068 00000 n \n0000000125 00000 n \n");
    pdf_content.extend_from_slice(format!("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n", xref_pos).as_bytes());

    std::fs::write(output_path, &pdf_content)?;
    Ok(pdf_content.len())
}

fn escape_pdf_string(input: &str) -> String {
    input.replace('\\', "\\\\").replace('(', "\\(").replace(')', "\\)")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_pdf_basic() {
        let temp_dir = std::env::temp_dir().join(format!("test_pdf_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let out = temp_dir.join("test.pdf");

        let spec = PdfDocumentSpec {
            title: "SuperAgent Report".to_string(),
            author: Some("AI Agent".to_string()),
            subject: None,
            sections: vec![PdfSection {
                heading: "Executive Summary".to_string(),
                body: "This is a generated PDF report from SuperAgent core_v2 in Rust.".to_string(),
                bullet_points: Some(vec!["High performance".to_string(), "Memory safety".to_string()]),
            }],
            footer_text: None,
        };

        let bytes = generate_pdf_document(&spec, &out).unwrap();
        assert!(bytes > 0);
        assert!(out.exists());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
