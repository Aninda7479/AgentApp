import * as fs from 'fs';
import * as path from 'path';

export interface ExportOptions {
  targetDir: string;
  overwrite?: boolean;
  customFilename?: string;
  createSubdirs?: boolean;
}

export interface ExportResult {
  assetId: string;
  sourcePath?: string;
  targetPath: string;
  bytesExported: number;
  mediaType: string;
  exportedAt: number;
}

export interface ExportBatchItem {
  assetId: string;
  sourcePath?: string;
  buffer?: Buffer;
  filename?: string;
  mediaType: string;
}

export class MediaExporter {
  /**
   * Export a media asset from an existing file on disk to the target project directory.
   */
  async exportAssetFromFile(
    assetId: string,
    sourcePath: string,
    mediaType: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file does not exist: ${sourcePath}`);
    }

    const stats = await fs.promises.stat(sourcePath);
    if (!stats.isFile()) {
      throw new Error(`Source path is not a file: ${sourcePath}`);
    }

    const filename = options.customFilename || path.basename(sourcePath);
    const targetPath = this.resolveTargetPath(options.targetDir, mediaType, filename, options.createSubdirs);

    await this.ensureDirectoryAndWrite(targetPath, options.overwrite || false, async (dest) => {
      await fs.promises.copyFile(sourcePath, dest);
    });

    return {
      assetId,
      sourcePath,
      targetPath,
      bytesExported: stats.size,
      mediaType,
      exportedAt: Date.now()
    };
  }

  /**
   * Export a media asset from an in-memory Buffer to the target project directory.
   */
  async exportAssetFromBuffer(
    assetId: string,
    buffer: Buffer,
    filename: string,
    mediaType: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    const finalFilename = options.customFilename || filename;
    const targetPath = this.resolveTargetPath(options.targetDir, mediaType, finalFilename, options.createSubdirs);

    await this.ensureDirectoryAndWrite(targetPath, options.overwrite || false, async (dest) => {
      await fs.promises.writeFile(dest, buffer);
    });

    return {
      assetId,
      targetPath,
      bytesExported: buffer.length,
      mediaType,
      exportedAt: Date.now()
    };
  }

  /**
   * Batch export multiple media assets at once.
   */
  async exportBatch(
    items: ExportBatchItem[],
    options: ExportOptions
  ): Promise<ExportResult[]> {
    const results: ExportResult[] = [];
    for (const item of items) {
      if (item.sourcePath) {
        const res = await this.exportAssetFromFile(item.assetId, item.sourcePath, item.mediaType, options);
        results.push(res);
      } else if (item.buffer && item.filename) {
        const res = await this.exportAssetFromBuffer(item.assetId, item.buffer, item.filename, item.mediaType, options);
        results.push(res);
      } else {
        throw new Error(`Batch item ${item.assetId} must provide either sourcePath or both buffer and filename.`);
      }
    }
    return results;
  }

  private resolveTargetPath(targetDir: string, mediaType: string, filename: string, createSubdirs?: boolean): string {
    const baseDir = createSubdirs ? path.join(targetDir, mediaType) : targetDir;
    const resolved = path.resolve(baseDir, filename);
    const resolvedBase = path.resolve(baseDir);
    if (!resolved.startsWith(resolvedBase)) {
      throw new Error(`Invalid target path trajectory detected for file: ${filename}`);
    }
    return resolved;
  }

  private async ensureDirectoryAndWrite(
    targetPath: string,
    overwrite: boolean,
    writeFn: (dest: string) => Promise<void>
  ): Promise<void> {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    if (fs.existsSync(targetPath) && !overwrite) {
      throw new Error(`Target file already exists and overwrite is set to false: ${targetPath}`);
    }

    await writeFn(targetPath);
  }
}
