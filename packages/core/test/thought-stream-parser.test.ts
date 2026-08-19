import { describe, it, expect } from 'vitest';
import { ThoughtStreamParser, extractThoughtAndAnswer } from '../src/providers/ai-engine-helpers.js';

describe('ThoughtStreamParser', () => {
  it('separates <think> tags from answer in a single chunk', () => {
    const tokens: string[] = [];
    const thoughts: string[] = [];

    const parser = new ThoughtStreamParser(
      (t) => tokens.push(t),
      (th) => thoughts.push(th)
    );

    parser.push('<think>\nLet us analyze step by step.\n</think>\n\nFinal answer is 42.');
    parser.flush();

    expect(thoughts.join('')).toContain('Let us analyze step by step.');
    expect(tokens.join('')).toBe('\n\nFinal answer is 42.');
  });

  it('handles token-by-token stream with split tags', () => {
    const tokens: string[] = [];
    const thoughts: string[] = [];

    const parser = new ThoughtStreamParser(
      (t) => tokens.push(t),
      (th) => thoughts.push(th)
    );

    const chunks = ['<', 'th', 'ink>', 'Step 1: check domain.', ' </', 'th', 'ink>', 'The result is ', 'Ex[Ay[P(x)]]'];
    for (const chunk of chunks) {
      parser.push(chunk);
    }
    parser.flush();

    expect(thoughts.join('')).toBe('Step 1: check domain. ');
    expect(tokens.join('')).toBe('The result is Ex[Ay[P(x)]]');
  });

  it('passes regular text without think tags through untouched', () => {
    const tokens: string[] = [];
    const thoughts: string[] = [];

    const parser = new ThoughtStreamParser(
      (t) => tokens.push(t),
      (th) => thoughts.push(th)
    );

    parser.push('Hello! If x < 5 and y < 10, then x + y < 15.');
    parser.flush();

    expect(thoughts.length).toBe(0);
    expect(tokens.join('')).toBe('Hello! If x < 5 and y < 10, then x + y < 15.');
  });

  it('handles unclosed <think> tag at stream end', () => {
    const tokens: string[] = [];
    const thoughts: string[] = [];

    const parser = new ThoughtStreamParser(
      (t) => tokens.push(t),
      (th) => thoughts.push(th)
    );

    parser.push('<think>Thinking underway...');
    parser.flush();

    expect(thoughts.join('')).toBe('Thinking underway...');
    expect(tokens.length).toBe(0);
  });
});

describe('extractThoughtAndAnswer', () => {
  it('extracts thought and clean answer from static text', () => {
    const input = '<think>\nReviewing constraints.\n</think>\n\nEx[Ay[(P(x)^~R(x,y))]]';
    const result = extractThoughtAndAnswer(input);
    expect(result.thought).toBe('Reviewing constraints.');
    expect(result.answer).toBe('Ex[Ay[(P(x)^~R(x,y))]]');
  });
});
