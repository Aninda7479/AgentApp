pub mod app;
pub mod composer;
pub mod diff_viewer;
pub mod events;
pub mod markdown;
pub mod model_picker;
pub mod palette;
pub mod ui;

use std::io::stdout;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use crossterm::event::{DisableMouseCapture, EnableMouseCapture, KeyCode, KeyEventKind, KeyModifiers};
use crossterm::execute;
use crossterm::terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen};
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;

use crate::attachments::prepare_attachments;
use crate::commands::{CommandAction, CommandContext};
use crate::shortcuts::clipboard::ClipboardManager;
use crate::shortcuts::editor_bridge::EditorBridge;
use crate::tui::app::{AppState, Mode};
use crate::tui::events::{AppEvent, EventHandler};

pub async fn run_tui(mut app: AppState) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let original_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let _ = disable_raw_mode();
        let _ = execute!(std::io::stdout(), LeaveAlternateScreen, DisableMouseCapture);
        original_hook(info);
    }));

    let mut events = EventHandler::new(Duration::from_millis(50));

    loop {
        terminal.draw(|f| ui::draw(f, &mut app))?;

        if app.should_exit {
            break;
        }

        if let Some(event) = events.rx.recv().await {
            match event {
                AppEvent::Tick => {
                    app.tick();
                }
                AppEvent::Resize(_, _) => {}
                AppEvent::Agent(agent_event) => {
                    app.handle_agent_event(agent_event);

                    // If turn just finished and we have queued turns, launch next
                    if !app.is_busy && !app.turn_queue.is_empty() {
                        if let Some(next_prompt) = app.turn_queue.dequeue() {
                            app.add_user_message(next_prompt.clone());
                            app.start_assistant_turn();

                            let engine = Arc::clone(&app.engine);
                            let model_config = app.build_model_config();
                            let tx = events.tx.clone();

                            tokio::spawn(async move {
                                match engine.run_loop(&model_config, "", &next_prompt).await {
                                    Ok(mut rx) => {
                                        while let Some(evt) = rx.recv().await {
                                            let _ = tx.send(AppEvent::Agent(evt)).await;
                                        }
                                    }
                                    Err(err) => {
                                        let _ = tx.send(AppEvent::Agent(superagent_core_v2::types::AgentEvent::Error {
                                            message: err.to_string(),
                                        })).await;
                                    }
                                }
                            });
                        }
                    }
                }
                AppEvent::Mouse(mouse) => {
                    // Mouse wheel scrolling
                    if mouse.kind == crossterm::event::MouseEventKind::ScrollDown {
                        app.auto_scroll = false;
                        app.scroll_offset = app.scroll_offset.saturating_add(2);
                    } else if mouse.kind == crossterm::event::MouseEventKind::ScrollUp {
                        app.auto_scroll = false;
                        app.scroll_offset = app.scroll_offset.saturating_sub(2);
                    }
                }
                AppEvent::Key(key) => {
                    if key.kind != KeyEventKind::Press {
                        continue;
                    }

                    // Global shortcut: Ctrl+C
                    if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
                        if app.is_busy {
                            app.finish_assistant_turn();
                            app.add_system_message("Turn canceled by user (Ctrl+C).".to_string());
                        } else {
                            app.should_exit = true;
                            break;
                        }
                        continue;
                    }

                    // Global shortcut: Shift+Tab to cycle permission
                    if key.modifiers.contains(KeyModifiers::SHIFT) && key.code == KeyCode::BackTab
                        || key.code == KeyCode::BackTab
                    {
                        app.permission = app.permission.cycle();
                        continue;
                    }

                    // Global shortcut: Ctrl+R for Reverse History Search
                    if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('r') {
                        if app.mode == Mode::HistorySearch {
                            app.history_search.next_match();
                        } else {
                            app.mode = Mode::HistorySearch;
                            app.history_search = crate::shortcuts::history_search::HistorySearch::new(
                                app.composer.history().to_vec(),
                            );
                            app.history_search.start_search();
                        }
                        continue;
                    }

                    // Global shortcut: Ctrl+O / Ctrl+E for External Editor Bridge
                    if key.modifiers.contains(KeyModifiers::CONTROL)
                        && (key.code == KeyCode::Char('o') || key.code == KeyCode::Char('e'))
                    {
                        let _ = disable_raw_mode();
                        let _ = execute!(std::io::stdout(), LeaveAlternateScreen);

                        let bridge = EditorBridge::new();
                        if let Ok(edited) = bridge.open_editor(app.composer.text()) {
                            app.composer.set_text(&edited);
                        }

                        let _ = enable_raw_mode();
                        let _ = execute!(std::io::stdout(), EnterAlternateScreen, EnableMouseCapture);
                        let _ = terminal.clear();
                        continue;
                    }

                    // Global shortcut: Ctrl+V Clipboard Paste
                    if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('v') {
                        if let Ok(clip) = ClipboardManager::get_text() {
                            app.composer.insert_str(&clip);
                        }
                        continue;
                    }

                    // Modal specific handling
                    match app.mode {
                        Mode::CommandPalette => {
                            match key.code {
                                KeyCode::Esc => {
                                    app.mode = Mode::Normal;
                                }
                                KeyCode::Up => {
                                    app.palette_state.previous();
                                }
                                KeyCode::Down => {
                                    app.palette_state.next();
                                }
                                KeyCode::Enter | KeyCode::Tab => {
                                    if let Some(item) = app.palette_state.selected_item().cloned() {
                                        app.mode = Mode::Normal;
                                        if let Some(prompt) = item.prompt {
                                            app.composer.set_text(&prompt);
                                        } else {
                                            app.composer.set_text(&format!("/{} ", item.name));
                                        }
                                    }
                                }
                                KeyCode::Char(c) => {
                                    let mut q = app.palette_state.query.clone();
                                    q.push(c);
                                    app.palette_state.set_query(q);
                                }
                                KeyCode::Backspace => {
                                    let mut q = app.palette_state.query.clone();
                                    q.pop();
                                    if q.is_empty() {
                                        app.mode = Mode::Normal;
                                    } else {
                                        app.palette_state.set_query(q);
                                    }
                                }
                                _ => {}
                            }
                        }
                        Mode::ModelPicker => {
                            match key.code {
                                KeyCode::Esc => {
                                    app.mode = Mode::Normal;
                                }
                                KeyCode::Up => {
                                    app.model_picker_state.previous();
                                }
                                KeyCode::Down => {
                                    app.model_picker_state.next();
                                }
                                KeyCode::Enter => {
                                    if let Some(selected) = app.model_picker_state.selected().cloned() {
                                        app.provider = selected.provider;
                                        app.model = selected.model_id;
                                        app.add_system_message(format!(
                                            "Switched active model to **{}/{}**",
                                            app.provider, app.model
                                        ));
                                    }
                                    app.mode = Mode::Normal;
                                }
                                _ => {}
                            }
                        }
                        Mode::DiffReview => {
                            match key.code {
                                KeyCode::Esc | KeyCode::Char('q') => {
                                    app.mode = Mode::Normal;
                                }
                                KeyCode::Char('n') | KeyCode::Down => {
                                    app.diff_viewer_state.next_file();
                                }
                                KeyCode::Char('p') | KeyCode::Up => {
                                    app.diff_viewer_state.previous_file();
                                }
                                KeyCode::Char('a') => {
                                    app.diff_viewer_state.accept_current();
                                    app.diff_viewer_state.next_file();
                                }
                                KeyCode::Char('r') => {
                                    app.diff_viewer_state.reject_current();
                                    app.diff_viewer_state.next_file();
                                }
                                KeyCode::Char('A') => {
                                    app.diff_viewer_state.accept_all();
                                    app.mode = Mode::Normal;
                                }
                                _ => {}
                            }
                        }
                        Mode::HistorySearch => {
                            match key.code {
                                KeyCode::Esc => {
                                    app.mode = Mode::Normal;
                                    app.history_search.cancel_search();
                                }
                                KeyCode::Enter => {
                                    if let Some(m) = app.history_search.current_match() {
                                        app.composer.set_text(m);
                                    }
                                    app.mode = Mode::Normal;
                                    app.history_search.cancel_search();
                                }
                                KeyCode::Char(c) => {
                                    app.history_search.append_char(c);
                                }
                                KeyCode::Backspace => {
                                    app.history_search.pop_char();
                                }
                                _ => {}
                            }
                        }
                        Mode::Normal => {
                            match key.code {
                                KeyCode::Char('/') if app.composer.is_empty() => {
                                    app.composer.insert_char('/');
                                    app.mode = Mode::CommandPalette;
                                    app.palette_state = crate::tui::palette::CommandPaletteState::new(&app.skills);
                                    app.palette_state.set_query("/".to_string());
                                }
                                KeyCode::Char(c) => {
                                    app.composer.insert_char(c);
                                }
                                KeyCode::Backspace => {
                                    app.composer.backspace();
                                }
                                KeyCode::Delete => {
                                    app.composer.delete();
                                }
                                KeyCode::Left => {
                                    app.composer.move_left();
                                }
                                KeyCode::Right => {
                                    app.composer.move_right();
                                }
                                KeyCode::Home => {
                                    app.composer.move_home();
                                }
                                KeyCode::End => {
                                    app.composer.move_end();
                                }
                                KeyCode::Up => {
                                    app.composer.history_up();
                                }
                                KeyCode::Down => {
                                    app.composer.history_down();
                                }
                                KeyCode::PageUp => {
                                    app.auto_scroll = false;
                                    app.scroll_offset = app.scroll_offset.saturating_sub(10);
                                }
                                KeyCode::PageDown => {
                                    app.auto_scroll = false;
                                    app.scroll_offset = app.scroll_offset.saturating_add(10);
                                }
                                KeyCode::Tab => {
                                    // If user presses Tab while typing, trigger command palette if starting with /
                                    if app.composer.is_slash_command() {
                                        app.mode = Mode::CommandPalette;
                                        app.palette_state.set_query(app.composer.text().to_string());
                                    }
                                }
                                KeyCode::Enter => {
                                    let raw_input = app.composer.submit();
                                    if raw_input.is_empty() {
                                        continue;
                                    }

                                    // Check if slash command
                                    if raw_input.starts_with('/') {
                                        let mut ctx = CommandContext {
                                            active_provider: app.provider.clone(),
                                            active_model: app.model.clone(),
                                            working_dir: app.workspace_root.clone(),
                                            permission_level: app.permission,
                                            session_id: app.session_id.clone(),
                                            message_count: app.messages.len(),
                                            diff_changes: Vec::new(),
                                        };

                                        if let Some(res) = app.router.dispatch(&raw_input, &mut ctx).await {
                                            if !res.message.is_empty() {
                                                app.add_system_message(res.message);
                                            }

                                            if let Some(action) = res.action {
                                                match action {
                                                    CommandAction::OpenModelPicker => {
                                                        app.mode = Mode::ModelPicker;
                                                    }
                                                    CommandAction::OpenDiffReview => {
                                                        app.mode = Mode::DiffReview;
                                                    }
                                                    CommandAction::ClearChat => {
                                                        app.messages.clear();
                                                    }
                                                    CommandAction::SwitchModel { provider, model } => {
                                                        app.provider = provider;
                                                        app.model = model;
                                                    }
                                                    CommandAction::SetPermission(perm) => {
                                                        app.permission = perm;
                                                    }
                                                    CommandAction::Exit => {
                                                        app.should_exit = true;
                                                        break;
                                                    }
                                                    CommandAction::RunPrompt(prompt) => {
                                                        app.add_user_message(prompt.clone());
                                                        app.start_assistant_turn();

                                                        let engine = Arc::clone(&app.engine);
                                                        let model_config = app.build_model_config();
                                                        let tx = events.tx.clone();

                                                        tokio::spawn(async move {
                                                            match engine.run_loop(&model_config, "", &prompt).await {
                                                                Ok(mut rx) => {
                                                                    while let Some(evt) = rx.recv().await {
                                                                        let _ = tx.send(AppEvent::Agent(evt)).await;
                                                                    }
                                                                }
                                                                Err(err) => {
                                                                    let _ = tx.send(AppEvent::Agent(superagent_core_v2::types::AgentEvent::Error {
                                                                        message: err.to_string(),
                                                                    })).await;
                                                                }
                                                            }
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                        continue;
                                    }

                                    // Normal User prompt
                                    let (clean_text, _attachments) = prepare_attachments(&raw_input);

                                    if app.provider.is_empty() || app.model.is_empty() {
                                        app.add_user_message(clean_text);
                                        app.add_system_message("⚠ No AI model is configured. Run `/model` to pick a model or connect a provider first (e.g. `/model set ollama/qwen2.5-coder` or `/model set groq/llama-3.3-70b-versatile`).".to_string());
                                        continue;
                                    }

                                    if app.is_busy {
                                        app.turn_queue.enqueue(clean_text);
                                        continue;
                                    }

                                    app.add_user_message(clean_text.clone());
                                    app.start_assistant_turn();

                                    let engine = Arc::clone(&app.engine);
                                    let model_config = app.build_model_config();
                                    let tx = events.tx.clone();

                                    tokio::spawn(async move {
                                        match engine.run_loop(&model_config, "", &clean_text).await {
                                            Ok(mut rx) => {
                                                while let Some(evt) = rx.recv().await {
                                                    let _ = tx.send(AppEvent::Agent(evt)).await;
                                                }
                                            }
                                            Err(err) => {
                                                let _ = tx.send(AppEvent::Agent(superagent_core_v2::types::AgentEvent::Error {
                                                    message: err.to_string(),
                                                })).await;
                                            }
                                        }
                                    });
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }

    // Teardown terminal
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen, DisableMouseCapture)?;
    terminal.show_cursor()?;

    println!(
        "\nResume this session with:\nsuperagent --resume {}\n",
        app.session_id
    );

    Ok(())
}
