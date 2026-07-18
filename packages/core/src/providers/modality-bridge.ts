/**
 * modality-bridge.ts — Modality bridging for the orchestrator.
 *
 * The router picks the best model for a task, but a chosen model may not be able
 * to *read* the input modality the user actually sent (e.g. a text-only coding
 * model asked about an attached screenshot). Rather than hard-fail or silently
 * drop the attachment, we auto-insert a vision/transcription model AHEAD of the
 * target to transduce the input into text, then hand the text to the target.
 *
 * This is mission point #1 (don't depend on one model being able to do
 * everything) made concrete at the input layer. The handoff is always described
 * in `reason` (and surfaced via `onBridge`) so it is visible, never silent.
 *
 * Everything here is pure/deterministic except the actual adapter `.complete()`
 * call performed by the caller (ModelRouter.completeWithBridge) — so the planning
 * and request-augmentation logic is unit-testable with no network.
 */

import type { CompletionRequest, Modality } from '../types/agent.js';
// RouterModel is defined in router.ts; type-only import avoids a runtime cycle
// with the value import router.ts makes of the bridge helpers.
import type { RouterModel } from './router.js';

/** Result of deciding whether (and how) to bridge a request's input modality. */
export interface ModalityBridgePlan {
  /** True when a bridge model must transduce the input before the target runs. */
  needsBridge: boolean;
  /** Which kind of transduction to perform. */
  bridgeType: 'vision' | 'transcription' | null;
  /** The model that will perform the transduction (only when needsBridge). */
  bridgeModel?: RouterModel;
  /** Human-readable explanation — surfaced so the handoff is visible, not silent. */
  reason: string;
}

/** Returns true when `model` can ingest the given input modality. */
export function modelSupportsInput(model: RouterModel, modality: Modality): boolean {
  if (modality === 'image') return model.supportsVision === true;
  // Other modalities (audio/video/3d) are expressed via the extended
  // inputModalities field when the caller supplies it; fall back to false.
  if (model.inputModalities && model.inputModalities.includes(modality)) return true;
  return false;
}

/**
 * Detects the input modalities a request actually requires by scanning its
 * messages for multimodal content blocks. `explicit` lets a caller (e.g. the
 * engine, which sees audio attachments separately) add modalities the message
 * scan can't observe yet.
 */
export function detectInputModalities(
  request: CompletionRequest,
  explicit: Modality[] = []
): Modality[] {
  const found = new Set<Modality>(explicit);
  for (const msg of request.messages) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'image_url') found.add('image');
      }
    }
  }
  return Array.from(found);
}

/**
 * Decides whether the target model needs a bridge. When the target lacks a
 * required modality but some *available* pool model supplies it, that model is
 * chosen as the bridge and `needsBridge` is true. Otherwise no bridge is planned
 * and `reason` explains why (target already supports it, or no capable bridge
 * model exists in the pool — in which case we send the raw request rather than
 * inventing a transduction).
 */
export function planModalityBridge(opts: {
  requiredModalities: Modality[];
  targetModel: RouterModel;
  pool: RouterModel[];
}): ModalityBridgePlan {
  const { requiredModalities, targetModel, pool } = opts;

  const missing = requiredModalities.filter((mod) => !modelSupportsInput(targetModel, mod));
  if (missing.length === 0) {
    return {
      needsBridge: false,
      bridgeType: null,
      reason: `Target '${targetModel.id}' already supports the required modalities (${requiredModalities.join(', ') || 'none'}).`
    };
  }

  const candidates = pool
    .filter((m) => (m.accessStatus === undefined || m.accessStatus === 'available'))
    .filter((m) => missing.every((mod) => modelSupportsInput(m, mod)));

  if (candidates.length === 0) {
    return {
      needsBridge: false,
      bridgeType: null,
      reason: `Target '${targetModel.id}' can't read ${missing.join('/')} and no available bridge model in the pool supplies it; sending the raw request.`
    };
  }

  const bridgeModel = candidates[0];
  const bridgeType: 'vision' | 'transcription' = missing.includes('audio') ? 'transcription' : 'vision';
  return {
    needsBridge: true,
    bridgeType,
    bridgeModel,
    reason: `Target '${targetModel.id}' can't read ${missing.join('/')}; bridging via '${bridgeModel.id}' (${bridgeType} model) before the final call.`
  };
}

