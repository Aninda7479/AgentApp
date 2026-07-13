import { BYOKConfig } from '../types/agent.js';
import { ImageGenerator, ImageGenerationOptions, ImageGenerationResult } from './image.js';
import { ImageInpainter, ImageInpaintOptions, ImageInpaintResult } from './inpaint.js';
import { SpeechSynthesizer, SpeechSynthesisOptions, SpeechSynthesisResult } from './tts.js';
import { AudioTranscriber, AudioTranscriptionOptions, AudioTranscriptionResult } from './stt.js';
import { VideoGenerator, VideoGenerationOptions, VideoGenerationJob } from './video.js';

/** Supported media generation task types. */
export type MediaTaskType =
  | 'image-generation'
  | 'image-inpainting'
  | 'speech-synthesis'
  | 'audio-transcription'
  | 'video-generation';

/** A request to route to the appropriate media generation pipeline. */
export interface MediaTaskRequest {
  id?: string;
  taskType: MediaTaskType;
  imageGen?: ImageGenerationOptions;
  imageInpaint?: ImageInpaintOptions;
  speechSynth?: SpeechSynthesisOptions;
  audioTranscribe?: AudioTranscriptionOptions;
  videoGen?: VideoGenerationOptions;
}

/** Union of possible media pipeline output types. */
export type MediaTaskDataResult =
  | ImageGenerationResult
  | ImageInpaintResult
  | SpeechSynthesisResult
  | AudioTranscriptionResult
  | VideoGenerationJob;

/** Result from a media generation pipeline. */
export interface MediaTaskResult {
  taskId: string;
  taskType: MediaTaskType;
  status: 'success' | 'failed';
  result?: MediaTaskDataResult;
  error?: string;
}

/** Routes media generation requests to the appropriate engine (image, audio, video, etc.). */
export class MediaPipelineRouter {
  private imageGenerator: ImageGenerator;
  private imageInpainter: ImageInpainter;
  private speechSynthesizer: SpeechSynthesizer;
  private audioTranscriber: AudioTranscriber;
  private videoGenerator: VideoGenerator;

  constructor() {
    this.imageGenerator = new ImageGenerator();
    this.imageInpainter = new ImageInpainter();
    this.speechSynthesizer = new SpeechSynthesizer();
    this.audioTranscriber = new AudioTranscriber();
    this.videoGenerator = new VideoGenerator();
  }

  async executeTask(request: MediaTaskRequest, config: BYOKConfig): Promise<MediaTaskResult> {
    const taskId = request.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      switch (request.taskType) {
        case 'image-generation': {
          if (!request.imageGen) {
            return { taskId, taskType: request.taskType, status: 'failed', error: 'Missing imageGen parameters' };
          }
          const res = await this.imageGenerator.generateImage(request.imageGen, config);
          return {
            taskId,
            taskType: request.taskType,
            status: res.status,
            result: res,
            error: res.error
          };
        }

        case 'image-inpainting': {
          if (!request.imageInpaint) {
            return { taskId, taskType: request.taskType, status: 'failed', error: 'Missing imageInpaint parameters' };
          }
          const res = await this.imageInpainter.inpaintOrEdit(request.imageInpaint, config);
          return {
            taskId,
            taskType: request.taskType,
            status: res.status,
            result: res,
            error: res.error
          };
        }

        case 'speech-synthesis': {
          if (!request.speechSynth) {
            return { taskId, taskType: request.taskType, status: 'failed', error: 'Missing speechSynth parameters' };
          }
          const res = await this.speechSynthesizer.synthesize(request.speechSynth, config);
          return {
            taskId,
            taskType: request.taskType,
            status: res.status,
            result: res,
            error: res.error
          };
        }

        case 'audio-transcription': {
          if (!request.audioTranscribe) {
            return { taskId, taskType: request.taskType, status: 'failed', error: 'Missing audioTranscribe parameters' };
          }
          const res = await this.audioTranscriber.transcribe(request.audioTranscribe, config);
          return {
            taskId,
            taskType: request.taskType,
            status: res.status,
            result: res,
            error: res.error
          };
        }

        case 'video-generation': {
          if (!request.videoGen) {
            return { taskId, taskType: request.taskType, status: 'failed', error: 'Missing videoGen parameters' };
          }
          const res = await this.videoGenerator.startJob(request.videoGen, config);
          const taskStatus = res.status === 'failed' ? 'failed' : 'success';
          return {
            taskId,
            taskType: request.taskType,
            status: taskStatus,
            result: res,
            error: res.error
          };
        }

        default: {
          return {
            taskId,
            taskType: request.taskType,
            status: 'failed',
            error: `Unsupported media task type: ${String(request.taskType)}`
          };
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        taskId,
        taskType: request.taskType,
        status: 'failed',
        error: errorMessage
      };
    }
  }

  getImageGenerator(): ImageGenerator {
    return this.imageGenerator;
  }

  getImageInpainter(): ImageInpainter {
    return this.imageInpainter;
  }

  getSpeechSynthesizer(): SpeechSynthesizer {
    return this.speechSynthesizer;
  }

  getAudioTranscriber(): AudioTranscriber {
    return this.audioTranscriber;
  }

  getVideoGenerator(): VideoGenerator {
    return this.videoGenerator;
  }
}
