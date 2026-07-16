import { BYOKConfig } from '../types/agent.js';
import { hasRealMediaKey, NO_PROVIDER_MESSAGE } from './config.js';

export interface AudioTranscriptionOptions {
  audioBuffer: Buffer;
  filename?: string;
  model?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface AudioTranscriptionResult {
  id: string;
  status: 'success' | 'failed';
  text: string;
  language?: string;
  durationSeconds?: number;
  segments?: TranscriptionSegment[];
  provider: string;
  model: string;
  createdAt: number;
  error?: string;
}

export class AudioTranscriber {
  async transcribe(options: AudioTranscriptionOptions, config: BYOKConfig): Promise<AudioTranscriptionResult> {
    const taskId = `stt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const model = options.model || config.modelName || 'whisper-1';
    const provider = config.provider || 'openai';

    if (!options.audioBuffer || options.audioBuffer.length === 0) {
      return {
        id: taskId,
        status: 'failed',
        text: '',
        model,
        provider,
        createdAt: Date.now(),
        error: 'Audio buffer cannot be empty'
      };
    }

    if (hasRealMediaKey(config)) {
      try {
        const formData = new FormData();
        const audioBlob = new Blob([new Uint8Array(options.audioBuffer)], { type: 'audio/mp3' });
        formData.append('file', audioBlob, options.filename || 'audio.mp3');
        formData.append('model', model);

        if (options.language) {
          formData.append('language', options.language);
        }
        if (options.prompt) {
          formData.append('prompt', options.prompt);
        }
        if (options.responseFormat) {
          formData.append('response_format', options.responseFormat);
        }
        if (options.temperature !== undefined) {
          formData.append('temperature', String(options.temperature));
        }

        const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/audio/transcriptions`, {
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
            text: '',
            model,
            provider,
            createdAt: Date.now(),
            error: `API transcription call failed with status ${response.status}: ${errText}`
          };
        }

        if (options.responseFormat === 'text' || options.responseFormat === 'srt' || options.responseFormat === 'vtt') {
          const rawText = await response.text();
          return {
            id: taskId,
            status: 'success',
            text: rawText,
            model,
            provider,
            createdAt: Date.now()
          };
        }

        const data = await response.json() as {
          text?: string;
          language?: string;
          duration?: number;
          segments?: Array<{ id: number; start: number; end: number; text: string }>;
        };

        return {
          id: taskId,
          status: 'success',
          text: data.text || '',
          language: data.language || options.language || 'en',
          durationSeconds: data.duration,
          segments: data.segments,
          model,
          provider,
          createdAt: Date.now()
        };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          id: taskId,
          status: 'failed',
          text: '',
          model,
          provider,
          createdAt: Date.now(),
          error: errorMessage
        };
      }
    }

    // No real provider configured. If a mock key was explicitly supplied we
    // still allow offline fixtures; otherwise report a clear failure instead of
    // returning fabricated transcription with status 'success'.
    if (config.apiKey === 'mock-key' || config.apiKey.includes('mock')) {
      const mockText = 'This is a simulated transcription from AI Audio Processing & STT model.';
      return {
        id: taskId,
        status: 'success',
        text: mockText,
        language: options.language || 'en',
        durationSeconds: 5.2,
        segments: [
          { id: 0, start: 0.0, end: 2.5, text: 'This is a simulated transcription' },
          { id: 1, start: 2.5, end: 5.2, text: 'from AI Audio Processing & STT model.' }
        ],
        model,
        provider,
        createdAt: Date.now()
      };
    }

    return {
      id: taskId,
      status: 'failed',
      text: '',
      model,
      provider,
      createdAt: Date.now(),
      error: NO_PROVIDER_MESSAGE
    };
  }
}
