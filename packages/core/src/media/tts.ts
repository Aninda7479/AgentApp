import { BYOKConfig } from '../types/agent.js';

export interface SpeechSynthesisOptions {
  text: string;
  model?: string;
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | string;
  speed?: number;
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}

export interface SpeechSynthesisResult {
  id: string;
  status: 'success' | 'failed';
  audioBuffer?: Buffer;
  format: string;
  durationSeconds?: number;
  provider: string;
  model: string;
  createdAt: number;
  error?: string;
}

export class SpeechSynthesizer {
  async synthesize(options: SpeechSynthesisOptions, config: BYOKConfig): Promise<SpeechSynthesisResult> {
    const taskId = `tts_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const model = options.model || config.modelName || 'tts-1';
    const provider = config.provider || 'openai';
    const format = options.responseFormat || 'mp3';

    if (!options.text || options.text.trim() === '') {
      return {
        id: taskId,
        status: 'failed',
        format,
        provider,
        model,
        createdAt: Date.now(),
        error: 'Text prompt for speech synthesis cannot be empty'
      };
    }

    if (config.apiKey && config.apiKey !== 'mock-key' && !config.apiKey.includes('mock')) {
      try {
        const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/audio/speech`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            input: options.text,
            voice: options.voice || 'alloy',
            speed: options.speed || 1.0,
            response_format: format
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          return {
            id: taskId,
            status: 'failed',
            format,
            provider,
            model,
            createdAt: Date.now(),
            error: `API call failed with status ${response.status}: ${errText}`
          };
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);

        return {
          id: taskId,
          status: 'success',
          audioBuffer,
          format,
          durationSeconds: Math.round(options.text.length / 15), // approximate duration estimation
          provider,
          model,
          createdAt: Date.now()
        };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          id: taskId,
          status: 'failed',
          format,
          provider,
          model,
          createdAt: Date.now(),
          error: errorMessage
        };
      }
    }

    // Default mock audio response for testing
    const mockAudioBuffer = Buffer.from(`MOCK_AUDIO_SYNTHESIS_DATA_${taskId}`);
    return {
      id: taskId,
      status: 'success',
      audioBuffer: mockAudioBuffer,
      format,
      durationSeconds: Math.max(1, Math.round(options.text.length / 15)),
      provider,
      model,
      createdAt: Date.now()
    };
  }
}
