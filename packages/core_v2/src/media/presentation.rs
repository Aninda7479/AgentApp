use std::path::Path;
use anyhow::Result;


use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlideSpec {
    pub title: String,
    pub bullet_points: Vec<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresentationSpec {
    pub deck_title: String,
    pub subtitle: Option<String>,
    pub author: Option<String>,
    pub theme_color: Option<String>,
    pub slides: Vec<SlideSpec>,
}

/// Compiles a standalone responsive HTML5/CSS presentation bundle from `PresentationSpec`.
pub fn generate_presentation_deck(spec: &PresentationSpec, output_path: &Path) -> Result<usize> {
    if spec.slides.is_empty() {
        anyhow::bail!("Presentation requires at least one slide");
    }

    let theme = spec.theme_color.as_deref().unwrap_or("#2563eb");

    let mut html = String::new();
    html.push_str("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n");
    html.push_str("<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
    html.push_str(&format!("<title>{}</title>\n", spec.deck_title));
    html.push_str("<style>\n");
    html.push_str("  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }\n");
    html.push_str("  .slide-container { width: 90%; max-width: 900px; aspect-ratio: 16/9; background: #1e293b; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); padding: 48px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; }\n");
    html.push_str(&format!("  .accent-bar {{ position: absolute; top: 0; left: 0; right: 0; height: 8px; background: {}; }}\n", theme));
    html.push_str("  h1 { font-size: 2.5rem; margin: 0 0 16px 0; color: #ffffff; }\n");
    html.push_str("  h2 { font-size: 2rem; margin: 0 0 24px 0; color: #ffffff; }\n");
    html.push_str("  ul { font-size: 1.35rem; line-height: 1.8; color: #cbd5e1; margin-left: 24px; }\n");
    html.push_str("  .footer { display: flex; justify-content: space-between; font-size: 0.9rem; color: #64748b; margin-top: auto; }\n");
    html.push_str("  .controls { margin-top: 24px; display: flex; gap: 12px; }\n");
    html.push_str("  button { background: #334155; color: #ffffff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 1rem; }\n");
    html.push_str("  button:hover { background: #475569; }\n");
    html.push_str("</style>\n</head>\n<body>\n");

    // Embed slides JSON for client navigation script
    let slides_json = serde_json::to_string(&spec.slides)?;
    html.push_str("<div class=\"slide-container\" id=\"slideBox\">\n");
    html.push_str("  <div class=\"accent-bar\"></div>\n");
    html.push_str("  <div id=\"slideContent\"></div>\n");
    html.push_str("  <div class=\"footer\"><span id=\"deckTitle\">");
    html.push_str(&spec.deck_title);
    html.push_str("</span><span id=\"slideNum\"></span></div>\n");
    html.push_str("</div>\n");

    html.push_str("<div class=\"controls\">\n");
    html.push_str("  <button onclick=\"prevSlide()\">&#8592; Previous</button>\n");
    html.push_str("  <button onclick=\"nextSlide()\">Next &#8594;</button>\n");
    html.push_str("</div>\n");

    html.push_str("<script>\n");
    html.push_str(&format!("  const slides = {};\n", slides_json));
    html.push_str("  let currentIdx = 0;\n");
    html.push_str("  function renderSlide() {\n");
    html.push_str("    const slide = slides[currentIdx];\n");
    html.push_str("    let bullets = slide.bullet_points.map(b => `<li>${b}</li>`).join('');\n");
    html.push_str("    document.getElementById('slideContent').innerHTML = `<h2>${slide.title}</h2><ul>${bullets}</ul>`;\n");
    html.push_str("    document.getElementById('slideNum').innerText = `${currentIdx + 1} / ${slides.length}`;\n");
    html.push_str("  }\n");
    html.push_str("  function nextSlide() { if (currentIdx < slides.length - 1) { currentIdx++; renderSlide(); } }\n");
    html.push_str("  function prevSlide() { if (currentIdx > 0) { currentIdx--; renderSlide(); } }\n");
    html.push_str("  window.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === ' ') nextSlide(); if (e.key === 'ArrowLeft') prevSlide(); });\n");
    html.push_str("  renderSlide();\n");
    html.push_str("</script>\n</body>\n</html>");

    if let Some(parent) = output_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }

    std::fs::write(output_path, &html)?;
    Ok(html.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_presentation_deck() {
        let temp_dir = std::env::temp_dir().join(format!("test_deck_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let out = temp_dir.join("deck.html");

        let spec = PresentationSpec {
            deck_title: "AI Agent Architecture".to_string(),
            subtitle: Some("Rust Core Transition".to_string()),
            author: Some("SuperAgent".to_string()),
            theme_color: Some("#3b82f6".to_string()),
            slides: vec![
                SlideSpec {
                    title: "Overview".to_string(),
                    bullet_points: vec!["Rust Native Engine".to_string(), "High Throughput".to_string()],
                    notes: None,
                },
                SlideSpec {
                    title: "Performance Gains".to_string(),
                    bullet_points: vec!["Zero runtime bloat".to_string(), "Low memory overhead".to_string()],
                    notes: None,
                },
            ],
        };

        let bytes = generate_presentation_deck(&spec, &out).unwrap();
        assert!(bytes > 0);
        assert!(out.exists());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
