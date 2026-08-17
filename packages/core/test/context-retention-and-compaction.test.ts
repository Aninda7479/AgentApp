import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AgentEngine } from '../src/providers/ai-engine.js';
import { MessageHistoryStore, stepsToChatMessages } from '../src/storage/message-history.js';
import { formatTokensLimit } from '../src/providers/autodetect.js';

describe('Context Retention, Auto-Compaction & Model Switching', () => {
  const testSessionId = `test-ctx-${Date.now()}`;
  let tempUserDir: string;

  beforeEach(() => {
    tempUserDir = path.join(os.tmpdir(), `superagent-test-${Date.now()}`);
    process.env.SUPERAGENT_DATA_DIR = tempUserDir;
  });

  afterEach(async () => {
    await MessageHistoryStore.clear(testSessionId);
    if (fs.existsSync(tempUserDir)) {
      try {
        fs.rmSync(tempUserDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('formatTokensLimit accurately formats numeric token counts to human strings', () => {
    expect(formatTokensLimit(2000000)).toBe('2M');
    expect(formatTokensLimit(1048576)).toBe('1.0M');
    expect(formatTokensLimit(128000)).toBe('128k');
    expect(formatTokensLimit(64000)).toBe('64k');
    expect(formatTokensLimit(8192)).toBe('8.2k');
    expect(formatTokensLimit(undefined)).toBeUndefined();
    expect(formatTokensLimit(0)).toBeUndefined();
  });

  it('stepsToChatMessages reconstructs LLM messages and ignores internal UI progression steps', () => {
    const steps = [
      { id: '1', type: 'user', content: 'send me a message in telegram' },
      { id: '2', type: 'thought', content: 'Thinking about how to send telegram message...' },
      { id: '3', type: 'status', content: 'Connecting to Telegram...' },
      {
        id: '4',
        type: 'assistant',
        content: 'I will send the message.',
        metadata: { toolCalls: [{ toolName: 'telegram_send', args: { msg: 'hi' } }] }
      },
      { id: '5', type: 'tool_result', toolName: 'telegram_send', content: 'Message sent successfully.' },
      { id: '6', type: 'assistant', content: 'Done!' }
    ];

    const messages = stepsToChatMessages(steps);
    expect(messages).toHaveLength(4);
    expect(messages[0]).toEqual({ role: 'user', content: 'send me a message in telegram' });
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].toolCalls).toBeDefined();
    expect(messages[2]).toEqual({
      role: 'tool',
      content: 'Message sent successfully.',
      toolCallId: '5',
      name: 'telegram_send'
    });
    expect(messages[3]).toEqual({ role: 'assistant', content: 'Done!' });
  });

  it('AgentEngine initializes with single system prompt and does not pre-populate MessageHistoryStore', async () => {
    const engine = new AgentEngine(
      {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key'
      },
      testSessionId
    );

    const history = (engine as any).history;
    expect(history.length).toBe(1);
    expect(history[0].role).toBe('system');

    // On-disk history store should not have system prompt appended yet
    const stored = await MessageHistoryStore.loadFull(testSessionId);
    expect(stored.length).toBe(0);
  });

  it('AgentEngine auto-rehydrates prior conversation history from store across fresh instances', async () => {
    // 1. First engine writes turn 1
    const engine1 = new AgentEngine(
      {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key'
      },
      testSessionId
    );

    (engine1 as any).addUserMessage('send me a message in telegram');
    (engine1 as any).record({ role: 'assistant', content: 'I have dispatched the message to telegram.' });
    await MessageHistoryStore.flush(testSessionId);

    // 2. Second engine is created for the same session (simulating restart / fresh turn)
    const engine2 = new AgentEngine(
      {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key'
      },
      testSessionId
    );

    await engine2.rehydrateFromStore();
    const history2 = (engine2 as any).history;

    // Should have active system prompt + previous user turn + previous assistant turn
    expect(history2.length).toBe(3);
    expect(history2[0].role).toBe('system');
    expect(history2[1].role).toBe('user');
    expect(history2[1].content).toBe('send me a message in telegram');
    expect(history2[2].role).toBe('assistant');
    expect(history2[2].content).toBe('I have dispatched the message to telegram.');

    // Now turn 2 adds "continue"
    (engine2 as any).addUserMessage('continue');
    const historyAfterContinue = (engine2 as any).history;
    expect(historyAfterContinue.length).toBe(4);
    expect(historyAfterContinue[3].content).toBe('continue');
  });

  it('AgentEngine.updateConfig dynamically updates contextWindow and rollingCompact adjusts accordingly', async () => {
    const engine = new AgentEngine(
      {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        apiKey: 'test-key',
        contextWindow: 2000000
      },
      testSessionId
    );

    expect((engine as any).contextWindow).toBe(2000000);

    // Populate lots of dialogue turns
    for (let i = 0; i < 10; i++) {
      (engine as any).addUserMessage(`Turn ${i}: ` + 'hello world repeat data '.repeat(50));
      (engine as any).record({ role: 'assistant', content: `Reply ${i}: ` + 'response details '.repeat(50) });
    }

    // Under 2M context window, history is not compacted
    const usageBefore = engine.estimateContextUsage();
    expect((engine as any).history.length).toBe(21); // 1 sys + 20 turns

    // Now user switches mid-chat to DeepSeek (64k) or a small 1k custom window
    engine.updateConfig({
      model: 'deepseek-chat',
      contextWindow: 1000 // force a tight budget to verify auto-compaction
    });

    expect((engine as any).contextWindow).toBe(1000);

    // Running rollingCompact compresses history to fit the new model limit
    const compactResult = (engine as any).rollingCompact();
    expect(compactResult.tokensAfter).toBeLessThan(compactResult.tokensBefore);

    const historyAfter = (engine as any).history;
    // History should now contain the system prompt, the [COMPACTED CONTEXT SUMMARY], and the recent turns
    const hasSummary = historyAfter.some((m: any) =>
      typeof m.content === 'string' && m.content.includes('[COMPACTED CONTEXT SUMMARY]')
    );
    expect(hasSummary).toBe(true);
  });
});
