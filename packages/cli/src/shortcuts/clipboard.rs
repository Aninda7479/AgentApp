use anyhow::Result;

pub struct ClipboardManager;

impl ClipboardManager {
    /// Reads current plain text from the system clipboard.
    pub fn get_text() -> Result<String> {
        let mut clipboard = arboard::Clipboard::new()?;
        let text = clipboard.get_text()?;
        Ok(text)
    }

    /// Sets the system clipboard contents to the provided text string.
    pub fn set_text(text: &str) -> Result<()> {
        let mut clipboard = arboard::Clipboard::new()?;
        clipboard.set_text(text.to_string())?;
        Ok(())
    }
}
