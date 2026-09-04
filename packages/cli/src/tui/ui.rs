use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph, Wrap};
use ratatui::Frame;

use crate::tui::app::{AppState, MessageRole, Mode, SPINNER_FRAMES, TIPS};
use crate::tui::markdown::{parse_markdown, token_to_lines};
use crate::tui::palette::PaletteItemKind;

/// Main draw function called on every frame.
pub fn draw(f: &mut Frame, app: &mut AppState) {
    let size = f.area();

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(4),      // Banner
            Constraint::Min(6),         // Message viewport
            Constraint::Length(3),      // Composer input
            Constraint::Length(1),      // Status bar / footer
        ])
        .split(size);

    draw_banner(f, app, chunks[0]);
    draw_messages(f, app, chunks[1]);
    draw_composer(f, app, chunks[2]);
    draw_status_bar(f, app, chunks[3]);

    // Draw floating modals if active
    match app.mode {
        Mode::CommandPalette => draw_command_palette(f, app, size),
        Mode::ModelPicker => draw_model_picker(f, app, size),
        Mode::DiffReview => draw_diff_viewer(f, app, size),
        Mode::HistorySearch => draw_history_search(f, app, size),
        Mode::Normal => {}
    }
}

fn draw_banner(f: &mut Frame, app: &AppState, area: Rect) {
    let title_line = Line::from(vec![
        Span::styled("SuperAgent Terminal", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
    ]);
    let model_text = if !app.provider.is_empty() && !app.model.is_empty() {
        format!("{}/{} · effort xhigh", app.provider, app.model)
    } else {
        "no model configured · effort xhigh".to_string()
    };
    let info_line = Line::from(vec![
        Span::styled(
            model_text,
            Style::default().fg(Color::DarkGray),
        ),
    ]);
    let path_line = Line::from(vec![
        Span::styled(app.workspace_root.display().to_string(), Style::default().fg(Color::DarkGray)),
    ]);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan));

    let paragraph = Paragraph::new(vec![title_line, info_line, path_line]).block(block);
    f.render_widget(paragraph, area);
}

