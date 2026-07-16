import { BYOKConfig } from '../types/agent.js';
import { hasRealMediaKey, isMockKey, NO_PROVIDER_MESSAGE } from './config.js';
import sharp from 'sharp';

export interface ImageInpaintOptions {
  imageBuffer: Buffer;
  maskBuffer?: Buffer;
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  responseFormat?: 'url' | 'b64_json';
}

export interface InpaintResultImageData {
  url?: string;
  b64_json?: string;
}

export interface ImageInpaintResult {
  id: string;
  status: 'success' | 'failed';
  images: InpaintResultImageData[];
  prompt: string;
  model: string;
  provider: string;
  createdAt: number;
  error?: string;
}

export class ImageInpainter {
  async prepareMask(maskBuffer: Buffer, targetWidth: number, targetHeight: number): Promise<Buffer> {
    return await sharp(maskBuffer)
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .toFormat('png')
      .toBuffer();
  }

  async inpaintOrEdit(options: ImageInpaintOptions, config: BYOKConfig): Promise<ImageInpaintResult> {
    const taskId = `inp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const model = options.model || config.modelName || 'dall-e-2';
    const provider = config.provider || 'openai';

    if (!options.imageBuffer || options.imageBuffer.length === 0) {
      return {
        id: taskId,
        status: 'failed',
        images: [],
        prompt: options.prompt || '',
        model,
        provider,
        createdAt: Date.now(),
        error: 'Source image buffer cannot be empty'
      };
    }

    if (!options.prompt || options.prompt.trim() === '') {
      return {
        id: taskId,
        status: 'failed',
        images: [],
        prompt: '',
        model,
        provider,
        createdAt: Date.now(),
        error: 'Prompt cannot be empty'
      };
    }

    let processedMask: Buffer | undefined = undefined;
    if (options.maskBuffer && options.maskBuffer.length > 0) {
      try {
        const imageMetadata = await sharp(options.imageBuffer).metadata();
        const width = imageMetadata.width || 1024;
        const height = imageMetadata.height || 1024;
        processedMask = await this.prepareMask(options.maskBuffer, width, height);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          id: taskId,
          status: 'failed',
          images: [],
          prompt: options.prompt,
          model,
          provider,
          createdAt: Date.now(),
          error: `Failed processing mask: ${errorMessage}`
        };
      }
    }

    if (hasRealMediaKey(config)) {
      try {
        const formData = new FormData();
        const imageBlob = new Blob([new Uint8Array(options.imageBuffer)], { type: 'image/png' });
        formData.append('image', imageBlob, 'image.png');

        if (processedMask) {
          const maskBlob = new Blob([new Uint8Array(processedMask)], { type: 'image/png' });
          formData.append('mask', maskBlob, 'mask.png');
        }

        formData.append('prompt', options.prompt);
        formData.append('model', model);
        formData.append('n', String(options.n || 1));
        formData.append('size', options.size || '1024x1024');
        formData.append('response_format', options.responseFormat || 'url');

        const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/images/edits`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: formData
        });

        if (!response.ok) {
          const errText = await response.text();
          return {
            id: taskId,
            status: 'failed',
            images: [],
            prompt: options.prompt,
            model,
            provider,
            createdAt: Date.now(),
            error: `API edit call failed with status ${response.status}: ${errText}`
          };
        }

        const data = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> };
        const images: InpaintResultImageData[] = (data.data || []).map(img => {
          if (img.b64_json) {
            return { b64_json: img.b64_json };
          }
          return { url: img.url };
        });

        return {
          id: taskId,
          status: 'success',
          images,
          prompt: options.prompt,
          model,
          provider,
          createdAt: Date.now()
        };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          id: taskId,
          status: 'failed',
          images: [],
          prompt: options.prompt,
          model,
          provider,
          createdAt: Date.now(),
          error: errorMessage
        };
      }
    }

    // No real provider configured. If a mock key was explicitly supplied we
    // still allow offline fixtures; otherwise report a clear failure instead of
    // returning fabricated media with status 'success'.
    if (isMockKey(config)) {
      const mockImages: InpaintResultImageData[] = [];
      const count = options.n || 1;
      for (let i = 0; i < count; i += 1) {
        if (options.responseFormat === 'b64_json') {
          mockImages.push({ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' });
        } else {
          mockImages.push({ url: `https://media.superagent.ai/edited/${taskId}_${i}.png` });
        }
      }

      return {
        id: taskId,
        status: 'success',
        images: mockImages,
        prompt: options.prompt,
        model,
        provider,
        createdAt: Date.now()
      };
    }

    return {
      id: taskId,
      status: 'failed',
      images: [],
      prompt: options.prompt,
      model,
      provider,
      createdAt: Date.now(),
      error: NO_PROVIDER_MESSAGE
    };
  }
}
