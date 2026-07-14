import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseDataUrl,
  toOpenAIMessages,
  toAnthropicMessages,
  contentToText
} from '../src/providers/multimodal.js';
import { AgentEngine } from '../src/providers/ai-engine.js';
import { ChatMessage, ImageAttachment } from '../src/types/agent.js';

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

describe('parseDataUrl', () => {
  it('extracts media type and payload from a data URL', () => {
    const parsed = parseDataUrl(DATA_URL);
    expect(parsed).not.toBeNull();
    expect(parsed?.mediaType).toBe('image/png');
    expect(parsed?.data).toBe('iVBORw0KGgo=');
  });

  it('returns null for non-data URLs', () => {
    expect(parseDataUrl('https://example.com/a.png')).toBeNull();
  });
});

describe('contentToText', () => {
  it('returns strings unchanged', () => {
    expect(contentToText('hello')).toBe('hello');
  });

  it('flattens text blocks and drops images', () => {
    const content: ChatMessage['content'] = [
      { type: 'text', text: 'first' },
      { type: 'image_url', image_url: { url: DATA_URL } },
      { type: 'text', text: 'second' }
    ];
    expect(contentToText(content)).toBe('first\nsecond');
  });
});

describe('toOpenAIMessages', () => {
  it('passes multimodal content blocks through unchanged', () => {
    const history: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe' },
          { type: 'image_url', image_url: { url: DATA_URL } }
        ]
      }
    ];
    const messages = toOpenAIMessages(history);
    expect(messages[1].role).toBe('user');
    expect(Array.isArray(messages[1].content)).toBe(true);
    const blocks = messages[1].content as Array<{ type: string }>;
    expect(blocks.some((b) => b.type === 'image_url')).toBe(true);
  });

  it('round-trips plain string content', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'just text' },
      { role: 'tool', content: 'tool out', toolCallId: 'c1' }
    ];
    const messages = toOpenAIMessages(history);
    expect(messages[0].content).toBe('just text');
    expect((messages[1] as { tool_call_id?: string }).tool_call_id).toBe('c1');
  });
});

describe('toAnthropicMessages', () => {
  it('separates system and converts image data URLs to source blocks', () => {
    const history: ChatMessage[] = [
      { role: 'system', content: 'sys prompt' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe' },
          { type: 'image_url', image_url: { url: DATA_URL } }
        ]
      }
    ];
    const { systemPrompt, messages } = toAnthropicMessages(history);
    expect(systemPrompt).toBe('sys prompt');
    expect(messages[0].role).toBe('user');
    const blocks = messages[0].content as Array<Record<string, unknown>>;
    const imageBlock = blocks.find((b) => b.type === 'image');
    expect(imageBlock).toBeDefined();
    expect(imageBlock?.source).toEqual({
      type: 'base64',
      media_type: 'image/png',
      data: 'iVBORw0KGgo='
    });
  });

  it('encodes tool messages as tool_result blocks', () => {
    const history: ChatMessage[] = [{ role: 'tool', content: 'result', toolCallId: 't1' }];
    const { systemPrompt, messages } = toAnthropicMessages(history);
    expect(systemPrompt).toBeUndefined();
    const blocks = messages[0].content as Array<Record<string, unknown>>;
    expect(blocks[0].type).toBe('tool_result');
    expect(blocks[0].tool_use_id).toBe('t1');
  });
});

describe('AgentEngine.run with attachments', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('embeds image attachments as image_url blocks in the outgoing request', async () => {
    let captured: any = null;
    vi.stubGlobal(
      'fetch',
      (async (_url: string, init: any) => {
        captured = JSON.parse(init.body);
        const encoder = new TextEncoder();
        const buf = encoder.encode(
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'
        );
        let pos = 0;
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => {
                if (pos >= buf.length) return { done: true, value: undefined };
                const v = buf.subarray(pos);
                pos = buf.length;
                return { done: false, value: v };
              }
            })
          }
        };
      }) as any
    );

    const engine = new AgentEngine({ provider: 'openai', apiKey: 'x', model: 'gpt-4o' });
    const att: ImageAttachment = {
      path: '/tmp/x.png',
      mediaType: 'image/png',
      dataUrl: DATA_URL,
      size: 12
    };
    await engine.run('describe this', () => {}, [att]);

    expect(captured).not.toBeNull();
    const userMsg = captured.messages.find(
      (m: any) => m.role === 'user' && Array.isArray(m.content)
    );
    expect(userMsg).toBeDefined();
    expect(userMsg.content.some((b: any) => b.type === 'image_url')).toBe(true);
  });
});
