import { ChatMessage, ContentBlock } from '../types/agent.js';

/** Parsed parts of a `data:image/<ext>;base64,<data>` URL. */
export interface DataUrlParts {
  mediaType: string;
  data: string;
}

/**
 * Parse a `data:image/<ext>;base64,<data>` URL into its media type and base64
 * payload. Returns `null` for non-data URLs (e.g. remote `https:` links).
 */
export function parseDataUrl(url: string): DataUrlParts | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(url.trim());
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

/**
 * OpenAI's Chat Completions API accepts content arrays natively, so this is a
 * pass-through that preserves `string` and `ContentBlock[]` shapes unchanged.
 */
export function toOpenAIContent(content: string | ContentBlock[]): string | ContentBlock[] {
  return content;
}

/** Flatten multimodal content to its text (image blocks are dropped). */
export function contentToText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/**
 * Convert a single message's content into Anthropic's content format.
 * Text stays inline; `image_url` data URLs become Anthropic image source blocks.
 * Remote (non-data) image URLs can't be embedded inline, so they degrade to a
 * text note.
 */
export function toAnthropicContent(content: string | ContentBlock[]): string | Array<Record<string, unknown>> {
  if (typeof content === 'string') return content;
  const blocks: Array<Record<string, unknown>> = [];
  for (const block of content) {
    if (block.type === 'text') {
      blocks.push({ type: 'text', text: block.text });
    } else if (block.type === 'image_url') {
      const parsed = parseDataUrl(block.image_url.url);
      if (parsed) {
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data }
        });
      } else {
        blocks.push({ type: 'text', text: `[image: ${block.image_url.url}]` });
      }
    }
  }
  return blocks;
}

/** Shape emitted for the OpenAI / OpenAI-compatible Chat Completions API. */
export interface OpenAIMessage {
  role: string;
  content: string | ContentBlock[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

/**
 * Strips repetitive token loops from prior assistant messages in history so
 * corrupted turns do not infect subsequent LLM turns.
 */
export function sanitizeRepetitiveContent(text: string): string {
  if (!text || text.length < 30) return text;

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
        const cutoff = text.length - offset - (len * occurrences);
        const cleanText = text.slice(0, Math.max(0, cutoff)).trim();
        return cleanText || text.slice(0, 50);
      }
    }
  }
  return text;
}

/**
 * Convert engine history into OpenAI chat messages. Assistant turns that invoked
 * tools emit their `tool_calls` (so the provider can pair them with the
 * subsequent `tool` messages); plain turns pass through. This pairing is
 * mandatory for OpenAI — an unpaired `tool` message is rejected.
 *
 * Assistant turns are automatically sanitized for token repetition loops so
 * prior corrupted turns do not infect new generation contexts.
 */
export function toOpenAIMessages(history: ChatMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  for (const m of history) {
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const rawContent = typeof m.content === 'string' ? (m.content || null) : m.content;
      const sanitized = typeof rawContent === 'string' ? sanitizeRepetitiveContent(rawContent) : rawContent;
      out.push({
        role: 'assistant',
        content: sanitized,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.toolName, arguments: JSON.stringify(tc.args ?? {}) }
        }))
      });
    } else if (m.role === 'tool') {
      out.push({
        role: 'tool',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        tool_call_id: m.toolCallId || 'unknown'
      });
    } else {
      const rawContent = m.content;
      const sanitized = (m.role === 'assistant' && typeof rawContent === 'string')
        ? sanitizeRepetitiveContent(rawContent)
        : rawContent;
      out.push({
        role: m.role,
        content: sanitized,
        ...(m.name ? { name: m.name } : {})
      });
    }
  }
  return out;
}

/** Shape emitted for the Anthropic Messages API. */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

export interface AnthropicConversation {
  systemPrompt?: string;
  messages: AnthropicMessage[];
}

/**
 * Convert engine history into Anthropic messages. System messages are
 * concatenated into a single `systemPrompt` string; tool messages become
 * `tool_result` blocks (Anthropic requires tools in user turns); images become
 * native image source blocks.
 *
 * Assistant turns are automatically sanitized for token repetition loops so
 * prior corrupted turns do not infect new generation contexts.
 */
export function toAnthropicMessages(history: ChatMessage[]): AnthropicConversation {
  let systemPrompt: string | undefined;
  const messages: AnthropicMessage[] = [];

  for (const msg of history) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : '';
      systemPrompt = systemPrompt ? `${systemPrompt}\n${text}` : text;
    } else if (msg.role === 'tool') {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.toolCallId || 'unknown',
            content: typeof msg.content === 'string' ? msg.content : ''
          }
        ]
      });
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      // Assistant turn that invoked tools: text + tool_use blocks. Anthropic
      // requires the tool_use id to match the later tool_result.
      const blocks: Array<Record<string, unknown>> = [];
      const rawText = typeof msg.content === 'string' ? msg.content : '';
      const text = sanitizeRepetitiveContent(rawText);
      if (text) blocks.push({ type: 'text', text });
      for (const tc of msg.toolCalls) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.toolName,
          input: tc.args ?? {}
        });
      }
      messages.push({ role: 'assistant', content: blocks });
    } else {
      const rawContent = msg.content;
      const sanitizedContent = (msg.role === 'assistant' && typeof rawContent === 'string')
        ? sanitizeRepetitiveContent(rawContent)
        : rawContent;
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: toAnthropicContent(sanitizedContent)
      });
    }
  }

  return { systemPrompt, messages };
}
