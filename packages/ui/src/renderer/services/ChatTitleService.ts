/**
 * ChatTitleService — Generates concise, human-friendly chat titles
 * from user prompts and first assistant responses.
 */

import { IpcBridge } from '../core/ipc';

export class ChatTitleService {
  /**
   * Determines if a chat title is a generic default placeholder
   * that should be replaced with an auto-generated title.
   */
  static isPlaceholderTitle(title?: string | null): boolean {
    if (!title || !title.trim()) return true;
    const t = title.trim();
    return (
      t === 'Standalone Chat' ||
      t === 'New Chat' ||
      t === 'Untitled Chat' ||
      t === 'Active Session' ||
      t.startsWith('Chat in ') ||
      t.startsWith('New chat in ') ||
      /^Agent \d+$/i.test(t) ||
      /^Chat \d+$/i.test(t)
    );
  }

  /**
   * Generates a concise title (3-6 words, max 32 characters)
   * from the user prompt and optional first assistant response.
   */
  static generateTitle(prompt: string, response?: string): string {
    const cleanPrompt = (prompt || '').trim();
    if (!cleanPrompt && !response) return 'New Chat';

    // 1. Handle short greetings and one-word hellos
    const lowerPrompt = cleanPrompt.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const greetings = ['he', 'hi', 'hello', 'hey', 'yo', 'sup', 'howdy', 'hola', 'good morning', 'good evening', 'good afternoon'];
    if (greetings.includes(lowerPrompt)) {
      if (response && response.length > 20) {
        const lowerResp = response.toLowerCase();
        if (lowerResp.includes('assist') || lowerResp.includes('help')) {
          return 'Greeting & Assistance';
        }
      }
      return 'Greeting';
    }

    // 2. Strip code fences, system prefixes, and slash commands
    let text = cleanPrompt
      .replace(/```[\s\S]*?```/g, '') // remove code blocks
      .replace(/^(\/[a-zA-Z0-9_-]+\s*)+/, '') // remove slash commands e.g. /ask
      .replace(/[#*`_~]/g, '') // remove markdown symbols
      .replace(/\s+/g, ' ')
      .trim();

    // 3. Iteratively strip common introductory boilerplate patterns
    const introPatterns = [
      /^(please\s+)?(can|could|would)\s+you\s+(please\s+)?(help\s+me\s+)?(to\s+)?/i,
      /^(please\s+)?(tell|explain|show|describe)(\s+(to\s+)?me)?\s+/i,
      /^(i\s+want\s+to|i\s+need\s+to|how\s+do\s+i|how\s+to|how\s+can\s+i)\s+/i,
      /^(what\s+is|what\s+are|what's|where\s+is)\s+/i,
      /^(write|create|build|generate|make|implement)\s+(a|an|the)?\s+/i,
      /^(give\s+me\s+(a|an)?)\s+/i,
    ];

    let stripped = text;
    let matched = true;
    while (matched) {
      matched = false;
      for (const pattern of introPatterns) {
        if (pattern.test(stripped)) {
          stripped = stripped.replace(pattern, '').trim();
          matched = true;
          break;
        }
      }
    }

    // If stripped text is too short, fall back to the original text
    const candidate = (stripped.length >= 3 ? stripped : text) || cleanPrompt;

    // 4. Split into words and select 3-6 keywords
    const words = candidate.split(/\s+/).filter(Boolean);
    const selectedWords: string[] = [];
    let totalLen = 0;

    for (const word of words) {
      if (selectedWords.length >= 6 || (totalLen + word.length > 32 && selectedWords.length >= 2)) {
        break;
      }
      selectedWords.push(word);
      totalLen += word.length + 1;
    }

    // Strip trailing dangling prepositions/conjunctions
    while (
      selectedWords.length > 1 &&
      /^(a|an|and|as|at|but|by|for|in|nor|of|on|or|per|the|to|via|with)$/i.test(
        selectedWords[selectedWords.length - 1]
      )
    ) {
      selectedWords.pop();
    }

    let title = selectedWords.join(' ');
    // Remove trailing punctuation
    title = title.replace(/[:;,?.!]+$/, '').trim();

    // 5. Convert to Title Case
    title = title
      .split(' ')
      .map((w, idx) => {
        if (
          idx > 0 &&
          /^(a|an|and|as|at|but|by|for|in|nor|of|on|or|per|the|to|via|with)$/i.test(w)
        ) {
          return w.toLowerCase();
        }
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ');

    if (!title) {
      title = cleanPrompt.slice(0, 25).trim();
    }

    return title.length > 32 ? title.slice(0, 32).trim() + '...' : title;
  }

  /**
   * Cleans, formats, and validates a title string returned by an LLM model.
   * Strips reasoning blocks, prefixes like "Title:", enclosing quotes/markdown,
   * converts to Title Case, and caps cleanly at 32 characters.
   */
  static cleanModelTitle(rawTitle: string): string {
    if (!rawTitle || !rawTitle.trim()) return '';

    let text = rawTitle.trim();

    // Strip reasoning blocks if model returned <think>...</think>
    if (text.includes('</think>')) {
      text = text.slice(text.lastIndexOf('</think>') + '</think>'.length).trim();
    }

    // Strip common model prefixes
    const prefixes = [
      /^title\s*:\s*/i,
      /^chat\s*title\s*:\s*/i,
      /^suggested\s*title\s*:\s*/i,
      /^topic\s*:\s*/i,
      /^here\s+is\s+a\s+title\s*:\s*/i,
    ];
    for (const prefix of prefixes) {
      if (prefix.test(text)) {
        text = text.replace(prefix, '').trim();
      }
    }

    // Strip markdown formatting, surrounding quotes, and backticks
    text = text
      .replace(/^[`"'\u201C\u201D\u2018\u2019*#]+/, '')
      .replace(/[`"'\u201C\u201D\u2018\u2019*#]+$/, '')
      .replace(/[:;,?.!]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text || text.length < 2) return '';

    // Split into words and cap to max 32 chars without breaking mid-word
    const words = text.split(/\s+/).filter(Boolean);
    const selectedWords: string[] = [];
    let totalLen = 0;

    for (const word of words) {
      if (selectedWords.length >= 6 || (totalLen + word.length > 30 && selectedWords.length >= 2)) {
        break;
      }
      selectedWords.push(word);
      totalLen += word.length + 1;
    }

    // Strip trailing prepositions/conjunctions
    while (
      selectedWords.length > 1 &&
      /^(a|an|and|as|at|but|by|for|in|nor|of|on|or|per|the|to|via|with)$/i.test(
        selectedWords[selectedWords.length - 1]
      )
    ) {
      selectedWords.pop();
    }

    let title = selectedWords.join(' ');
    title = title.replace(/[:;,?.!]+$/, '').trim();

    // Convert to Title Case
    title = title
      .split(' ')
      .map((w, idx) => {
        if (
          idx > 0 &&
          /^(a|an|and|as|at|but|by|for|in|nor|of|on|or|per|the|to|via|with)$/i.test(w)
        ) {
          return w.toLowerCase();
        }
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ');

    if (title.length > 32) {
      title = title.slice(0, 32).trim();
    }

    return title;
  }

  /**
   * Calls the selected model to generate a concise chat title.
   * If the model call fails, times out, or returns an empty title,
   * falls back gracefully to `generateTitle(prompt, response)`.
   */
  static async generateTitleWithModel(
    prompt: string,
    response?: string,
    options?: {
      model?: string;
      provider?: string;
      apiKey?: string;
      baseUrl?: string;
    }
  ): Promise<string> {
    const cleanPrompt = (prompt || '').trim();
    if (!cleanPrompt) return 'New Chat';

    try {
      const res = await IpcBridge.generateChatTitle({
        prompt: cleanPrompt,
        response,
        model: options?.model,
        provider: options?.provider,
        apiKey: options?.apiKey,
        baseUrl: options?.baseUrl,
      });

      if (res && res.title) {
        const cleaned = ChatTitleService.cleanModelTitle(res.title);
        if (cleaned && cleaned.length >= 2) {
          return cleaned;
        }
      }
    } catch {
      // Ignore IPC / model error and fall back gracefully
    }

    // Fallback to rule-based generation
    return ChatTitleService.generateTitle(cleanPrompt, response);
  }
}
