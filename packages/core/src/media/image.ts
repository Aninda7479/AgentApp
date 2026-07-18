import { BYOKConfig } from '../types/agent.js';
import { hasRealMediaKey, isMockKey, NO_PROVIDER_MESSAGE } from './config.js';

/** Options for configuring an AI image generation request. */
export interface ImageGenerationOptions {
  prompt: string;
  model?: string;
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
  responseFormat?: 'url' | 'b64_json';
}

export interface GeneratedImageData {
  url?: string;
  b64_json?: string;
}

export interface ImageGenerationResult {
  id: string;
  status: 'success' | 'failed';
  images: GeneratedImageData[];
  prompt: string;
  model: string;
  provider: string;
  createdAt: number;
  error?: string;
}

export class ImageGenerator {
  async generateImage(options: ImageGenerationOptions, config: BYOKConfig): Promise<ImageGenerationResult> {
    const taskId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const model = options.model || config.modelName || 'dall-e-3';
    const provider = config.provider || 'openai';

    if (!options.prompt || options.prompt.trim() === '') {
      return {
        id: taskId,
        status: 'failed',
        images: [],
        prompt: options.prompt || '',
        model,
        provider,
        createdAt: Date.now(),
        error: 'Prompt cannot be empty'
      };
    }

    if (hasRealMediaKey(config)) {
      try {
        const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/images/generations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            prompt: options.prompt,
            n: options.n || 1,
            size: options.size || '1024x1024',
            quality: options.quality || 'standard',
            style: options.style || 'vivid',
            response_format: options.responseFormat || 'url'
          })
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
            error: `API call failed with status ${response.status}: ${errText}`
          };
        }

        const data = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> };
        const images: GeneratedImageData[] = (data.data || []).map(img => {
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
      const mockImages: GeneratedImageData[] = [];
      const count = options.n || 1;
      for (let i = 0; i < count; i += 1) {
        if (options.responseFormat === 'b64_json') {
          mockImages.push({ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' });
        } else {
          mockImages.push({ url: `https://media.superagent.ai/generated/${taskId}_${i}.png` });
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
