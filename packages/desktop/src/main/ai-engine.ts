import * as path from 'path';
import {
  AgentEngine,
  MultiAgentManager,
  multiAgentManager,
  createBuiltinTools,
  isCommandAllowed,
  isContextOverflowError,
  resolveProviderFamily,
  resolveBaseUrl
} from '@superagent/core';

export {
  AgentEngine,
  MultiAgentManager,
  multiAgentManager,
  createBuiltinTools,
  isCommandAllowed,
  isContextOverflowError
};

export type {
  AgentEventType,
  AgentEvent,
  ToolDefinition,
  ChatMessage,
  AgentEngineConfig
} from '@superagent/core';

/**
 * Resolves a target path against a set of allowed root folders and refuses
 * anything escaping them. Case-insensitive so it behaves correctly on Windows.
 */
export function resolveWithinAnyRoot(target: string, allowedRoots: string[]): string | null {
  const resolved = path.resolve(target);
  const normTarget = resolved.toLowerCase();
  for (const root of allowedRoots) {
    const normRoot = path.resolve(root).toLowerCase();
    if (normTarget === normRoot || normTarget.startsWith(normRoot + path.sep)) {
      return resolved;
    }
  }
  return null;
}

export async function generateChatName(prompt: string, config: any, appSettings?: any): Promise<string> {
  const rawPrompt = prompt.trim();
  const titleSettings = appSettings?.chatTitle || {};
  const mode = titleSettings.mode || 'active_model';
  const maxWords = titleSettings.maxWords || 3;

  // Local fallback truncation
  const words = rawPrompt.split(/\s+/).filter(Boolean);
  let defaultTitle = words.slice(0, Math.max(1, maxWords)).join(' ');
  if (rawPrompt.length > 25 && words.length > maxWords) {
    defaultTitle += '...';
  }
  if (!defaultTitle) defaultTitle = 'New Chat';

  // Instant modes without network calls
  if (mode === 'disabled') {
    return defaultTitle;
  }
  if (mode === 'simple') {
    return words.slice(0, Math.max(1, maxWords)).join(' ') || defaultTitle;
  }

  // Determine provider config based on mode
  let targetProvider = config?.provider;
  let targetModel = config?.model;
  let targetApiKey = config?.apiKey;
  let targetBaseUrl = config?.baseUrl;

  if (mode === 'custom_model' && titleSettings.providerId) {
    targetProvider = titleSettings.providerId;
    if (titleSettings.model) {
      targetModel = titleSettings.model;
    }
    const matchedProvider = appSettings?.providers?.find(
      (p: any) => p.id === titleSettings.providerId || p.name?.toLowerCase() === titleSettings.providerId?.toLowerCase()
    );
    if (matchedProvider) {
      targetApiKey = matchedProvider.apiKey || targetApiKey;
      targetBaseUrl = matchedProvider.baseUrl || targetBaseUrl;
    }
  }

  if (!targetApiKey && targetProvider !== 'ollama' && targetProvider !== 'omniroute') {
    return defaultTitle;
  }

  try {
    const summarizePrompt = titleSettings.customPrompt
      ? `${titleSettings.customPrompt}:\n\n${rawPrompt}`
      : `Summarize this user prompt into a short, concise, and clean chat name/title of at most ${maxWords} words. Return ONLY the title text, nothing else, no quotes, no period:\n\n${rawPrompt}`;
    const family = resolveProviderFamily(targetProvider);

    if (family === 'anthropic') {
      const anthropicHost = resolveBaseUrl('anthropic', targetBaseUrl).replace(/\/v1\/?$/, '');
      const url = `${anthropicHost}/v1/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': targetApiKey || ''
        },
        body: JSON.stringify({
          model: targetModel || 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: [{ type: 'text', text: summarizePrompt }] }],
          max_tokens: 30
        })
      });
      if (!response.ok) throw new Error(`Anthropic HTTP error ${response.status}`);
      const json: any = await response.json();
      return json.content?.[0]?.text?.trim() || defaultTitle;
    }

    if (family === 'gemini') {
      const geminiHost = resolveBaseUrl('google', targetBaseUrl).replace(/\/+$/, '');
      const url = `${geminiHost}/v1beta/models/${targetModel || 'gemini-2.0-flash'}:generateContent?key=${targetApiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: summarizePrompt }] }]
        })
      });
      if (!response.ok) throw new Error(`Gemini HTTP error ${response.status}`);
      const json: any = await response.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || defaultTitle;
    }

    if (family === 'ollama') {
      const ollamaHost = (targetBaseUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const url = `${ollamaHost}/api/chat`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel || 'llama3.2',
          messages: [{ role: 'user', content: summarizePrompt }],
          stream: false
        })
      });
      if (!response.ok) throw new Error(`Ollama HTTP error ${response.status}`);
      const json: any = await response.json();
      return json.message?.content?.trim() || defaultTitle;
    }

    // OpenAI-compatible
    const openAiHost = resolveBaseUrl(targetProvider, targetBaseUrl);
    const url = `${openAiHost}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${targetApiKey}`
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [{ role: 'user', content: summarizePrompt }],
        temperature: 0.5,
        max_tokens: 30,
        stream: false
      })
    });
    if (!response.ok) {
      if (response.status === 404 && targetProvider === 'openrouter' && targetModel !== 'openrouter/free') {
        console.warn(`[desktop] generateChatName model "${targetModel}" returned 404, retrying with "openrouter/free"`);
        const fallbackResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${targetApiKey}`
          },
          body: JSON.stringify({
            model: 'openrouter/free',
            messages: [{ role: 'user', content: summarizePrompt }],
            temperature: 0.5,
            max_tokens: 30
          })
        });
        if (fallbackResponse.ok) {
          const fallbackJson: any = await fallbackResponse.json();
          return fallbackJson.choices?.[0]?.message?.content?.trim() || defaultTitle;
        }
      }
      const providerLabel = (targetProvider || 'API').toUpperCase();
      throw new Error(`${providerLabel} HTTP error ${response.status}`);
    }
    const json: any = await response.json();
    const msg = json.choices?.[0]?.message;
    const titleText = msg?.content || msg?.reasoning || msg?.reasoning_content || '';
    return (typeof titleText === 'string' ? titleText.trim() : '') || defaultTitle;
  } catch (err: any) {
    console.warn(`[desktop] generateChatName failed (falling back to default title): ${err.message || err}`);
    return defaultTitle;
  }
}
