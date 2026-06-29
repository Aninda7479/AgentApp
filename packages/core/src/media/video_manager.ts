import * as fs from 'fs';
import * as path from 'path';

export interface VideoMetadata {
  id: string;
  filename: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  sizeBytes: number;
  createdAt: number;
  prompt?: string;
  provider?: string;
}

export interface VideoAssetManagerOptions {
  storageDir: string;
}

export class VideoAssetManager {
  private storageDir: string;

  constructor(options: VideoAssetManagerOptions) {
    this.storageDir = options.storageDir;
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  async saveVideoAsset(
    id: string,
    data: Buffer,
    metaPartial: Partial<VideoMetadata> = {}
  ): Promise<{ filePath: string; metadata: VideoMetadata }> {
    const filename = `${id}.mp4`;
    const filePath = path.join(this.storageDir, filename);
    const metaPath = path.join(this.storageDir, `${id}.meta.json`);

    await fs.promises.writeFile(filePath, data);

    const metadata: VideoMetadata = {
      id,
      filename,
      durationSeconds: metaPartial.durationSeconds || 5.0,
      width: metaPartial.width || 1920,
      height: metaPartial.height || 1080,
      fps: metaPartial.fps || 30,
      codec: metaPartial.codec || 'h264',
      sizeBytes: data.length,
      createdAt: metaPartial.createdAt || Date.now(),
      prompt: metaPartial.prompt,
      provider: metaPartial.provider
    };

    await fs.promises.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

    return { filePath, metadata };
  }

  async getVideoAsset(id: string): Promise<{ buffer: Buffer; metadata: VideoMetadata } | null> {
    const meta = await this.getVideoMetadata(id);
    if (!meta) {
      return null;
    }
    const filePath = path.join(this.storageDir, meta.filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const buffer = await fs.promises.readFile(filePath);
    return { buffer, metadata: meta };
  }

  async getVideoMetadata(id: string): Promise<VideoMetadata | null> {
    const metaPath = path.join(this.storageDir, `${id}.meta.json`);
    if (!fs.existsSync(metaPath)) {
      return null;
    }
    try {
      const content = await fs.promises.readFile(metaPath, 'utf8');
      return JSON.parse(content) as VideoMetadata;
    } catch {
      return null;
    }
  }

  async generateStreamingPreview(
    id: string,
    options: { frameRate?: number; width?: number } = {}
  ): Promise<{ previewBuffer: Buffer; contentType: string }> {
    const meta = await this.getVideoMetadata(id);
    if (!meta) {
      throw new Error(`Video asset ${id} not found`);
    }

    const previewHeader = Buffer.from(`PREVIEW_HEADER_fps=${options.frameRate || 10}_width=${options.width || 320};`);
    const asset = await this.getVideoAsset(id);
    const bodyBuffer = asset ? asset.buffer.subarray(0, Math.min(1024, asset.buffer.length)) : Buffer.alloc(0);
    const previewBuffer = Buffer.concat([previewHeader, bodyBuffer]);

    return {
      previewBuffer,
      contentType: 'video/mp4'
    };
  }

  async listVideoAssets(): Promise<VideoMetadata[]> {
    if (!fs.existsSync(this.storageDir)) {
      return [];
    }
    const files = await fs.promises.readdir(this.storageDir);
    const metaFiles = files.filter(f => f.endsWith('.meta.json'));
    const results: VideoMetadata[] = [];

    for (const metaFile of metaFiles) {
      try {
        const content = await fs.promises.readFile(path.join(this.storageDir, metaFile), 'utf8');
        results.push(JSON.parse(content) as VideoMetadata);
      } catch {
        // Ignore malformed meta files
      }
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteVideoAsset(id: string): Promise<boolean> {
    const meta = await this.getVideoMetadata(id);
    if (!meta) {
      return false;
    }
    const filePath = path.join(this.storageDir, meta.filename);
    const metaPath = path.join(this.storageDir, `${id}.meta.json`);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    if (fs.existsSync(metaPath)) {
      await fs.promises.unlink(metaPath);
    }

    return true;
  }
}
