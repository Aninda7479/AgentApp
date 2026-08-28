use superagent_cli::attachments::{format_bytes, sniff_image_type, strip_wrapping_quotes};
use superagent_cli::commands::{CommandAction, CommandContext, SlashCommandRouter};
use superagent_cli::session::{generate_session_id, load_session, save_session, SavedMessage};
use superagent_cli::shortcuts::history_search::HistorySearch;
use superagent_cli::shortcuts::permissions::PermissionLevel;
use superagent_cli::shortcuts::queue::TurnQueueManager;
use superagent_cli::skills::get_builtin_skills;
use superagent_cli::tui::composer::Composer;
use superagent_cli::tui::diff_viewer::DiffViewerState;
use superagent_cli::tui::markdown::{parse_markdown, MarkdownToken};
use std::path::PathBuf;

#[test]
fn test_markdown_parser() {
    let md = "# Title\n\n- item 1\n- item 2\n\n```rust\nfn main() {}\n```\nPlain text";
    let tokens = parse_markdown(md);

    assert!(tokens.iter().any(|t| matches!(t, MarkdownToken::Header { level: 1, text } if text == "Title")));
    assert!(tokens.iter().any(|t| matches!(t, MarkdownToken::Bullet { text } if text == "item 1")));
    assert!(tokens.iter().any(|t| matches!(t, MarkdownToken::CodeBlock { language, lines } if language == "rust" && lines[0] == "fn main() {}")));
    assert!(tokens.iter().any(|t| matches!(t, MarkdownToken::Text { text } if text == "Plain text")));
}

#[test]
fn test_history_fuzzy_search() {
    assert!(HistorySearch::fuzzy_match("mod", "model set openai/gpt-4o", false));
    assert!(HistorySearch::fuzzy_match("diff", "/diff review", false));
    assert!(!HistorySearch::fuzzy_match("xyz", "hello world", false));

    let mut search = HistorySearch::new(vec![
        "superagent --status".to_string(),
        "git status".to_string(),
        "cargo test".to_string(),
    ]);

    search.start_search();
    search.set_query("stat".to_string());
    assert_eq!(search.matched_count(), 2);
    assert_eq!(search.current_match(), Some("git status"));
    assert_eq!(search.next_match(), Some("superagent --status"));
}

#[test]
fn test_composer_editing_and_history() {
    let mut composer = Composer::new();
    assert!(composer.is_empty());

    composer.insert_str("hello");
    assert_eq!(composer.text(), "hello");
    assert_eq!(composer.cursor_pos(), 5);

    composer.backspace();
    assert_eq!(composer.text(), "hell");

    let submitted = composer.submit();
    assert_eq!(submitted, "hell");
    assert!(composer.is_empty());

    composer.history_up();
    assert_eq!(composer.text(), "hell");
}

#[test]
fn test_turn_queue() {
    let mut queue = TurnQueueManager::new();
    assert!(queue.is_empty());

    queue.enqueue("First prompt".to_string());
    queue.enqueue("Second prompt".to_string());
    assert_eq!(queue.len(), 2);

    assert_eq!(queue.dequeue(), Some("First prompt".to_string()));
    assert_eq!(queue.dequeue(), Some("Second prompt".to_string()));
    assert!(queue.is_empty());
}

#[test]
fn test_slash_command_router() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let router = SlashCommandRouter::new();
        let mut ctx = CommandContext {
            active_provider: "openai".to_string(),
            active_model: "gpt-4o".to_string(),
            working_dir: PathBuf::from("."),
            permission_level: PermissionLevel::Auto,
            session_id: "test-session".to_string(),
            message_count: 0,
            diff_changes: Vec::new(),
        };

        let res = router.dispatch("/help", &mut ctx).await;
        assert!(res.is_some());
        assert!(res.unwrap().message.contains("SuperAgent Terminal Commands"));

        let res = router.dispatch("/permissions deny", &mut ctx).await;
        assert!(res.is_some());
        let r = res.unwrap();
        assert!(matches!(r.action, Some(CommandAction::SetPermission(PermissionLevel::Deny))));
        assert_eq!(ctx.permission_level, PermissionLevel::Deny);

        let res = router.dispatch("/model set claude-3-5-sonnet-20241022", &mut ctx).await;
        assert!(res.is_some());
        assert!(matches!(res.unwrap().action, Some(CommandAction::SwitchModel { .. })));
    });
}