fn draw_messages(f: &mut Frame, app: &AppState, area: Rect) {
    let mut lines: Vec<Line> = Vec::new();

    for msg in &app.messages {
        match msg.role {
            MessageRole::User => {
                lines.push(Line::from(vec![
                    Span::styled("❯ ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                    Span::styled(msg.content.clone(), Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
                ]));
                lines.push(Line::from(""));
            }
            MessageRole::System => {
                lines.push(Line::from(vec![
                    Span::styled("⚠ ", Style::default().fg(Color::Yellow)),
                    Span::styled(msg.content.clone(), Style::default().fg(Color::Yellow)),
                ]));
                lines.push(Line::from(""));
            }
            MessageRole::Tool => {
                lines.push(Line::from(vec![
                    Span::styled("⚙ ", Style::default().fg(Color::DarkGray)),
                    Span::styled(msg.content.clone(), Style::default().fg(Color::DarkGray)),
                ]));
                lines.push(Line::from(""));
            }
            MessageRole::Assistant => {
                // Render tool calls if present
                for tc in &msg.tool_calls {
                    let icon = if tc.is_error { "✗" } else if tc.output.is_some() { "✓" } else { "⏳" };
                    let icon_color = if tc.is_error { Color::Red } else { Color::Green };

                    lines.push(Line::from(vec![
                        Span::styled(format!("  {} 🛠 Tool: ", icon), Style::default().fg(icon_color)),
                        Span::styled(tc.name.clone(), Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
                        Span::styled(format!(" {}", tc.input), Style::default().fg(Color::DarkGray)),
                    ]));

                    if let Some(ref out) = tc.output {
                        let preview = truncate_utf8(out, 120);
                        lines.push(Line::from(vec![
                            Span::styled("     ↳ ", Style::default().fg(Color::DarkGray)),
                            Span::styled(preview, Style::default().fg(Color::DarkGray)),
                        ]));
                    }
                }

                // Render assistant text markdown
                if !msg.content.is_empty() {
                    let tokens = parse_markdown(&msg.content);
                    for tok in tokens {
                        lines.extend(token_to_lines(&tok, Some(15)));
                    }
                }

                // Streaming cursor
                if msg.is_streaming {
                    lines.push(Line::from(vec![
                        Span::styled(" █", Style::default().fg(Color::Magenta)),
                    ]));
                }

                lines.push(Line::from(""));
            }
        }
    }

    let total_lines = lines.len();
    let visible_height = area.height.saturating_sub(2) as usize;

    let scroll_y = if total_lines > visible_height {
        if app.auto_scroll {
            total_lines.saturating_sub(visible_height)
        } else {
            app.scroll_offset.min(total_lines.saturating_sub(visible_height))
        }
    } else {
        0
    };

    let block = Block::default()
        .borders(Borders::NONE)
        .padding(ratatui::widgets::Padding::horizontal(1));

    let paragraph = Paragraph::new(lines)
        .block(block)
        .wrap(Wrap { trim: false })
        .scroll((scroll_y as u16, 0));

    f.render_widget(paragraph, area);
}

fn draw_composer(f: &mut Frame, app: &AppState, area: Rect) {
    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(if app.is_busy {
            Style::default().fg(Color::DarkGray)
        } else {
            Style::default().fg(Color::Cyan)
        });

    let prefix = if app.is_busy {
        Span::styled("⏳ ", Style::default().fg(Color::Yellow))
    } else {
        Span::styled("❯ ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
    };

    let text_content = app.composer.text();
    let input_line = Line::from(vec![
        prefix,
        Span::styled(text_content, Style::default().fg(Color::White)),
    ]);

    let paragraph = Paragraph::new(vec![input_line]).block(block);
    f.render_widget(paragraph, area);

    // Set terminal hardware cursor position
    if !app.is_busy && app.mode == Mode::Normal {
        let cursor_x = area.x + 3 + app.composer.cursor_pos() as u16;
        let cursor_y = area.y + 1;
        if cursor_x < area.x + area.width - 1 {
            f.set_cursor_position((cursor_x, cursor_y));
        }
    }
}

fn draw_status_bar(f: &mut Frame, app: &AppState, area: Rect) {
    let perm_color = match app.permission {
        crate::shortcuts::permissions::PermissionLevel::Auto => Color::Green,
        crate::shortcuts::permissions::PermissionLevel::Ask => Color::Yellow,
        crate::shortcuts::permissions::PermissionLevel::Deny => Color::Red,
    };

    let model_label = if !app.provider.is_empty() && !app.model.is_empty() {
        format!("{}/{} ", app.provider, app.model)
    } else {
        "no model selected ".to_string()
    };

    let mut spans = vec![
        Span::styled(format!(" [{}] ", app.permission.label()), Style::default().fg(perm_color).add_modifier(Modifier::BOLD)),
        Span::styled("│ ", Style::default().fg(Color::DarkGray)),
        Span::styled(model_label, Style::default().fg(Color::White)),
        Span::styled("│ ", Style::default().fg(Color::DarkGray)),
    ];

    if app.is_busy {
        let frame = SPINNER_FRAMES[app.spinner_frame];
        spans.push(Span::styled(format!("{} Working ({}s) ", frame, app.elapsed_secs), Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)));
        spans.push(Span::styled("│ ", Style::default().fg(Color::DarkGray)));

        let tip = TIPS[app.tip_index];
        spans.push(Span::styled(format!("Tip: {} ", tip), Style::default().fg(Color::DarkGray)));
    } else {
        if !app.turn_queue.is_empty() {
            spans.push(Span::styled(format!("[+{} queued] ", app.turn_queue.len()), Style::default().fg(Color::Magenta)));
            spans.push(Span::styled("│ ", Style::default().fg(Color::DarkGray)));
        }
        spans.push(Span::styled("/ for commands · Shift+Tab perm · Ctrl+R history · Ctrl+C exit", Style::default().fg(Color::DarkGray)));
    }

    let paragraph = Paragraph::new(Line::from(spans));
    f.render_widget(paragraph, area);
}

fn draw_command_palette(f: &mut Frame, app: &AppState, size: Rect) {
    let width = 70.min(size.width.saturating_sub(4));
    let height = 16.min(size.height.saturating_sub(4));
    let area = centered_rect(width, height, size);

    f.render_widget(Clear, area);

    let items: Vec<ListItem> = app
        .palette_state
        .filtered_items()
        .iter()
        .enumerate()
        .map(|(idx, item)| {
            let is_sel = idx == app.palette_state.selected_index;
            let prefix = if item.kind == PaletteItemKind::Skill { "⚡ " } else { "/" };
            let marker = if is_sel { "❯ " } else { "  " };
            let style = if is_sel {
                Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::White)
            };

            let line = Line::from(vec![
                Span::styled(marker, Style::default().fg(Color::Cyan)),
                Span::styled(prefix, Style::default().fg(Color::Green)),
                Span::styled(item.name.clone(), style),
                Span::styled(format!(" — {}", item.description), Style::default().fg(Color::DarkGray)),
            ]);

            ListItem::new(line)
        })
        .collect();

    let title = format!(" Commands & Skills ({}) — type to filter ", app.palette_state.query);
    let block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan));

    let list = List::new(items).block(block);
    f.render_widget(list, area);
}

