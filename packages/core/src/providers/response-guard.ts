/**
 * response-guard.ts
 *
 * Lightweight, zero-cost (no LLM call) post-processing guard that detects
 * "context escape" — a model response that clearly failed to engage with what
 * the user actually asked.
 *
 * Detection is pure string-matching so it adds ~0 ms latency and works on
 * every provider path equally.
 */

/** Patterns that indicate the model gave a generic, off-topic greeting response. */
const GENERIC_GREETING_RE = /^(hello[!.,]?\s*|hi[!.,]?\s*|hey[!.,]?\s*|hi there[!.,]?\s*|greetings[!.,]?\s*|good (morning|afternoon|evening)[!.,]?\s*)?(how can i (help|assist) you( today)?[?!.]?|what can i (help|do) for you[?!.]?|i'?m here to help[.!]?|how may i (help|assist) you[?!.]?|what can i assist you with[?!.]?)/i;

/** Interrogative patterns that signal the user asked a real question. */
const QUESTION_SIGNAL_RE = /\b(what|where|when|how|why|who|which|show|list|tell|give|explain|describe|find|is there|are there|do you|have you|can you|could you|whats|what's)\b/i;

export interface GuardResult {
  /** True when the response was flagged as out-of-context / a generic greeting. */
  isOffTopic: boolean;
  /** The (possibly replaced) reply to return to the caller. */
  reply: string;
  /** Human-readable reason for flagging, for logging/debugging. */
  reason?: string;
}

/**
 * Inspects an LLM reply and returns whether it is off-topic given the user's
 * original prompt. When off-topic, `reply` is replaced with an honest fallback.
 *
 * @param userPrompt  The original user message sent to the LLM.
 * @param assistantReply  The raw text the LLM returned.
 * @returns A `GuardResult` — always check `result.reply` instead of the raw reply.
 */
export function guardResponse(userPrompt: string, assistantReply: string): GuardResult {
  const trimmedReply = assistantReply.trim();
  const userAskedQuestion = QUESTION_SIGNAL_RE.test(userPrompt);

  // Gate 1: Reply is a generic greeting AND user asked a real question.
  if (userAskedQuestion && GENERIC_GREETING_RE.test(trimmedReply)) {
    return {
      isOffTopic: true,
      reply: buildFallbackReply(userPrompt),
      reason: 'Generic greeting returned for a specific question.'
    };
  }

  // Gate 2: Reply is suspiciously short for a substantive question.
  const trimmedPrompt = userPrompt.trim();
  if (userAskedQuestion && trimmedReply.length < 20 && trimmedPrompt.length > 15) {
    return {
      isOffTopic: true,
      reply: buildFallbackReply(userPrompt),
      reason: `Reply too short (${trimmedReply.length} chars) for a ${trimmedPrompt.length}-char question.`
    };
  }

  // Gate 3: Reply shares no keywords with the user's prompt (for questions ≥ 4 words).
  const promptWords = extractKeywords(userPrompt);
  if (userAskedQuestion && promptWords.size >= 4) {
    const replyLower = trimmedReply.toLowerCase();
    const overlap = [...promptWords].filter(w => replyLower.includes(w));
    if (overlap.length === 0) {
      return {
        isOffTopic: true,
        reply: buildFallbackReply(userPrompt),
        reason: `Reply shares no keywords with the user prompt (prompt keywords: ${[...promptWords].join(', ')}).`
      };
    }
  }

  return { isOffTopic: false, reply: assistantReply };
}

/** Extracts meaningful (non-stopword) lowercase words from a string. */
function extractKeywords(text: string): Set<string> {
  const STOP_WORDS = new Set([
    'a','an','the','is','in','it','of','on','to','and','or','my','me','i','you',
    'do','what','how','why','where','when','who','which','be','are','was','were',
    'have','has','had','can','could','will','would','should','shall','may','might',
    'does','did','with','for','at','by','from','up','out','if','then','that','this',
    'whats','please','just','so','not','no','yes'
  ]);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

/**
 * Builds a helpful fallback reply when the guard fires. It's honest about
 * what happened rather than pretending the model answered correctly.
 */
function buildFallbackReply(userPrompt: string): string {
  const trimmed = userPrompt.trim();
  // Memory-related queries get a more specific message
  if (/\b(memory|remember|recall|notes|stored|context|whats in my|what is in my)\b/i.test(trimmed)) {
    return "I don't have any stored memory or project notes to show you for this session. Memory contents would appear here once items have been saved to your project context.";
  }
  return "I wasn't able to generate a relevant response to your question. Could you rephrase or provide more detail about what you're looking for?";
}