/** Instruction prepended to the bridge model so it transduces rather than answers. */
export function bridgeInstruction(bridgeType: 'vision' | 'transcription'): string {
  if (bridgeType === 'transcription') {
    return 'Transcribe the attached audio verbatim and accurately, preserving meaning and structure. Output only the transcription.';
  }
  return 'Describe this image in exhaustive detail — text, diagrams, UI elements, code, numbers, and any embedded content. Output only the description.';
}

/**
 * Returns a request identical to `request` but with the bridge instruction
 * prepended into the last user message (image/audio blocks are kept so the
 * bridge model can actually see them).
 */
export function withBridgeInstruction(
  request: CompletionRequest,
  instruction: string
): CompletionRequest {
  const messages = request.messages.map((m) => ({ ...m, content: Array.isArray(m.content) ? [...m.content] : m.content }));
  let lastUserIdx = -1;
  for (let i = 0; i < messages.length; i++) if (messages[i].role === 'user') lastUserIdx = i;
  if (lastUserIdx === -1) return { ...request, messages };

  const msg = messages[lastUserIdx];
  const prefixed = `${instruction}\n\n`;
  if (Array.isArray(msg.content)) {
    messages[lastUserIdx] = {
      ...msg,
      content: msg.content.map((b) => (b.type === 'text' ? { ...b, text: prefixed + b.text } : b))
    };
    // If the user message had no text block, add one carrying the instruction.
    if (!msg.content.some((b) => b.type === 'text')) {
      messages[lastUserIdx] = { ...msg, content: [{ type: 'text', text: prefixed.trim() }, ...msg.content] };
    }
  } else {
    messages[lastUserIdx] = { ...msg, content: prefixed + msg.content };
  }
  return { ...request, messages };
}

/**
 * Returns a request ready for the *target* model: the bridge transcription is
 * prepended to the last user message as plain text, and all image/audio content
 * blocks are stripped so a non-vision/non-audio target receives only text.
 */
export function augmentRequestForBridge(
  request: CompletionRequest,
  bridgeText: string,
  label: string
): CompletionRequest {
  const messages = request.messages.map((m) => ({ ...m, content: Array.isArray(m.content) ? [...m.content] : m.content }));
  let lastUserIdx = -1;
  for (let i = 0; i < messages.length; i++) if (messages[i].role === 'user') lastUserIdx = i;
  if (lastUserIdx === -1) return { ...request, messages };

  const context = `[${label} from a bridging model]\n${bridgeText}\n\n`;
  const msg = messages[lastUserIdx];
  if (Array.isArray(msg.content)) {
    // Drop non-text blocks; prepend the transcribed context to any text block.
    const textBlocks = msg.content.filter((b) => b.type === 'text');
    const remaining = textBlocks.length > 0
      ? textBlocks.map((b) => (b.type === 'text' ? { ...b, text: context + b.text } : b))
      : [{ type: 'text' as const, text: context.trim() }];
    messages[lastUserIdx] = { ...msg, content: remaining };
  } else {
    messages[lastUserIdx] = { ...msg, content: context + msg.content };
  }
  return { ...request, messages };
}

/** Extracts the text of the last user message (for task classification). */
export function lastUserText(request: CompletionRequest): string {
  let text = '';
  for (const m of request.messages) {
    if (m.role !== 'user') continue;
    text = Array.isArray(m.content) ? m.content.map((b) => (b.type === 'text' ? b.text : '')).join(' ') : m.content;
  }
  return text;
}

/** Finds the RouterModel in `pool` matching a router-selected {provider, model}. */
export function findRouterModel(
  pool: RouterModel[],
  provider: string,
  model: string
): RouterModel | undefined {
  const prefixed = `${provider}-${model}`;
  return pool.find((m) => m.providerId === provider && (m.id === model || `${m.providerId}-${m.id}` === prefixed))
    || pool.find((m) => m.providerId === provider)
    || pool[0];
}