fn draw_model_picker(f: &mut Frame, app: &AppState, size: Rect) {
    let width = 64.min(size.width.saturating_sub(4));
    let height = 16.min(size.height.saturating_sub(4));
    let area = centered_rect(width, height, size);

    f.render_widget(Clear, area);

    let items: Vec<ListItem> = app
        .model_picker_state
        .models
        .iter()
        .enumerate()
        .map(|(idx, item)| {
            let is_sel = idx == app.model_picker_state.selected_index;
            let is_curr = item.provider == app.provider && item.model_id == app.model;
            let marker = if is_sel { "❯ " } else { "  " };

            let name_style = if is_sel {
                Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::White)
            };

            let mut spans = vec![
                Span::styled(marker, Style::default().fg(Color::Cyan)),
                Span::styled(item.display_name.clone(), name_style),
            ];

            if is_curr {
                spans.push(Span::styled(" ● (active)", Style::default().fg(Color::Green)));
            }

            spans.push(Span::styled(format!("  [{}] · {}", item.provider, item.context_window), Style::default().fg(Color::DarkGray)));

            ListItem::new(Line::from(spans))
        })
        .collect();

    let block = Block::default()
        .title(" Select AI Model (↑/↓ to navigate, Enter to select, Esc to cancel) ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan));

    let list = List::new(items).block(block);
    f.render_widget(list, area);
}

fn draw_diff_viewer(f: &mut Frame, app: &AppState, size: Rect) {
    let width = (size.width * 85 / 100).min(size.width.saturating_sub(2));
    let height = (size.height * 85 / 100).min(size.height.saturating_sub(2));
    let area = centered_rect(width, height, size);

    f.render_widget(Clear, area);

    if let Some(file) = app.diff_viewer_state.current_file() {
        let diff_lines = crate::tui::diff_viewer::DiffViewerState::generate_diff_lines(
            &file.original_content,
            &file.modified_content,
        );

        let lines: Vec<Line> = diff_lines
            .into_iter()
            .map(|dl| {
                let (prefix, color) = match dl.tag {
                    similar::ChangeTag::Delete => ("- ", Color::Red),
                    similar::ChangeTag::Insert => ("+ ", Color::Green),
                    similar::ChangeTag::Equal => ("  ", Color::DarkGray),
                };
                Line::from(vec![
                    Span::styled(prefix, Style::default().fg(color)),
                    Span::styled(dl.content, Style::default().fg(color)),
                ])
            })
            .collect();

        let title = format!(
            " Diff: {} [{}/{}] · [a]ccept, [r]eject, [A]ccept all, [Esc] close ",
            file.file_path,
            app.diff_viewer_state.selected_file_index + 1,
            app.diff_viewer_state.files.len()
        );

        let block = Block::default()
            .title(title)
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Yellow));

        let paragraph = Paragraph::new(lines).block(block).wrap(Wrap { trim: false });
        f.render_widget(paragraph, area);
    } else {
        let block = Block::default()
            .title(" Diff Reviewer ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Yellow));
        let paragraph = Paragraph::new("No file modifications recorded in this session.").block(block);
        f.render_widget(paragraph, area);
    }
}

