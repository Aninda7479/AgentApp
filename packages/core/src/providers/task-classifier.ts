/**
 * task-classifier.ts — Richer, modality-aware task classification for the
 * orchestrator (gap #8: replace the router's regex-only classifier with
 * richer routing signals).
 *
 * Given a CompletionRequest, it determines:
 *  - requiredModalities: the input modalities the request *actually* carries
 *    (real attachments via `detectInputModalities`, not just text cues).
 *  - domain flags: isCoding / isReasoning / isVision / isCreative / isAudio /
 *    is3D, each derived from refined, mostly non-overlapping text signals so a
 *    creative "write a poem" no longer trips the coding gate.
 *  - difficulty: a coarse low/medium/high estimate the engine can later use to
 *    escalate reasoning effort or trigger an ensemble.
 *  - goalHint: an optional quality / cost / latency preference surfaced by the
 *    text. It is a *hint only* — it never overrides the user's explicit
 *    modelGov.optimizationGoal.
 *
 * Everything here is pure and deterministic (no network), so it is directly
 * unit-testable with synthetic requests.
 */
import type { CompletionRequest, Modality } from '../types/agent.js';
import { detectInputModalities } from './modality-bridge.js';

export type TaskDifficulty = 'low' | 'medium' | 'high';
export type TaskGoalHint = 'quality' | 'cost' | 'latency';

export interface TaskClassification {
  /** Input modalities the request genuinely requires (attachments + explicit cues). */
  requiredModalities: Modality[];
  isCoding: boolean;
  isReasoning: boolean;
  isVision: boolean;
  isCreative: boolean;
  isAudio: boolean;
  is3D: boolean;
  difficulty: TaskDifficulty;
  /** Optional optimization preference read from the text; never forced onto scoring. */
  goalHint?: TaskGoalHint;
}

// Refined signal lists. Word-boundary anchored where a substring match would
// false-positive (e.g. "java" must not match "javascript"; "write" alone is
// excluded so "write a poem" is not misread as coding).
const CODING_RE = /\b(code|function|method|class|script|snippet|bug|debug|refactor|compile|regex|json|html|css|javascript|typescript|python|java\b|c\+\+|sql|api|stack ?trace|algorithm|implement|unit ?test|pytest|rust|kotlin|swift|bash|shell script|variable|loop|array|dependency|import)\b/i;
const REASONING_RE = /\b(analyze|analyse|solve|logic|math|mathematics|proof|derive|deduce|reason|plan|why|explain|compare|evaluate|hypothesis|optimi[sz]e|complexity|trade[- ]?off|estimate|calculate|probability|theorem|step[- ]?by[- ]?step)\b/i;
const VISION_RE = /\b(image|picture|photo|video|frame|canvas|screenshot|png|jpe?g|svg|draw|diagram|chart|figure|look at|see this|what'?s in|what is in|describe this)\b/i;
const CREATIVE_RE = /\b(poem|story|song|lyrics|novel|fiction|haiku|sonnet|brainstorm|tagline|marketing copy|creative writing|come up with ideas|name ideas|script for a)\b/i;
const AUDIO_RE = /\b(audio|mp3|wav|voice|speech|podcast|transcri|spoken|voice ?memo|sound clip)\b/i;
const THREE_D_RE = /\b(3d|three[- ]?dimensional|stl|obj file|blender|mesh|3d model|cad|render a model)\b/i;

const QUALITY_RE = /\b(best|carefully|thorough|detailed|high quality|expert|accurate|precise|comprehensive|in[- ]?depth)\b/i;
const LATENCY_RE = /\b(quick|fast|asap|immediately|brief|short answer|tl;dr|speed)\b/i;
const COST_RE = /\b(cheap|free|low cost|minimal|small model|cheapest)\b/i;

const HIGH_DIFFICULTY_RE = /\b(complex|complicated|hard|difficult|multiple steps|in detail|thorough|comprehensive|prove|design a system|architecture|scalable|production[- ]?ready)\b/i;

/**
 * Builds a minimal CompletionRequest from a plain prompt (and optional
 * attachment URLs) so callers that only have text can still feed the
 * modality-aware classifier. Attachment strings become image_url blocks so
 * `detectInputModalities` observes them.
 */
export function buildRequest(prompt: string, attachments?: string[]): CompletionRequest {
  const content: CompletionRequest['messages'][number]['content'] = attachments && attachments.length > 0
    ? [
        { type: 'text', text: prompt },
        ...attachments.map((url) => ({ type: 'image_url' as const, image_url: { url } }))
      ]
    : prompt;
  return { messages: [{ role: 'user', content }] };
}

/**
 * Classifies a request into routing signals. Pure — callers may pass either a
 * real request (with attachments) or one built by {@link buildRequest}.
 */
export function classifyTask(request: CompletionRequest): TaskClassification {
  const text = lastText(request).toLowerCase();
  const requiredModalities = detectInputModalities(request);

  const isCoding = CODING_RE.test(text);
  // Creative writing is only claimed when the prompt is *not* already a coding
  // task, so "write code" never collides with "write a poem".
  const isCreative = !isCoding && CREATIVE_RE.test(text);
  const isReasoning = REASONING_RE.test(text);
  const isVision = VISION_RE.test(text) || requiredModalities.some((m) => m === 'image' || m === 'video');
  const isAudio = AUDIO_RE.test(text) || requiredModalities.some((m) => m === 'audio');
  const is3D = THREE_D_RE.test(text);

  let goalHint: TaskGoalHint | undefined;
  if (QUALITY_RE.test(text)) goalHint = 'quality';
  else if (LATENCY_RE.test(text)) goalHint = 'latency';
  else if (COST_RE.test(text)) goalHint = 'cost';

  const difficulty = estimateDifficulty(text, isCoding, isReasoning);

  return {
    requiredModalities,
    isCoding,
    isReasoning,
    isVision,
    isCreative,
    isAudio,
    is3D,
    difficulty,
    goalHint
  };
}

function lastText(request: CompletionRequest): string {
  let text = '';
  for (const m of request.messages) {
    if (m.role !== 'user') continue;
    text = Array.isArray(m.content)
      ? m.content.map((b) => (b.type === 'text' ? b.text : '')).join(' ')
      : m.content;
  }
  return text;
}

function estimateDifficulty(text: string, isCoding: boolean, isReasoning: boolean): TaskDifficulty {
  const words = text.trim().length;
  if (HIGH_DIFFICULTY_RE.test(text) || words > 600 || (isCoding && (text.includes('```') || text.split('```').length > 2))) {
    return 'high';
  }
  if (words < 60 && !isCoding && !isReasoning) return 'low';
  return 'medium';
}
