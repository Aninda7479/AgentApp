/**
 * Capability availability — the frontend-facing check for whether the user has
 * a provider connected that can actually run a given media/capability command.
 *
 * This deliberately reuses the SAME id→modality inference the provider catalog
 * already applies when enriching models (`SettingsView.inferModalities`), so the
 * "is this available?" decision matches what the UI already shows the user. It
 * never hard-codes a vendor: availability is derived purely from the connected
 * providers + their (enriched) model catalog, which keeps the platform
 * provider-agnostic (mission point 1).
 */
import type { AppContext, ModelConfig, ProviderConnection } from './types';

/** The capability commands exposed from the `/` palette. */
export type MediaCapability = 'image' | 'video' | 'audio' | 'pdf' | '3d';

/** Providers that run locally / without a secret key still count as "connected". */
const KEYLESS_PROVIDER_IDS = new Set(['ollama', 'custom']);

// Same id patterns the catalog uses to infer a model's media output modality.
const VIDEO_OUTPUT = /seedance|cogvideox|wanvideo|wan-video|hunyuanvideo|hunyuan-video|ltx-video|mochi|minimax-video|genmo|animatediff|svd|stable-video|videocrafter|kling|hailuo|vidu/;
const IMAGE_OUTPUT = /flux|dall-e|imagen|sdxl|stable-diffusion|kolors|playground|recraft|juggernaut|realvis|dreamshaper|auraflow|sana|lumina|pixart|kandinsky/;
const AUDIO_OUTPUT = /\btts\b|text-to-speech|speecht5|kokoro|parler-tts|voicecraft/;
const AUDIO_INPUT = /whisper|speech-to-text|asr|transcription|speech-recognition/;

/** Infers media modalities from a model id (fallback when the catalog hasn't enriched it). */
function inferredModalities(modelId: string): { input: string[]; output: string[] } {
  const id = modelId.toLowerCase();
  if (VIDEO_OUTPUT.test(id)) return { input: ['text', 'image'], output: ['video'] };
  if (IMAGE_OUTPUT.test(id)) return { input: ['text'], output: ['image'] };
  if (AUDIO_OUTPUT.test(id)) return { input: ['text'], output: ['audio'] };
  if (AUDIO_INPUT.test(id)) return { input: ['audio'], output: ['text'] };
  return { input: [], output: [] };
}

/** A provider is usable if it carries a key or is a keyless/local provider. */
function providerUsable(p: ProviderConnection | undefined): boolean {
  if (!p) return false;
  return Boolean(p.apiKey) || KEYLESS_PROVIDER_IDS.has(p.id);
}

/** Does the (enabled) model expose the requested media type? */
function modelHasMedia(m: ModelConfig, kind: 'image' | 'video' | 'audio'): boolean {
  const out = m.outputModalities ?? [];
  const infOut = inferredModalities(m.id).output;
  const outputs = out.length ? out : infOut;
  if (kind === 'image') return outputs.includes('image');
  if (kind === 'video') return outputs.includes('video');
  // Audio generation (tts → output 'audio') or transcription (asr → input 'audio').
  if (kind === 'audio') {
    const ins = m.inputModalities ?? inferredModalities(m.id).input;
    return outputs.includes('audio') || ins.includes('audio');
  }
  return false;
}

/**
 * True when the user has a connected, usable provider able to satisfy `cap`.
 *  - image/video/audio → an enabled model in the catalog whose modality matches,
 *    owned by a usable provider.
 *  - pdf → any usable provider (PDF create/read/edit is LLM + local doc tooling).
 *  - 3d → the 3D Studio feature is enabled AND a usable provider exists.
 */
export function hasCapableProvider(
  ctx: AppContext,
  cap: MediaCapability,
  opts?: { is3dEnabled?: boolean }
): boolean {
  const providers = ctx.getConnectedProviders();
  const usableProvider = providers.some(providerUsable);

  switch (cap) {
    case 'image':
    case 'video':
    case 'audio': {
      const kind = cap;
      return ctx
        .getModelsCatalog()
        .filter((m) => m.enabled)
        .some((m) => providerUsable(providers.find((p) => p.id === m.providerId)) && modelHasMedia(m, kind));
    }
    case 'pdf':
      return usableProvider;
    case '3d':
      return Boolean(opts?.is3dEnabled) && usableProvider;
    default:
      return false;
  }
}
