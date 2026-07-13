import * as fs from 'fs';
import * as path from 'path';
import { PermissionModeController } from './permissions.js';

/** Options for atomic file write operations. */
export interface WriteFileOptions {
  backup?: boolean;
  validateSyntax?: (content: string, filePath: string) => boolean | Promise<boolean>;
}

/** A chunk-based replacement targeting specific lines in a file. */
export interface ReplacementChunk {
  startLine: number;
  endLine: number;
  targetContent: string;
  replacementContent: string;
}

/** Atomic file writer with permission gating, backup, and patch support. */
export class AtomicFileWriter {
  private permissionController: PermissionModeController;

  constructor(permissionController?: PermissionModeController) {
    this.permissionController = permissionController ?? new PermissionModeController({ initialMode: 'auto-approve-edits' });
  }

  public async writeFileAtomic(filePath: string, content: string, options: WriteFileOptions = {}): Promise<void> {
    if (!this.permissionController.canModifyFile()) {
      const approved = await this.permissionController.requestApproval({
        action: 'write_file',
        filePath
      });
      if (!approved) {
        throw new Error(`File write permission rejected for file: ${filePath}`);
      }
    }

    const absolutePath = path.resolve(filePath);
    const dir = path.dirname(absolutePath);
    await fs.promises.mkdir(dir, { recursive: true });

    const exists = fs.existsSync(absolutePath);
    const backupPath = `${absolutePath}.bak`;
    const tempPath = `${absolutePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;

    if (exists && options.backup) {
      await fs.promises.copyFile(absolutePath, backupPath);
    }

    try {
      await fs.promises.writeFile(tempPath, content, 'utf8');

      if (options.validateSyntax) {
        const isValid = await options.validateSyntax(content, absolutePath);
        if (!isValid) {
          throw new Error(`Syntax validation failed for file write: ${filePath}`);
        }
      }

      await fs.promises.rename(tempPath, absolutePath);
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath).catch(() => {});
      }
      if (exists && options.backup && fs.existsSync(backupPath)) {
        await fs.promises.copyFile(backupPath, absolutePath).catch(() => {});
      }
      throw err;
    } finally {
      if (options.backup && fs.existsSync(backupPath)) {
        await fs.promises.unlink(backupPath).catch(() => {});
      }
    }
  }

  public async applyPatch(filePath: string, chunks: ReplacementChunk[], options: WriteFileOptions = {}): Promise<string> {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File to patch does not exist: ${filePath}`);
    }

    const originalContent = await fs.promises.readFile(absolutePath, 'utf8');
    const lines = originalContent.split(/\r?\n/);

    const sortedChunks = [...chunks].sort((a, b) => b.startLine - a.startLine);

    let currentLines = [...lines];
    for (const chunk of sortedChunks) {
      const startIdx = chunk.startLine - 1;
      const endIdx = chunk.endLine;

      const targetLines = currentLines.slice(startIdx, endIdx);
      const actualTargetStr = targetLines.join('\n');

      const normalize = (str: string) => str.replace(/\r\n/g, '\n').trim();
      if (normalize(actualTargetStr) !== normalize(chunk.targetContent)) {
        throw new Error(`Patch mismatch at lines ${chunk.startLine}-${chunk.endLine} in ${filePath}. Target content does not match file lines.`);
      }

      const replacementLines = chunk.replacementContent.split(/\r?\n/);
      currentLines.splice(startIdx, endIdx - startIdx, ...replacementLines);
    }

    const newContent = currentLines.join('\n');
    await this.writeFileAtomic(filePath, newContent, options);
    return newContent;
  }
}
