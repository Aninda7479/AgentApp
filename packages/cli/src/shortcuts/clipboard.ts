import { execSync } from 'child_process';

export interface ClipboardAdapter {
  copy(text: string): Promise<boolean>;
  copySync(text: string): boolean;
}

export class SystemClipboard implements ClipboardAdapter {
  public copySync(text: string): boolean {
    const platform = process.platform;
    try {
      if (platform === 'win32') {
        execSync('clip', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
        return true;
      } else if (platform === 'darwin') {
        execSync('pbcopy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
        return true;
      } else {
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

  public async copy(text: string): Promise<boolean> {
    return this.copySync(text);
  }
}

export class MockClipboard implements ClipboardAdapter {
  public lastCopied: string = '';

  public copySync(text: string): boolean {
    this.lastCopied = text;
    return true;
  }

  public async copy(text: string): Promise<boolean> {
    return this.copySync(text);
  }
}

export class ClipboardCopier {
  private lastOutput: string = '';
  private codeBlocks: string[] = [];
  private adapter: ClipboardAdapter;

  constructor(adapter?: ClipboardAdapter) {
    this.adapter = adapter || new SystemClipboard();
  }

  public setLastOutput(output: string): void {
    this.lastOutput = output;
    this.codeBlocks = this.extractCodeBlocks(output);
  }

  public getLastOutput(): string {
    return this.lastOutput;
  }

  public getCodeBlocks(): string[] {
    return [...this.codeBlocks];
  }

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

  public copyLastOutput(): boolean {
    if (!this.lastOutput) return false;
    return this.adapter.copySync(this.lastOutput);
  }

  public copyCodeBlock(index: number = 0): boolean {
    if (index < 0 || index >= this.codeBlocks.length) return false;
    const block = this.codeBlocks[index];
    return this.adapter.copySync(block);
  }

  public async copyLastOutputAsync(): Promise<boolean> {
    if (!this.lastOutput) return false;
    return this.adapter.copy(this.lastOutput);
  }
}
