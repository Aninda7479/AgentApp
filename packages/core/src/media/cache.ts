import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

export interface ImageMetadata {
  id: string;
  filename: string;
  format: string;
  width: number;
  height: number;
  sizeBytes: number;
  prompt?: string;
  provider?: string;
  createdAt: number;
}

export interface CacheOptions {
  cacheDir: string;
}

export class ImageAssetCache {
  private cacheDir: string;

  constructor(options: CacheOptions) {
    this.cacheDir = options.cacheDir;
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  async cacheAsset(
    id: string,
    data: Buffer,
    metaPartial: Partial<ImageMetadata> = {}
  ): Promise<{ filePath: string; metadata: ImageMetadata }> {
    let format = metaPartial.format || 'png';
    let width = metaPartial.width || 0;
    let height = metaPartial.height || 0;

    if (!width || !height || !format) {
      try {
        const parsed = await sharp(data).metadata();
        format = parsed.format || format;
        width = parsed.width || width;
        height = parsed.height || height;
      } catch {
        // Fallback defaults if sharp fails to parse
        width = width || 1024;
        height = height || 1024;
      }
    }

    const filename = `${id}.${format}`;
    const filePath = path.join(this.cacheDir, filename);
    const metaPath = path.join(this.cacheDir, `${id}.meta.json`);

    await fs.promises.writeFile(filePath, data);

    const metadata: ImageMetadata = {
      id,
      filename,
      format,
      width,
      height,
      sizeBytes: data.length,
      prompt: metaPartial.prompt,
      provider: metaPartial.provider,
      createdAt: metaPartial.createdAt || Date.now()
    };

    await fs.promises.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

    return { filePath, metadata };
  }

  async getAsset(id: string): Promise<{ buffer: Buffer; metadata: ImageMetadata } | null> {
    const meta = await this.getMetadata(id);
    if (!meta) {
      return null;
    }
    const filePath = path.join(this.cacheDir, meta.filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const buffer = await fs.promises.readFile(filePath);
    return { buffer, metadata: meta };
  }

  async getMetadata(id: string): Promise<ImageMetadata | null> {
    const metaPath = path.join(this.cacheDir, `${id}.meta.json`);
    if (!fs.existsSync(metaPath)) {
      return null;
    }
    try {
      const content = await fs.promises.readFile(metaPath, 'utf8');
      return JSON.parse(content) as ImageMetadata;
    } catch {
      return null;
    }
  }

  async listAssets(): Promise<ImageMetadata[]> {
    if (!fs.existsSync(this.cacheDir)) {
      return [];
    }
    const files = await fs.promises.readdir(this.cacheDir);
    const metaFiles = files.filter(f => f.endsWith('.meta.json'));
    const results: ImageMetadata[] = [];

    for (const metaFile of metaFiles) {
      try {
        const content = await fs.promises.readFile(path.join(this.cacheDir, metaFile), 'utf8');
        results.push(JSON.parse(content) as ImageMetadata);
      } catch {
        // Ignore malformed meta files
      }
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  async clearCache(): Promise<void> {
    if (!fs.existsSync(this.cacheDir)) {
      return;
    }
    const files = await fs.promises.readdir(this.cacheDir);
    for (const file of files) {
      await fs.promises.unlink(path.join(this.cacheDir, file));
    }
  }
}
