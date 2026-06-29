import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';
import { KeyInput } from '../types.js';

export interface EditorBridgeOptions {
  editorCommand?: string;
  tempDir?: string;
  extension?: string;
}

export class EditorBridge {
  private editorCommand: string;
  private tempDir: string;
  private extension: string;
  constructor(options: EditorBridgeOptions = {}) {
    this.editorCommand =
      options.editorCommand ||
      process.env.VISUAL ||
      process.env.EDITOR ||
      (process.platform === 'win32' ? 'notepad.exe' : 'vim');
    this.tempDir = options.tempDir || os.tmpdir();
    this.extension = options.extension || '.tmp';
  }

  public getEditorCommand(): string {
    return this.editorCommand;
  }

  public createTempFile(initialContent: string = ''): string {
    const filename = `superagent_prompt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${this.extension}`;
    const filePath = path.join(this.tempDir, filename);
    fs.writeFileSync(filePath, initialContent, 'utf-8');
    return filePath;
  }

  public openSync(initialContent: string = ''): string {
    const filePath = this.createTempFile(initialContent);
    try {
      const parts = this.editorCommand.split(' ');
      const cmd = parts[0];
      const args = [...parts.slice(1), filePath];

      const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
      if (result.error) {
        throw result.error;
      }
      return fs.readFileSync(filePath, 'utf-8');
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  public async openAsync(initialContent: string = ''): Promise<string> {
    const filePath = this.createTempFile(initialContent);
    return new Promise((resolve, reject) => {
      const parts = this.editorCommand.split(' ');
      const cmd = parts[0];
      const args = [...parts.slice(1), filePath];

      const child = spawn(cmd, args, { stdio: 'inherit', shell: true });

      child.on('error', (err) => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        reject(err);
      });

      child.on('exit', () => {
        try {
          const updatedContent = fs.readFileSync(filePath, 'utf-8');
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          resolve(updatedContent);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  public static isEditorShortcut(key: KeyInput): boolean {
    if (key.ctrl && key.name === 'g') return true;
    if (key.ctrl && key.name === 'e') return true;
    if (key.sequence === '\x07') return true; // Ctrl+G in ascii
    return false;
  }
}
