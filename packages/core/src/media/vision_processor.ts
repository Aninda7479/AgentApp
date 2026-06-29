import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

export interface VisionInputOptions {
  path?: string;
  buffer?: Buffer;
  mimeType?: string;
  detail?: 'low' | 'high' | 'auto';
}

export interface VisionInputAttachment {
  id: string;
  dataUrl: string;
  mimeType: string;
  detail: 'low' | 'high' | 'auto';
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface FormattedVisionMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: string;
  };
}

export interface FormattedVisionMessage {
  role: 'user' | 'system' | 'assistant';
  content: FormattedVisionMessageContent[];
}

export class VisionInputProcessor {
  /**
   * Process an image file or buffer and convert it into a standardized VisionInputAttachment.
   */
  async prepareAttachment(options: VisionInputOptions): Promise<VisionInputAttachment> {
    let buffer: Buffer;
    let mimeType = options.mimeType;

    if (options.path) {
      if (!fs.existsSync(options.path)) {
        throw new Error(`Vision input image file does not exist: ${options.path}`);
      }
      buffer = await fs.promises.readFile(options.path);
      if (!mimeType) {
        mimeType = this.detectMimeTypeFromPath(options.path);
      }
    } else if (options.buffer) {
      buffer = options.buffer;
    } else {
      throw new Error('VisionInputOptions must provide either a file path or a buffer.');
    }

    if (!mimeType) {
      mimeType = 'image/png'; // Default fallback
    }

    let width: number | undefined;
    let height: number | undefined;

    try {
      const parsed = await sharp(buffer).metadata();
      width = parsed.width;
      height = parsed.height;
      if (parsed.format && !options.mimeType && !options.path) {
        mimeType = `image/${parsed.format === 'jpeg' ? 'jpeg' : parsed.format}`;
      }
    } catch {
      // If sharp parsing fails, proceed with provided or fallback metadata
    }

    const base64Str = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Str}`;
    const attachmentId = `vis_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return {
      id: attachmentId,
      dataUrl,
      mimeType,
      detail: options.detail || 'auto',
      sizeBytes: buffer.length,
      width,
      height
    };
  }

  /**
   * Format a text prompt and list of vision attachments into an LLM vision payload message.
   */
  formatPromptWithVision(
    prompt: string,
    attachments: VisionInputAttachment[],
    role: 'user' | 'system' | 'assistant' = 'user'
  ): FormattedVisionMessage {
    const contentParts: FormattedVisionMessageContent[] = [
      {
        type: 'text',
        text: prompt
      }
    ];

    for (const att of attachments) {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: att.dataUrl,
          detail: att.detail
        }
      });
    }

    return {
      role,
      content: contentParts
    };
  }

  /**
   * Extract image metadata (dimensions, size, mimeType) from a VisionInputAttachment or raw Buffer.
   */
  async extractVisionMetadata(
    source: VisionInputAttachment | Buffer
  ): Promise<{ width?: number; height?: number; mimeType: string; sizeBytes: number }> {
    if (Buffer.isBuffer(source)) {
      let width: number | undefined;
      let height: number | undefined;
      let mimeType = 'image/png';
      try {
        const parsed = await sharp(source).metadata();
        width = parsed.width;
        height = parsed.height;
        if (parsed.format) {
          mimeType = `image/${parsed.format === 'jpeg' ? 'jpeg' : parsed.format}`;
        }
      } catch {
        // Fallback
      }
      return { width, height, mimeType, sizeBytes: source.length };
    }

    return {
      width: source.width,
      height: source.height,
      mimeType: source.mimeType,
      sizeBytes: source.sizeBytes
    };
  }

  private detectMimeTypeFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.svg':
        return 'image/svg+xml';
      default:
        return 'image/png';
    }
  }
}
