import { describe, it, expect } from 'vitest';
import { toOpenAIMessages, toAnthropicMessages } from './multimodal.js';
import type { ChatMessage } from '../types/agent.js';

function baseHistory(): ChatMessage[] {
  return [
    { role: 'system', content: 'You are a helpful agent.' },
    { role: 'user', content: 'open the page' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'call_1', toolName: 'browser_navigate', args: { url: 'https://x.com' }, status: 'completed' }]
    },
    { role: 'tool', content: 'Navigated to https://x.com', toolCallId: 'call_1', name: 'browser_navigate' },
    { role: 'assistant', content: 'Done.' }
  ];
}

describe('toOpenAIMessages — tool-call pairing', () => {
  it('emits tool_calls on the assistant turn and tool_call_id on the tool turn', () => {
    const out = toOpenAIMessages(baseHistory());
    const assistantWithTool = out.find((m) => (m as any).tool_calls);
    const toolMsg = out.find((m) => m.role === 'tool');

    expect(assistantWithTool).toBeDefined();
    expect((assistantWithTool as any).tool_calls).toEqual([
      { id: 'call_1', type: 'function', function: { name: 'browser_navigate', arguments: JSON.stringify({ url: 'https://x.com' }) } }
    ]);
    expect(toolMsg).toBeDefined();
    expect((toolMsg as any).tool_call_id).toBe('call_1');
    expect((toolMsg as any).content).toBe('Navigated to https://x.com');
  });

  it('keeps plain assistant/user messages untouched', () => {
    const out = toOpenAIMessages(baseHistory());
    const done = out.find((m) => m.content === 'Done.');
    expect(done?.role).toBe('assistant');
    expect((done as any).tool_calls).toBeUndefined();
  });
});

describe('toAnthropicMessages — tool_use blocks', () => {
  it('converts assistant tool calls into tool_use content blocks', () => {
    const { messages } = toAnthropicMessages(baseHistory());
    const assistantTurn = messages.find(
      (m) => Array.isArray(m.content) && (m.content as any[]).some((b) => b.type === 'tool_use')
    );
    expect(assistantTurn).toBeDefined();
    const block = ((assistantTurn as any).content as any[]).find((b) => b.type === 'tool_use');
    expect(block.id).toBe('call_1');
    expect(block.name).toBe('browser_navigate');
    expect(block.input).toEqual({ url: 'https://x.com' });
  });

  it('converts tool results into tool_result blocks', () => {
    const { messages } = toAnthropicMessages(baseHistory());
    const toolTurn = messages.find(
      (m) => Array.isArray(m.content) && (m.content as any[]).some((b) => b.type === 'tool_result')
    );
    expect(toolTurn?.role).toBe('user');
    const block = ((toolTurn as any).content as any[]).find((b) => b.type === 'tool_result');
    expect(block.tool_use_id).toBe('call_1');
    expect(block.content).toBe('Navigated to https://x.com');
  });
});
