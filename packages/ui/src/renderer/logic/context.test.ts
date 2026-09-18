import { describe, it, expect } from 'vitest';
import {
  parseContextLimit,
  estimateTokens,
  getModelPricingRates,
  extractChatSubagents,
  extractChatAttachments,
  extractChatModels,
  computeChatContextStats,
  formatByteSize,
  formatTokenCount,
} from './context';
import type { TrajectoryStep, StoredChat } from './types';

describe('context logic and estimation', () => {
  it('parses context limits correctly', () => {
    expect(parseContextLimit('128k')).toBe(128_000);
    expect(parseContextLimit('1M')).toBe(1_000_000);
    expect(parseContextLimit('200000')).toBe(200_000);
    expect(parseContextLimit(null)).toBeUndefined();
  });

  it('formats token count and byte sizes', () => {
    expect(formatTokenCount(128_000)).toBe('128k');
    expect(formatTokenCount(1_500_000)).toBe('1.5M');
    expect(formatTokenCount(850)).toBe('850');

    expect(formatByteSize(500)).toBe('500 B');
    expect(formatByteSize(45_000)).toBe('43.9 KB');
    expect(formatByteSize(2_500_000)).toBe('2.38 MB');
  });

  it('returns correct model pricing rates matching core_v2', () => {
    expect(getModelPricingRates('ollama', 'llama-3.1')).toEqual({ inputPrice: 0, outputPrice: 0 });
    expect(getModelPricingRates(undefined, 'gpt-4o')).toEqual({ inputPrice: 2.5, outputPrice: 10.0 });
    expect(getModelPricingRates(undefined, 'claude-3-5-sonnet')).toEqual({ inputPrice: 3.0, outputPrice: 15.0 });
    expect(getModelPricingRates(undefined, 'gemini-2.0-flash')).toEqual({ inputPrice: 0.075, outputPrice: 0.3 });
  });

  it('extracts only sub-agents executed in this chat', () => {
    const steps: TrajectoryStep[] = [
      {
        id: 'step-1',
        type: 'user',
        content: 'Please research and fix the bug in authentication.',
      },
      {
        id: 'step-2',
        type: 'tool_call',
        toolName: 'run_subagent',
        content: 'run_subagent({"persona_id":"code-architect","prompt":"Analyze auth store lock"})',
        status: 'success',
        metadata: {
          toolArgs: {
            persona_id: 'code-architect',
            prompt: 'Analyze auth store lock and session expiration',
          },
          result: 'Found potential race condition in lock renewal on line 42.',
          durationMs: 3400,
        },
      },
      {
        id: 'step-3',
        type: 'tool_call',
        toolName: 'read_file',
        content: 'read_file({"path":"src/auth.ts"})',
        status: 'success',
        metadata: {
          result: 'file contents',
        },
      },
      {
        id: 'step-4',
        type: 'assistant',
        content: 'I have delegated the research to the code architect and resolved the bug.',
      },
    ];

    const subagents = extractChatSubagents(steps);
    expect(subagents).toHaveLength(1);
    expect(subagents[0].personaId).toBe('code-architect');
    expect(subagents[0].name).toBe('@code-architect');
    expect(subagents[0].prompt).toBe('Analyze auth store lock and session expiration');
    expect(subagents[0].output).toBe('Found potential race condition in lock renewal on line 42.');
    expect(subagents[0].duration).toBe('3.4s');
    expect(subagents[0].status).toBe('success');
    expect(subagents[0].tokens.total).toBeGreaterThan(0);
  });

  it('extracts attachments from metadata and tool calls', () => {
    const steps: TrajectoryStep[] = [
      {
        id: 'step-1',
        type: 'user',
        content: 'Take a look at this mockup',
        metadata: {
          attachments: [
            {
              name: 'mockup.png',
              path: '/images/mockup.png',
              mediaType: 'image',
              size: 24500,
            },
          ],
        },
      },
      {
        id: 'step-2',
        type: 'tool_call',
        toolName: 'generate_video',
        content: 'Generated intro video',
        metadata: {
          mediaPath: '/output/intro.mp4',
        },
      },
    ];

    const attachments = extractChatAttachments(steps);
    expect(attachments).toHaveLength(2);
    expect(attachments[0].name).toBe('mockup.png');
    expect(attachments[0].mediaType).toBe('image');
    expect(attachments[0].size).toBe(24500);

    expect(attachments[1].name).toBe('intro.mp4');
    expect(attachments[1].mediaType).toBe('video');
  });

  it('computes chat context stats accurately without returning 0% when messages exist', () => {
    const steps: TrajectoryStep[] = [
      {
        id: 'step-1',
        type: 'user',
        content: 'Hello, what is in my memory? Do you know my name?',
      },
      {
        id: 'step-2',
        type: 'thought',
        content: 'Checking memory store for user identification...',
        metadata: { workedDuration: '5s' },
      },
      {
        id: 'step-3',
        type: 'assistant',
        content: "Hey there! Great question — here's the honest truth: I don't have persistent memory across conversations.",
      },
    ];

    const stats = computeChatContextStats(steps, 'gpt-4o', undefined, '128k');

    // Must be greater than zero tokens due to system prompt and message text!
    expect(stats.usedTokens).toBeGreaterThan(1500);
    expect(stats.limitTokens).toBe(128_000);
    expect(stats.pct).toBeGreaterThan(0);
    expect(stats.breakdown.user).toBeGreaterThan(0);
    expect(stats.breakdown.assistant).toBeGreaterThan(0);
    expect(stats.breakdown.system).toBe(1500);

    // Cost calculation
    expect(stats.totalCost).toBeGreaterThan(0);
    expect(stats.mainChatCost).toBeGreaterThan(0);

    // Size calculation
    expect(stats.totalSizeBytes).toBeGreaterThan(0);
    expect(stats.formattedSize).toContain('B');
  });

  it('handles empty steps cleanly', () => {
    const stats = computeChatContextStats([], 'gpt-4o', undefined, '128k');
    expect(stats.usedTokens).toBe(0);
    expect(stats.pct).toBe(0);
    expect(stats.totalCost).toBe(0);
    expect(stats.totalSizeBytes).toBe(0);
    expect(stats.subagents).toHaveLength(0);
    expect(stats.attachments).toHaveLength(0);
    expect(stats.models.displayLabel).toBe('Adaptive');
  });

  it('extracts models adaptively across chat steps', () => {
    const singleModelSteps: TrajectoryStep[] = [
      { id: '1', type: 'user', content: 'hello' },
      { id: '2', type: 'assistant', content: 'hi', model: 'gpt-4o' },
    ];
    const singleInfo = extractChatModels(singleModelSteps);
    expect(singleInfo.distinctModels).toEqual(['gpt-4o']);
    expect(singleInfo.isAdaptive).toBe(false);
    expect(singleInfo.displayLabel).toBe('Adaptive · gpt-4o');

    const multiModelSteps: TrajectoryStep[] = [
      { id: '1', type: 'user', content: 'hello' },
      { id: '2', type: 'assistant', content: 'step 1', model: 'gpt-4o' },
      { id: '3', type: 'assistant', content: 'step 2', model: 'claude-3-5-sonnet' },
    ];
    const multiInfo = extractChatModels(multiModelSteps);
    expect(multiInfo.distinctModels).toEqual(['gpt-4o', 'claude-3-5-sonnet']);
    expect(multiInfo.isAdaptive).toBe(true);
    expect(multiInfo.displayLabel).toBe('Adaptive (2 models)');
  });
});
