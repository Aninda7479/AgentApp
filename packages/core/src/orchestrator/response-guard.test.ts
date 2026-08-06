import { describe, it, expect } from 'vitest';
import { guardResponse } from '../providers/response-guard.js';

describe('guardResponse — off-topic detection', () => {
  it('flags a generic greeting when the user asked a specific question', () => {
    const result = guardResponse(
      'whats in my memory',
      'Hello! How can I help you today?'
    );
    expect(result.isOffTopic).toBe(true);
    expect(result.reply).not.toContain('Hello! How can I help you today?');
  });

  it('flags a generic greeting variant when user asked a question', () => {
    const result = guardResponse(
      'what do you remember about my project?',
      'Hi there! How may I assist you?'
    );
    expect(result.isOffTopic).toBe(true);
  });

  it('does NOT flag a relevant reply as off-topic', () => {
    const result = guardResponse(
      'whats in my memory',
      'Your memory is currently empty. No project notes or context have been stored in this session.'
    );
    expect(result.isOffTopic).toBe(false);
    expect(result.reply).toContain('memory');
  });

  it('flags an extremely short reply to a substantive question', () => {
    const result = guardResponse('how do I set up authentication?', 'Sure!');
    expect(result.isOffTopic).toBe(true);
  });

  it('does NOT flag a short reply to a short non-question message', () => {
    // "hello" is not a question, so a short reply is fine
    const result = guardResponse('hello', 'Hi! How can I help?');
    expect(result.isOffTopic).toBe(false);
  });

  it('provides a memory-specific fallback for memory queries', () => {
    const result = guardResponse(
      'whats in my memory',
      'Hello! How can I help you today?'
    );
    expect(result.reply).toMatch(/memory|stored|session/i);
  });

  it('does NOT flag a genuinely helpful coding answer', () => {
    const result = guardResponse(
      'how do I write a function in TypeScript?',
      'In TypeScript, you define a function using the `function` keyword or arrow syntax.\n\n```typescript\nfunction greet(name: string): string {\n  return `Hello, ${name}`;\n}\n```'
    );
    expect(result.isOffTopic).toBe(false);
  });

  it('flags a reply with no keyword overlap with the prompt question', () => {
    const result = guardResponse(
      'list all the files in my project directory',
      'I am here to assist you with any questions you may have.'
    );
    expect(result.isOffTopic).toBe(true);
  });
});
