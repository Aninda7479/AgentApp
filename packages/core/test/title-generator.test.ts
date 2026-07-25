import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateChatName,
  cleanTitle,
  formatLocalTruncatedTitle
} from '../src/providers/title-generator.js';

describe('title-generator module', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('formatLocalTruncatedTitle', () => {
    it('handles empty or whitespace prompts', () => {
      expect(formatLocalTruncatedTitle('', 3)).toBe('New Chat');
      expect(formatLocalTruncatedTitle('   ', 3)).toBe('New Chat');
    });

    it('truncates prompt up to maxWords', () => {
      const prompt = 'How do I build a modern React application with Vite and Tailwind';
      expect(formatLocalTruncatedTitle(prompt, 2)).toBe('How do...');
      expect(formatLocalTruncatedTitle(prompt, 3)).toBe('How do I...');
      expect(formatLocalTruncatedTitle(prompt, 5)).toBe('How do I build a...');
    });

    it('does not append ellipsis for short prompts within length limit', () => {
      expect(formatLocalTruncatedTitle('Hello world', 3)).toBe('Hello world');
    });
  });

  describe('cleanTitle', () => {
    it('removes surrounding quotes and backticks', () => {
      expect(cleanTitle('"React State Management"', 3)).toBe('React State Management');
      expect(cleanTitle("'Python Data Analysis'", 3)).toBe('Python Data Analysis');
      expect(cleanTitle('`Docker Compose Guide`', 3)).toBe('Docker Compose Guide');
      expect(cleanTitle('“Next.js Routing”', 3)).toBe('Next.js Routing');
    });

    it('removes leading labels like Title: or Topic:', () => {
      expect(cleanTitle('Title: Express API Design', 3)).toBe('Express API Design');
      expect(cleanTitle('Chat Title: Rust Memory Safety', 3)).toBe('Rust Memory Safety');
      expect(cleanTitle('Topic: GraphQL Schemas', 3)).toBe('GraphQL Schemas');
    });

    it('removes trailing punctuation', () => {
      expect(cleanTitle('Build a Weather App.', 4)).toBe('Build a Weather App');
      expect(cleanTitle('CSS Flexbox Guide:', 3)).toBe('CSS Flexbox Guide');
    });

    it('restricts length to maxWords', () => {
      expect(cleanTitle('Super Fast Modern Web Application Framework', 3)).toBe(
        'Super Fast Modern'
      );
      expect(cleanTitle('One Two Three Four Five Six', 2)).toBe('One Two');
    });
  });

  describe('generateChatName mode logic', () => {
    it('returns local truncation for disabled mode', async () => {
      const title = await generateChatName(
        'Create a unit test for payment gateway',
        { provider: 'openai', apiKey: 'sk-test' },
        { chatTitle: { mode: 'disabled', maxWords: 3 } }
      );
      expect(title).toBe('Create a unit...');
    });

    it('returns local truncation for simple mode', async () => {
      const title = await generateChatName(
        'Analyze system performance metrics log file',
        { provider: 'openai', apiKey: 'sk-test' },
        { chatTitle: { mode: 'simple', maxWords: 4 } }
      );
      expect(title).toBe('Analyze system performance metrics...');
    });

    it('falls back to local truncation when apiKey is missing in active_model mode', async () => {
      const title = await generateChatName(
        'Refactor authentication system to JWT',
        { provider: 'openai', apiKey: '' },
        { chatTitle: { mode: 'active_model', maxWords: 3 } }
      );
      expect(title).toBe('Refactor authentication system...');
    });

    it('calls OpenAI endpoint for active_model mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '"JWT Auth Refactor."' } }]
        })
      } as Response);

      const title = await generateChatName(
        'Refactor authentication system to JWT',
        { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-123' },
        { chatTitle: { mode: 'active_model', maxWords: 3 } }
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(title).toBe('JWT Auth Refactor');
    });

    it('calls Gemini endpoint for active_model mode when provider is gemini', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Gemini Title Summary' }] } }]
        })
      } as Response);

      const title = await generateChatName(
        'Explore Gemini 2.0 Flash features',
        { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'key-abc' },
        { chatTitle: { mode: 'active_model', maxWords: 3 } }
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(title).toBe('Gemini Title Summary');
    });

    it('calls Anthropic endpoint for active_model mode when provider is anthropic', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ text: 'Claude Code Assistant' }]
        })
      } as Response);

      const title = await generateChatName(
        'Ask Claude about code architecture',
        { provider: 'anthropic', model: 'claude-3-5-sonnet', apiKey: 'sk-ant-123' },
        { chatTitle: { mode: 'active_model', maxWords: 3 } }
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(title).toBe('Claude Code Assistant');
    });

    it('calls Ollama endpoint for active_model mode when provider is ollama', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: 'Ollama Local Chat' }
        })
      } as Response);

      const title = await generateChatName(
        'Run qwen2.5-coder locally via Ollama',
        { provider: 'ollama', model: 'qwen2.5-coder' },
        { chatTitle: { mode: 'active_model', maxWords: 3 } }
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(title).toBe('Ollama Local Chat');
    });

    it('uses dedicated provider and model in custom_model mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Dedicated Fast Summary' } }]
        })
      } as Response);

      const title = await generateChatName(
        'Build full-stack web application with SQLite database',
        { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-main' },
        {
          chatTitle: {
            mode: 'custom_model',
            providerId: 'groq',
            model: 'llama-3.1-8b',
            maxWords: 3
          },
          providers: [
            { id: 'groq', name: 'Groq', type: 'key', apiKey: 'gsk-123', baseUrl: 'https://api.groq.com/openai/v1' }
          ]
        }
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, req] = (global.fetch as any).mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(req.headers.Authorization).toBe('Bearer gsk-123');
      expect(title).toBe('Dedicated Fast Summary');
    });

    it('falls back gracefully to local truncation on fetch network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const title = await generateChatName(
        'Optimizing SQL database index queries',
        { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-123' },
        { chatTitle: { mode: 'active_model', maxWords: 3 } }
      );

      expect(title).toBe('Optimizing SQL database...');
    });
  });
});