#[test]
fn test_attachments_and_helpers() {
    assert_eq!(strip_wrapping_quotes("\"path/to/image.png\""), "path/to/image.png");
    assert_eq!(strip_wrapping_quotes("'path/to/image.png'"), "path/to/image.png");
    assert_eq!(strip_wrapping_quotes("plain_text"), "plain_text");

    let png_header = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    assert_eq!(sniff_image_type(&png_header), Some("image/png"));

    let jpeg_header = [0xFF, 0xD8, 0xFF, 0xE0];
    assert_eq!(sniff_image_type(&jpeg_header), Some("image/jpeg"));

    assert_eq!(format_bytes(500), "500 B");
    assert_eq!(format_bytes(2048), "2.0 KB");
    assert_eq!(format_bytes(5 * 1024 * 1024), "5.0 MB");
}

#[test]
fn test_builtin_skills() {
    let builtins = get_builtin_skills();
    assert!(!builtins.is_empty());
    assert!(builtins.iter().any(|s| s.id == "explain"));
    assert!(builtins.iter().any(|s| s.id == "write-tests"));
    assert!(builtins.iter().any(|s| s.id == "refactor"));
}

#[test]
fn test_session_id_and_storage() {
    let sid = generate_session_id();
    assert_eq!(sid.len(), 19); // XXXX-XXXX-XXXX-XXXX
    assert_eq!(sid.chars().filter(|c| *c == '-').count(), 3);

    let test_id = format!("test-{}", sid);
    let messages = vec![
        SavedMessage {
            role: "user".to_string(),
            content: "Hello world".to_string(),
        },
        SavedMessage {
            role: "assistant".to_string(),
            content: "Hi there!".to_string(),
        },
    ];

    save_session(&test_id, "Hello world", &messages);
    let loaded = load_session(&test_id);
    assert!(loaded.is_some());
    let loaded_msgs = loaded.unwrap();
    assert_eq!(loaded_msgs.len(), 2);
    assert_eq!(loaded_msgs[0].content, "Hello world");
    assert_eq!(loaded_msgs[1].content, "Hi there!");
}

#[test]
fn test_diff_generation() {
    let original = "fn hello() {\n    println!(\"old\");\n}\n";
    let modified = "fn hello() {\n    println!(\"new\");\n}\n";

    let diff_lines = DiffViewerState::generate_diff_lines(original, modified);
    assert!(!diff_lines.is_empty());
    assert!(diff_lines.iter().any(|l| l.tag == similar::ChangeTag::Delete && l.content.contains("old")));
    assert!(diff_lines.iter().any(|l| l.tag == similar::ChangeTag::Insert && l.content.contains("new")));
}

#[test]
fn test_password_cli_parsing() {
    use clap::Parser;
    use superagent_cli::cli::args::{Cli, Commands, PasswordAction};

    // 1. superagent password set
    let cli = Cli::try_parse_from(["superagent", "password", "set"]).unwrap();
    match cli.command {
        Some(Commands::Password { action: Some(PasswordAction::Set { password }) }) => {
            assert_eq!(password, None);
        }
        other => panic!("Expected Password Set, got {:?}", other),
    }

    // 2. superagent password set mysecret123
    let cli = Cli::try_parse_from(["superagent", "password", "set", "mysecret123"]).unwrap();
    match cli.command {
        Some(Commands::Password { action: Some(PasswordAction::Set { password }) }) => {
            assert_eq!(password, Some("mysecret123".to_string()));
        }
        other => panic!("Expected Password Set with secret, got {:?}", other),
    }

    // 3. superagent password status
    let cli = Cli::try_parse_from(["superagent", "password", "status"]).unwrap();
    match cli.command {
        Some(Commands::Password { action: Some(PasswordAction::Status) }) => {}
        other => panic!("Expected Password Status, got {:?}", other),
    }

    // 4. superagent password (no subcommand)
    let cli = Cli::try_parse_from(["superagent", "password"]).unwrap();
    match cli.command {
        Some(Commands::Password { action: None }) => {}
        other => panic!("Expected Password with None action, got {:?}", other),
    }

    // 5. superagent password reset
    let cli = Cli::try_parse_from(["superagent", "password", "reset"]).unwrap();
    match cli.command {
        Some(Commands::Password { action: Some(PasswordAction::Reset) }) => {}
        other => panic!("Expected Password Reset, got {:?}", other),
    }
}
