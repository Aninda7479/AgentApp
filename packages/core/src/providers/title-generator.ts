import { ChatTitleSettings, ProviderSettings } from '../storage/settings-store.js';
import { resolveProviderFamily, resolveBaseUrl } from './provider-meta.js';
import { buildTitleGeneratorPrompt } from '../prompts/index.js';

export interface GenerateTitleConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  [key: string]: any;
}

export interface GenerateTitleAppSettings {
  chatTitle?: ChatTitleSettings;
  providers?: ProviderSettings[];
  [key: string]: any;
}

/**
 * Fast offline local word-truncation fallback.
 * Takes the first N words of prompt, appends '...' if truncated.
 */
export function formatLocalTruncatedTitle(rawPrompt: string, maxWords: number): string {
  if (!rawPrompt || !rawPrompt.trim()) return 'New Chat';
  const cleanStr = rawPrompt.trim().replace(/^[\s:\-\_\.#=]+/, '');
  const words = cleanStr.split(/\s+/).filter(Boolean);
  const targetCount = Math.max(1, maxWords);
  let title = words.slice(0, targetCount).join(' ');
  title = title.replace(/[:\,\.\;\!\?]+$/, '').trim();
  if (cleanStr.length > 25 && words.length > targetCount) {
    title += '...';
  }
  return title || 'New Chat';
}

/**
 * Cleans, sanitizes, and word-limits an LLM-generated title string.
 */
export function cleanTitle(raw: string, maxWords: number): string {
  if (!raw) return '';
  let text = raw.trim();

  // Strip markdown formatting, surrounding quotes, or backticks
  text = text.replace(/^[`"'\u201C\u201D]+|[`"'\u201C\u201D]+$/g, '').trim();

  // Strip common leading labels like "Title:", "Chat Title:", "Topic:"
  text = text.replace(/^(Title|Chat Title|Topic|Session Title|Summary):\s*/i, '');

  // Strip trailing punctuation (periods, colons, commas, question marks)
  text = text.replace(/[\.\:\;\,\!\?]+$/g, '').trim();

  // Collapse multiple whitespaces
  text = text.replace(/\s+/g, ' ');

  const words = text.split(' ').filter(Boolean);
  if (words.length > maxWords) {
    return words.slice(0, maxWords).join(' ');
  }
  return text;
}

interface FetchTitleOptions {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  prompt: string;
  maxWords: number;
  customPrompt?: string;
}

/**
 * Helper to fetch a title summary from an LLM endpoint with a short timeout.
 * Supports OpenAI-compatible, Anthropic, Gemini, and Ollama APIs.
 */
async function fetchTitleFromLLM(options: FetchTitleOptions): Promise<string> {
  const { provider, model, apiKey, baseUrl, prompt, maxWords, customPrompt } = options;
  const family = resolveProviderFamily(provider);
  const effectiveBaseUrl = resolveBaseUrl(provider, baseUrl);

  const systemMessage = buildTitleGeneratorPrompt(maxWords, customPrompt);
  const userMessage = `Prompt: "${prompt.slice(0, 500)}"`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    let responseText = '';

    if (family === 'gemini') {
      const url = `${effectiveBaseUrl.replace(/\/+$/, '')}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey || '')}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemMessage }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 30, temperature: 0.4 }
        })
      });
      if (!res.ok) throw new Error(`Gemini status ${res.status}`);
      const data = await res.json();
      responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (family === 'anthropic') {
      const cleanUrl = effectiveBaseUrl.replace(/\/+$/, '');
      const url = cleanUrl.endsWith('/v1') ? `${cleanUrl}/messages` : `${cleanUrl}/v1/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey || '',
          'anthropic-version': '2023-06-01'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          system: systemMessage,
          messages: [{ role: 'user', content: userMessage }],
          max_tokens: 30,
          temperature: 0.4
        })
      });
      if (!res.ok) throw new Error(`Anthropic status ${res.status}`);
      const data = await res.json();
      responseText = data?.content?.[0]?.text || '';
    } else if (family === 'ollama') {
      const url = `${effectiveBaseUrl.replace(/\/+$/, '')}/api/chat`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
          ],
          stream: false,
          options: { num_predict: 30, temperature: 0.4 }
        })
      });
      if (!res.ok) throw new Error(`Ollama status ${res.status}`);
      const data = await res.json();
      responseText = data?.message?.content || '';
    } else {
      // Default: OpenAI-compatible (OpenAI, OpenRouter, DeepSeek, Grok, Kimi, etc.)
      const url = `${effectiveBaseUrl.replace(/\/+$/, '')}/chat/completions`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 30,
          temperature: 0.4,
          stream: false
        })
      });
      if (!res.ok) throw new Error(`OpenAI status ${res.status}`);
      const data = await res.json();
      responseText = data?.choices?.[0]?.message?.content || '';
    }

    return cleanTitle(responseText, maxWords);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Main entry point for generating session titles.
 * Respects settings modes:
 *  - 'active_model': Uses session provider/model to summarize title.
 *  - 'custom_model': Uses user-specified provider/model from settings.
 *  - 'simple': Fast offline local truncation (0 latency).
 *  - 'disabled': Returns default truncated fallback.
 */