fn draw_history_search(f: &mut Frame, app: &AppState, size: Rect) {
    let width = 60.min(size.width.saturating_sub(4));
    let height = 6.min(size.height.saturating_sub(4));
    let area = centered_rect(width, height, size);

    f.render_widget(Clear, area);

    let query_line = Line::from(vec![
        Span::styled("Query: ", Style::default().fg(Color::Cyan)),
        Span::styled(app.history_search.query(), Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
    ]);

    let match_line = Line::from(vec![
        Span::styled("Match: ", Style::default().fg(Color::DarkGray)),
        Span::styled(
            app.history_search.current_match().unwrap_or("No match"),
            Style::default().fg(Color::Yellow),
        ),
    ]);

    let block = Block::default()
        .title(" Reverse History Search (Ctrl+R cycle, Enter select, Esc cancel) ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan));

    let paragraph = Paragraph::new(vec![query_line, match_line]).block(block);
    f.render_widget(paragraph, area);
}

fn centered_rect(width: u16, height: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length((r.height.saturating_sub(height)) / 2),
            Constraint::Length(height),
            Constraint::Length((r.height.saturating_sub(height)) / 2),
        ])
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Length((r.width.saturating_sub(width)) / 2),
            Constraint::Length(width),
            Constraint::Length((r.width.saturating_sub(width)) / 2),
        ])
        .split(popup_layout[1])[1]
}

/// Safely truncates a string to at most `max_chars` UTF-8 characters without splitting multibyte codepoints.
/// If truncated, appends `...` such that the result contains at most `max_chars` characters.
pub fn truncate_utf8(text: &str, max_chars: usize) -> String {
    let char_count = text.chars().count();
    if char_count > max_chars {
        let prefix_len = max_chars.saturating_sub(3);
        let truncated: String = text.chars().take(prefix_len).collect();
        format!("{}...", truncated)
    } else {
        text.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_utf8_shorter_or_equal() {
        assert_eq!(truncate_utf8("hello", 10), "hello");
        assert_eq!(truncate_utf8("hello", 5), "hello");
        assert_eq!(truncate_utf8("", 5), "");
    }

    #[test]
    fn test_truncate_utf8_longer_ascii() {
        assert_eq!(truncate_utf8("hello world", 8), "hello...");
        assert_eq!(truncate_utf8("1234567890", 6), "123...");
    }

    #[test]
    fn test_truncate_utf8_multibyte_characters() {
        // Emojis (4-byte UTF-8 each)
        let emojis = "🚀🦀🔥✨🎉🌟💡📦";
        // 8 chars total. Truncating to 6 chars takes 3 chars + "..." (6 chars total)
        let truncated = truncate_utf8(emojis, 6);
        assert_eq!(truncated, "🚀🦀🔥...");
        assert_eq!(truncated.chars().count(), 6);

        // CJK characters (3-byte UTF-8 each)
        let cjk = "こんにちは世界！Antigravity";
        let cjk_trunc = truncate_utf8(cjk, 8);
        assert_eq!(cjk_trunc, "こんにちは...");
        assert_eq!(cjk_trunc.chars().count(), 8);

        // Mixed content
        let mixed = "SuperAgent 🤖: 快速且强大! Let's build AI agents together.";
        let mixed_trunc = truncate_utf8(mixed, 25);
        assert_eq!(mixed_trunc.chars().count(), 25);
        assert!(mixed_trunc.ends_with("..."));
    }

    #[test]
    fn test_truncate_utf8_boundary_no_panics() {
        // Validates that taking character boundaries never panics even on complex multibyte boundaries
        let text = "a€🦀b€🦀c";
        for max in 0..=text.chars().count() + 2 {
            let res = truncate_utf8(text, max);
            assert!(res.chars().count() <= max.max(3));
        }
    }

    #[test]
    fn test_truncate_utf8_small_limits() {
        assert_eq!(truncate_utf8("abcdef", 2), "...");
        assert_eq!(truncate_utf8("abcdef", 0), "...");
    }
}
