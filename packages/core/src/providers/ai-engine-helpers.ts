import { SettingsStorage, type ModelSettings } from '../storage/settings-store.js';
import { capabilityRegistry } from './models.js';
import { OrchestratorStorage } from '../orchestrator/storage.js';
import type { RouterModel } from '../orchestrator/router.js';
import {
  ContentBlock,
  ImageAttachment,
  type CompletionRequest
} from '../types/agent.js';

/**
 * Builds a RouterModel[] pool for the orchestration router from the user's
 * configured models (SettingsStorage). Vision/tool capability isn't stored as a
 * boolean on ModelSettings, so it is derived from OrchestratorStorage scores — the
 * same source storage.ts uses — keeping the pool consistent with the rest of
 * the Orchestrator layer.
 */
export function buildRouterPool(models: ModelSettings[]): RouterModel[] {
  return models.map((m) => {
    const scores = OrchestratorStorage.getModelScores(m.id);
    // Best-effort enrichment with the extended registry signals (speed/intelligence
    // tier, dollar cost). The catalog id may carry a `${providerId}-` prefix the
    // registry doesn't, so try the stripped native id as a fallback. Missing
    // metadata leaves the fields undefined and the router falls back to its
    // neutral midpoint — never a hard error.
    const cap =
      capabilityRegistry.getCapability(m.id) ??
      capabilityRegistry.getCapability(m.id.includes('-') ? m.id.slice(m.id.indexOf('-') + 1) : m.id);
    return {
      id: m.id,
      name: m.name,
      providerId: m.providerId,
      enabled: m.enabled,
      supportsVision: scores.vision >= 75,
      supportsTools: scores.coding >= 70 || scores.reasoning >= 75,
      inputModalities: m.inputModalities as RouterModel['inputModalities'],
      outputModalities: m.outputModalities as RouterModel['outputModalities'],
      accessStatus: 'available',
      speedTier: cap?.speedTier,
      intelligenceTier: cap?.intelligenceTier,
      costPer1kTokens: cap?.costPer1kTokens
    };
  });
}

/**
 * Builds a CompletionRequest from a prompt + attachments, encoding each image
 * attachment as an image_url content block so the modality bridge can detect a
 * vision input and plan accordingly.
 */
export function buildBridgeRequest(prompt: string, attachments?: ImageAttachment[]): CompletionRequest {
  const content: ContentBlock[] = [{ type: 'text', text: prompt }];
  if (attachments) {
    for (const att of attachments) {
      content.push({ type: 'image_url', image_url: { url: att.dataUrl } });
    }
  }
  return { messages: [{ role: 'user', content }] };
}

/**
 * Google's Gemini `functionDeclarations[].parameters` accepts only a strict
 * subset of JSON Schema (a proto-derived Schema type). Standard-JSON-Schema
 * keywords like `additionalProperties`, `$schema`, `strict`, and `examples`
 * are rejected outright with HTTP 400
 * ("Unknown name \"additionalProperties\" ... Cannot find field"), which fails
 * the entire request and every tool call routed to Gemini.
 *
 * This recursively deep-copies a tool schema and drops the unsupported keywords
 * while preserving everything Gemini does understand (type, properties,
 * required, enum, description, format, nullable, items). The OpenAI path keeps
 * `additionalProperties: false` (needed for its `strict: true` mode) — this
 * sanitizer is ONLY applied on the Gemini branch.
 */
const GEMINI_UNSUPPORTED_SCHEMA_KEYS = new Set([
  'additionalProperties',
  '$schema',
  'strict',
  'examples',
  'default',
  '$id',
  '$ref',
  'definitions',
  '$defs'
]);

export function sanitizeSchemaForGemini(schema: unknown): any {
  if (Array.isArray(schema)) {
    return schema.map((item) => sanitizeSchemaForGemini(item));
  }
  if (schema && typeof schema === 'object') {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (GEMINI_UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
      out[key] = sanitizeSchemaForGemini(value);
    }
    return out;
  }
  return schema;
}

/**
 * Returns true when `command` is permitted by the project's command allowlist.
 * An empty/undefined allowlist permits everything — confinement is opt-in, so
 * the user must explicitly pre-approve commands in project settings for the
 * restriction to take effect. Matching is prefix-based on the first token(s):
 * allowing "git" permits `git` and `git status`, but not `github-clone …`.
 * Mirrors the same guard in the desktop and web engines so run_command
 * enforces the same policy everywhere (mission point #1).
 */
export function isCommandAllowed(command: string, allowedCommands?: string[]): boolean {
  if (!allowedCommands || allowedCommands.length === 0) return true;
  const cmd = command.trim();
  if (cmd.length === 0) return false;
  const firstToken = cmd.split(/\s+/)[0];
  return allowedCommands.some((allowed) => {
    const a = allowed.trim();
    return a !== '' && (cmd === a || firstToken === a || cmd.startsWith(a + ' '));
  });
}

/** Returns true when the API error message indicates context limit overflow. */
export function isContextOverflowError(message: string): boolean {
  if (!message) return false;
  return /context length|context window|maximum context|max.*context|token limit|too many tokens|request too large|exceeds.{0,24}context|context.{0,12}exceed|prompt is too long|input.{0,12}too long|input length|sequence too long/i.test(
    message
  );
}

/**
 * Detects a runaway token-repetition loop in a streaming text buffer or prompt context.
 * Returns { isLoop: true, cleanText } when >= 3 consecutive exact repetitions
 * of any substring (2–200 chars) are found in the trailing 1000-char window.
 */
export function detectRepetitiveLoop(text: string): { isLoop: boolean; cleanText: string } {
  if (!text || text.length < 6) return { isLoop: false, cleanText: text };

  const windowSize = Math.min(4000, text.length);
  const window = text.slice(-windowSize);

  const maxLen = Math.min(1000, Math.floor(windowSize / 3));

  for (let len = 2; len <= maxLen; len++) {
    const maxOffset = Math.min(len - 1, 30);
    for (let offset = 0; offset <= maxOffset; offset++) {
      const endIdx = window.length - offset;
      const startIdx = endIdx - len;
      if (startIdx < 0) continue;

      const sub = window.slice(startIdx, endIdx);
      if (!sub.trim()) continue;

      let occurrences = 0;
      let idx = endIdx;
      while (idx >= len) {
        if (window.slice(idx - len, idx) === sub) {
          occurrences++;
          idx -= len;
        } else {
          break;
        }
      }

      if (occurrences >= 3) {
        const pattern = sub;
        const triplePattern = pattern + pattern + pattern;
        const firstIdx = text.indexOf(triplePattern);
        if (firstIdx !== -1) {
          if (firstIdx === 0) {
            return { isLoop: true, cleanText: pattern.trim() };
          }
          const cleanText = text.slice(0, firstIdx).trim();
          return { isLoop: true, cleanText };
        } else {
          const cutoff = text.length - offset - (len * occurrences);
          const cleanText = text.slice(0, Math.max(0, cutoff)).trim();
          return { isLoop: true, cleanText };
        }
      }
    }
  }

  return { isLoop: false, cleanText: text };
}