export async function generateChatName(
  prompt: string,
  config: GenerateTitleConfig = {},
  appSettings: GenerateTitleAppSettings = {}
): Promise<string> {
  const rawPrompt = (prompt || '').trim();
  if (!rawPrompt) return 'New Chat';

  const titleSettings = appSettings?.chatTitle || {};
  const mode = titleSettings.mode || 'active_model';
  const rawMaxWords = titleSettings.maxWords ?? 3;
  const maxWords = Math.min(Math.max(rawMaxWords, 2), 5);

  const localFallback = formatLocalTruncatedTitle(rawPrompt, maxWords);

  if (mode === 'disabled' || mode === 'simple') {
    return localFallback;
  }

  let targetProvider = '';
  let targetModel = '';
  let apiKey = '';
  let baseUrl = '';

  if (mode === 'custom_model') {
    targetProvider = (titleSettings.providerId || '').trim();
    targetModel = (titleSettings.model || '').trim();

    if (!targetProvider || !targetModel) {
      // Fallback to active model if dedicated config is missing
      targetProvider = config.provider || 'openai';
      targetModel = config.model || 'gpt-4o';
      apiKey = config.apiKey || '';
      baseUrl = config.baseUrl || '';
    } else {
      // Look up API key & base URL for targetProvider in user's saved providers
      const savedProviders = appSettings?.providers || [];
      const matched = savedProviders.find(
        (p) => (p.id || '').toLowerCase() === targetProvider.toLowerCase()
      );
      if (matched) {
        apiKey = matched.apiKey || '';
        baseUrl = matched.baseUrl || '';
      } else if (targetProvider.toLowerCase() === (config.provider || '').toLowerCase()) {
        apiKey = config.apiKey || '';
        baseUrl = config.baseUrl || '';
      }
    }
  } else {
    // Mode: 'active_model'
    targetProvider = config.provider || 'openai';
    targetModel = config.model || 'gpt-4o';
    apiKey = config.apiKey || '';
    baseUrl = config.baseUrl || '';
  }

  // Fallback lookup: if apiKey or baseUrl are missing, search appSettings.providers
  if (!apiKey || !baseUrl) {
    const savedProviders = appSettings?.providers || [];
    const matched = savedProviders.find(
      (p) => (p.id || '').toLowerCase() === targetProvider.toLowerCase()
    );
    if (matched) {
      if (!apiKey) apiKey = matched.apiKey || '';
      if (!baseUrl) baseUrl = matched.baseUrl || '';
    }
  }

  const isLocalProvider = targetProvider.toLowerCase().includes('ollama');
  if (!isLocalProvider && !apiKey) {
    return localFallback;
  }

  try {
    const title = await fetchTitleFromLLM({
      provider: targetProvider,
      model: targetModel,
      apiKey,
      baseUrl,
      prompt: rawPrompt,
      maxWords,
      customPrompt: titleSettings.customPrompt
    });

    return title || localFallback;
  } catch (err) {
    console.warn('[title-generator] LLM title generation failed, falling back to local truncation:', err);
    return localFallback;
  }
}
