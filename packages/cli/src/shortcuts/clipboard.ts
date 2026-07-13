import { execSync } from 'child_process';

/** Interface for platform clipboard copy operations. */
export interface ClipboardAdapter {
  copy(text: string): Promise<boolean>;
  copySync(text: string): boolean;
}

/** Copies text to the system clipboard using platform-native commands. */
export class SystemClipboard implements ClipboardAdapter {
  /** Copies text to clipboard synchronously using clip/pbcopy/wl-copy/xclip. */
  public copySync(text: string): boolean {
    const platform = process.platform;
    try {
      if (platform === 'win32') {
        execSync('clip', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
        return true;
      } else if (platform === 'darwin') {
        // macOS
        execSync('pbcopy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
        return true;
      } else {
        // Linux: try Wayland first, fall back to X11
        try {
          execSync('wl-copy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
          return true;
        } catch {
          execSync('xclip -selection clipboard', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
          return true;
        }
      }
    } catch {
      return false;
    }
  }

  /** Async wrapper around copySync. */
  public async copy(text: string): Promise<boolean> {
    return this.copySync(text);
  }
}

/** In-memory clipboard for testing that stores the last copied text. */
export class MockClipboard implements ClipboardAdapter {
  /** The most recently copied text string. */
  public lastCopied: string = '';

  /** Stores the text and returns true. */
  public copySync(text: string): boolean {
    this.lastCopied = text;
    return true;
  }

  public async copy(text: string): Promise<boolean> {
    return this.copySync(text);
  }
}

/** Extracts code blocks from markdown and copies them to the clipboard. */
export class ClipboardCopier {
  private lastOutput: string = '';
  private codeBlocks: string[] = [];
  private adapter: ClipboardAdapter;

  /** Creates a ClipboardCopier with an optional custom adapter. */
  constructor(adapter?: ClipboardAdapter) {
    this.adapter = adapter || new SystemClipboard();
  }

  /** Stores the last assistant output and extracts code blocks from it. */
  public setLastOutput(output: string): void {
    this.lastOutput = output;
    this.codeBlocks = this.extractCodeBlocks(output);
  }

  /** Returns the most recently stored output. */
  public getLastOutput(): string {
    return this.lastOutput;
  }

  /** Returns extracted code blocks from the last output. */
  public getCodeBlocks(): string[] {
    return [...this.codeBlocks];
  }

  /** Extracts fenced code blocks from markdown content. */
  public extractCodeBlocks(markdown: string): string[] {
    const blocks: string[] = [];
    const regex = /```(?:\w+)?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(markdown)) !== null) {
      if (match[1]) {
        blocks.push(match[1].trim());
      }
    }
    return blocks;
  }

  /** Copies the full last output to the clipboard synchronously. */
  public copyLastOutput(): boolean {
    if (!this.lastOutput) return false;
    return this.adapter.copySync(this.lastOutput);
  }

  /** Copies a specific extracted code block by index to the clipboard. */
  public copyCodeBlock(index: number = 0): boolean {
    if (index < 0 || index >= this.codeBlocks.length) return false;
    const block = this.codeBlocks[index];
    return this.adapter.copySync(block);
  }

  /** Copies the last output to the clipboard asynchronously. */
  public async copyLastOutputAsync(): Promise<boolean> {
    if (!this.lastOutput) return false;
    return this.adapter.copy(this.lastOutput);
  }
}
