import { app, globalShortcut, BrowserWindow, clipboard } from 'electron';
import { exec } from 'child_process';
import { SettingsStorage } from '@superagent/core';

class VoiceDaemon {
  private isRecording = false;
  private currentShortcut = 'CommandOrControl+Super'; // Default: Ctrl+Win

  public init(): void {
    if (this.isEnabled()) {
      this.registerShortcut();
    }
  }

  public setShortcut(newShortcut: string): void {
    this.unregisterShortcut();
    this.currentShortcut = newShortcut;
    if (this.isEnabled()) {
      this.registerShortcut();
    }
  }

  public enable(): void {
    this.registerShortcut();
  }

  public disable(): void {
    this.unregisterShortcut();
  }

  private isEnabled(): boolean {
    try {
      const settings = SettingsStorage.loadSettings();
      return !!settings.voice?.typingEnabled;
    } catch {
      return false;
    }
  }

  private registerShortcut(): void {
    try {
      const settings = SettingsStorage.loadSettings();
      const shortcut = settings.voice?.typingShortcut || this.currentShortcut;
      
      globalShortcut.register(shortcut, () => {
        this.handleToggle();
      });
    } catch (err) {
      console.error('[voice-daemon] Failed to register global shortcut:', err);
    }
  }

  private unregisterShortcut(): void {
    try {
      const settings = SettingsStorage.loadSettings();
      const shortcut = settings.voice?.typingShortcut || this.currentShortcut;
      globalShortcut.unregister(shortcut);
    } catch {}
  }

  private handleToggle(): void {
    const mw = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents);
    if (!mw) return;

    if (!this.isRecording) {
      // Start recording
      this.isRecording = true;
      mw.webContents.send('voice-daemon-event', { state: 'recording' });
    } else {
      // Stop recording
      this.isRecording = false;
      mw.webContents.send('voice-daemon-event', { state: 'transcribing' });
    }
  }

  public dispose(): void {
    this.unregisterShortcut();
  }

  // Cross-platform keyboard simulator
  public simulateKeyboardTyping(text: string): void {
    const platform = process.platform;
    if (platform === 'win32') {
      // Escape special characters for SendKeys: { } [ ] ( ) + ^ % ~
      const escaped = text.replace(/([%^+~{}()\[\]])/g, '{$1}');
      const psCommand = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("${escaped.replace(/"/g, '`"')}")`;
      exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, (err) => {
        if (err) console.error('[voice-daemon] Failed typing via PowerShell:', err);
      });
    } else if (platform === 'darwin') {
      const escaped = text.replace(/["\\]/g, '\\$&');
      const appleScript = `tell application "System Events" to keystroke "${escaped}"`;
      exec(`osascript -e '${appleScript}'`, (err) => {
        if (err) console.error('[voice-daemon] Failed typing via AppleScript:', err);
      });
    } else {
      const escaped = text.replace(/["\\]/g, '\\$&');
      exec(`xdotool type "${escaped}"`, (err) => {
        if (err) {
          console.warn('[voice-daemon] xdotool not found, fallback to clipboard paste');
        }
      });
    }
  }

  // Handle transcribed text injection
  public injectText(text: string): void {
    try {
      const settings = SettingsStorage.loadSettings();
      const target = settings.voice?.typingTarget || 'both'; // 'both' | 'composer' | 'system'

      // Send to composer if needed
      const mw = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents);
      if (mw && (target === 'both' || target === 'composer')) {
        mw.webContents.send('voice-daemon-inject', text);
      }

      // Send to system typing if needed
      if (target === 'both' || target === 'system') {
        // Save current clipboard contents
        const originalText = clipboard.readText();
        clipboard.writeText(text);

        // Simulate Paste command (Ctrl+V or Cmd+V) to inject text instantly
        const platform = process.platform;
        if (platform === 'win32') {
          // Paste shortcut
          exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`);
        } else if (platform === 'darwin') {
          exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
        } else {
          exec(`xdotool key ctrl+v`);
        }

        // Restore clipboard after short delay
        setTimeout(() => {
          clipboard.writeText(originalText);
        }, 500);
      }
    } catch (err) {
      console.error('[voice-daemon] Injection failed:', err);
    }
  }
}

export const voiceDaemon = new VoiceDaemon();
