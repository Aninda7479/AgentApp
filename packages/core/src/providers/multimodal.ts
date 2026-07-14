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
  content: string | ContentBlock[];
  name?: string;
  tool_call_id?: string;
}

/** Convert engine history into OpenAI chat messages (arrays pass through). */
export function toOpenAIMessages(history: ChatMessage[]): OpenAIMessage[] {
  return history.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.name ? { name: m.name } : {}),
    ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {})
  }));
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
    } else {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: toAnthropicContent(msg.content)
      });
    }
  }

  return { systemPrompt, messages };
}
