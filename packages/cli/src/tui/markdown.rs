use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MarkdownToken {
    Header { level: usize, text: String },
    CodeBlock { language: String, lines: Vec<String> },
    Bullet { text: String },
    Text { text: String },
    Empty,
}

/// Parses raw markdown into structured tokens.
pub fn parse_markdown(content: &str) -> Vec<MarkdownToken> {
    let mut tokens = Vec::new();
    let mut in_code_block = false;
    let mut code_lang = String::new();
    let mut code_lines = Vec::new();

    for line in content.lines() {
        if line.starts_with("```") {
            if in_code_block {
                tokens.push(MarkdownToken::CodeBlock {
                    language: code_lang.clone(),
                    lines: std::mem::take(&mut code_lines),
                });
                in_code_block = false;
                code_lang.clear();
            } else {
                in_code_block = true;
                code_lang = line.trim_start_matches("```").trim().to_string();
            }
            continue;
        }

        if in_code_block {
            code_lines.push(line.to_string());
            continue;
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            tokens.push(MarkdownToken::Empty);
        } else if trimmed.starts_with('#') {
            let hashes = trimmed.chars().take_while(|c| *c == '#').count();
            let text = trimmed[hashes..].trim().to_string();
            tokens.push(MarkdownToken::Header { level: hashes, text });
        } else if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
            tokens.push(MarkdownToken::Bullet {
                text: trimmed[2..].trim().to_string(),
            });
        } else {
            tokens.push(MarkdownToken::Text {
                text: line.to_string(),
            });
        }
    }

    if in_code_block && !code_lines.is_empty() {
        tokens.push(MarkdownToken::CodeBlock {
            language: code_lang,
            lines: code_lines,
        });
    }

    tokens
}

/// Formats inline markdown formatting (bold `**text**`, inline code `` `code` ``) into styled Spans.
pub fn format_inline_spans(text: &str, base_style: Style) -> Vec<Span<'static>> {
    let mut spans = Vec::new();
    let mut remaining = text;

    while !remaining.is_empty() {
        // Look for next bold or code delimiter
        let bold_pos = remaining.find("**");
        let code_pos = remaining.find('`');

        let next_delim = match (bold_pos, code_pos) {
            (Some(b), Some(c)) => {
                if b <= c {
                    Some((b, "**"))
                } else {
                    Some((c, "`"))
                }
            }
            (Some(b), None) => Some((b, "**")),
            (None, Some(c)) => Some((c, "`")),
            (None, None) => None,
        };

        if let Some((pos, delim)) = next_delim {
            if pos > 0 {
                spans.push(Span::styled(remaining[..pos].to_string(), base_style));
            }

            let after_delim = &remaining[pos + delim.len()..];
            if let Some(end_pos) = after_delim.find(delim) {
                let inner = &after_delim[..end_pos];
                if delim == "**" {
                    spans.push(Span::styled(
                        inner.to_string(),
                        base_style.add_modifier(Modifier::BOLD).fg(Color::White),
                    ));
                } else {
                    spans.push(Span::styled(
                        inner.to_string(),
                        Style::default().fg(Color::Yellow).bg(Color::Rgb(30, 30, 30)),
                    ));
                }
                remaining = &after_delim[end_pos + delim.len()..];
            } else {
                // Unclosed delimiter, output as plain text
                spans.push(Span::styled(remaining[pos..pos + delim.len()].to_string(), base_style));
                remaining = after_delim;
            }
        } else {
            spans.push(Span::styled(remaining.to_string(), base_style));
            break;
        }
    }

    spans
}

/// Converts a MarkdownToken into Ratatui Lines with styling.
pub fn token_to_lines(token: &MarkdownToken, max_code_lines: Option<usize>) -> Vec<Line<'static>> {
    let mut lines = Vec::new();

    match token {
        MarkdownToken::Header { level, text } => {
            let color = match level {
                1 => Color::Cyan,
                2 => Color::LightCyan,
                _ => Color::White,
            };
            let prefix = match level {
                1 => "# ",
                2 => "## ",
                _ => "### ",
            };
            lines.push(Line::from(vec![
                Span::styled(prefix, Style::default().fg(Color::DarkGray)),
                Span::styled(
                    text.clone(),
                    Style::default()
                        .fg(color)
                        .add_modifier(Modifier::BOLD),
                ),
            ]));
        }
        MarkdownToken::Bullet { text } => {
            let mut spans = vec![Span::styled("  • ", Style::default().fg(Color::Green))];
            spans.extend(format_inline_spans(text, Style::default().fg(Color::White)));
            lines.push(Line::from(spans));
        }
        MarkdownToken::Text { text } => {
            let spans = format_inline_spans(text, Style::default().fg(Color::Reset));
            lines.push(Line::from(spans));
        }
        MarkdownToken::Empty => {
            lines.push(Line::from(""));
        }
        MarkdownToken::CodeBlock { language, lines: code_lines } => {
            let total = code_lines.len();
            let limit = max_code_lines.unwrap_or(usize::MAX);
            let display_lines = if total > limit { &code_lines[..limit] } else { &code_lines[..] };

            let lang_tag = if language.is_empty() { "code" } else { language.as_str() };
            lines.push(Line::from(vec![
                Span::styled("┌── ", Style::default().fg(Color::Cyan)),
                Span::styled(lang_tag.to_string(), Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                Span::styled(format!(" ({} lines) ────────", total), Style::default().fg(Color::DarkGray)),
            ]));

            let line_num_width = format!("{}", total).len().max(2);

            for (idx, line_str) in display_lines.iter().enumerate() {
                let num_str = format!("{:>width$} │ ", idx + 1, width = line_num_width);
                lines.push(Line::from(vec![
                    Span::styled("│ ", Style::default().fg(Color::Cyan)),
                    Span::styled(num_str, Style::default().fg(Color::DarkGray)),
                    Span::styled(line_str.clone(), Style::default().fg(Color::Yellow)),
                ]));
            }

            if total > limit {
                lines.push(Line::from(vec![
                    Span::styled("│ ", Style::default().fg(Color::Cyan)),
                    Span::styled(
                        format!("... ({} more lines hidden)", total - limit),
                        Style::default().fg(Color::DarkGray).add_modifier(Modifier::ITALIC),
                    ),
                ]));
            }

            lines.push(Line::from(vec![
                Span::styled("└────────────────────────────────────────", Style::default().fg(Color::Cyan)),
            ]));
        }
    }

    lines
}
