import * as fs from 'fs';
import * as path from 'path';

/** Information about a file or directory obtained via inspection. */
export interface FileInspectResult {
  path: string;
  exists: boolean;
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  isBinary: boolean;
  mimeType?: string;
  totalLines?: number;
}

/** Options for reading a file range. */
export interface ReadFileOptions {
  startLine?: number;
  endLine?: number;
  encoding?: BufferEncoding;
}

/** Result of reading a range of lines from a file. */
export interface ReadFileResult {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  isBinary: boolean;
}

/** Inspects files and directories: stats, binary detection, and range reading. */
export class FileSystemInspector {
  public isBinaryBuffer(buffer: Buffer): boolean {
    const checkLength = Math.min(buffer.length, 4096);
    if (checkLength === 0) return false;
    let nonPrintable = 0;
    for (let i = 0; i < checkLength; i++) {
      const byte = buffer[i];
      if (byte === 0) return true;
      if ((byte < 7 || (byte > 14 && byte < 32)) && byte !== 27) {
        nonPrintable++;
      }
    }
    return nonPrintable / checkLength > 0.3;
  }

  public async inspect(filePath: string): Promise<FileInspectResult> {
    const absolutePath = path.resolve(filePath);
    try {
      const stats = await fs.promises.stat(absolutePath);
      if (stats.isDirectory()) {
        return {
          path: absolutePath,
          exists: true,
          isFile: false,
          isDirectory: true,
          size: stats.size,
          isBinary: false
        };
      }

      const fd = await fs.promises.open(absolutePath, 'r');
      const buffer = Buffer.alloc(4096);
      const { bytesRead } = await fd.read(buffer, 0, 4096, 0);
      await fd.close();

      const isBinary = this.isBinaryBuffer(buffer.subarray(0, bytesRead));
      let totalLines = 0;

      if (!isBinary) {
        const content = await fs.promises.readFile(absolutePath, 'utf8');
        totalLines = content === '' ? 0 : content.split(/\r?\n/).length;
      }

      return {
        path: absolutePath,
        exists: true,
        isFile: true,
        isDirectory: false,
        size: stats.size,
        isBinary,
        totalLines
      };
    } catch {
      return {
        path: absolutePath,
        exists: false,
        isFile: false,
        isDirectory: false,
        size: 0,
        isBinary: false
      };
    }
  }

  public async readFile(filePath: string, options: ReadFileOptions = {}): Promise<ReadFileResult> {
    const inspectResult = await this.inspect(filePath);
    if (!inspectResult.exists || !inspectResult.isFile) {
      throw new Error(`File does not exist or is not a file: ${filePath}`);
    }
    if (inspectResult.isBinary) {
      return {
        content: '[Binary File]',
        startLine: 0,
        endLine: 0,
        totalLines: 0,
        isBinary: true
      };
    }

    const fullContent = await fs.promises.readFile(filePath, options.encoding ?? 'utf8');
    const lines = fullContent === '' ? [] : fullContent.split(/\r?\n/);
    const totalLines = lines.length;

    const startLine = Math.max(1, options.startLine ?? 1);
    const endLine = Math.min(totalLines, options.endLine ?? totalLines);

    if (startLine > totalLines || startLine > endLine) {
      return {
        content: '',
        startLine,
        endLine,
        totalLines,
        isBinary: false
      };
    }

    const selectedLines = lines.slice(startLine - 1, endLine);
    return {
      content: selectedLines.join('\n'),
      startLine,
      endLine,
      totalLines,
      isBinary: false
    };
  }
}
