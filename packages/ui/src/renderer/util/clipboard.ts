/**
 * Universal Clipboard Utility for SuperAgent Web & Desktop
 *
 * Ensures clipboard read/write works reliably across all environments:
 * - Desktop HTTPS / localhost (Async Clipboard API)
 * - Mobile web over HTTP (e.g. LAN / Tailscale IPs http://192.168.x.x, http://100.x.x.x)
 *   where `window.isSecureContext === false` and `navigator.clipboard === undefined`.
 * - Embedded webviews and Tauri desktop shell.
 */

/**
 * Copies plain text to the system clipboard.
 * Uses `navigator.clipboard.writeText` when available in secure contexts,
 * and falls back to a hidden `<textarea>` + `document.execCommand('copy')`
 * in insecure contexts (such as mobile browsers accessing LAN HTTP servers).
 *
 * @param text The text string to copy.
 * @returns Promise<boolean> resolving to true if copied successfully, false otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const content = typeof text === 'string' ? text : String(text ?? '');

  // 1. Try modern Async Clipboard API (Secure Contexts, localhost, HTTPS)
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {
      // Failed (e.g. permissions, window not focused, or restricted context).
      // Fall through to execCommand fallback.
    }
  }

  // 2. Fallback for insecure contexts (HTTP over LAN on mobile) or if writeText fails
  if (typeof document !== 'undefined' && document.body) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = content;

      // Prevent scrolling, zooming, or visual flashing
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.padding = '0';
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';
      textArea.style.opacity = '0';
      textArea.style.pointerEvents = 'none';
      textArea.style.fontSize = '16px'; // Prevent auto-zoom on iOS Safari

      // Keep focus on active element after copying
      const previouslyFocused = document.activeElement as HTMLElement | null;

      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, content.length);

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try {
          previouslyFocused.focus();
        } catch {
          // Ignore focus restoration failure
        }
      }

      return successful;
    } catch (err) {
      console.warn('[clipboard] execCommand fallback failed:', err);
      return false;
    }
  }

  return false;
}

/**
 * Safely reads plain text from the clipboard if available.
 * Returns null if the clipboard is unavailable or access is denied.
 */
export async function readClipboardText(): Promise<string | null> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.readText === 'function'
  ) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }
  return null;
}
