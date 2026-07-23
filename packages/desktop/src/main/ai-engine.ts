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

export async function generateChatName(prompt: string, config: any): Promise<string> {
  const { provider, model, apiKey, baseUrl } = config;
  const rawPrompt = prompt.trim();
  let defaultTitle = rawPrompt.length > 25 ? rawPrompt.slice(0, 25).trim() + '...' : rawPrompt;
  
  if (!apiKey && provider !== 'ollama' && provider !== 'omniroute') {
    return defaultTitle;
  }
  
  try {
    const summarizePrompt = `Summarize this user prompt into a short, concise, and clean chat name/title of at most 3 words. Return ONLY the title text, nothing else, no quotes, no period:\n\n${rawPrompt}`;
    const family = resolveProviderFamily(provider);
    
    if (family === 'anthropic') {
      const anthropicHost = resolveBaseUrl('anthropic', baseUrl).replace(/\/v1\/?$/, '');
      const url = `${anthropicHost}/v1/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey || ''
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: [{ type: 'text', text: summarizePrompt }] }],
          max_tokens: 30
        })
      });
      if (!response.ok) throw new Error(`Anthropic HTTP error ${response.status}`);
      const json: any = await response.json();
      return json.content?.[0]?.text?.trim() || defaultTitle;
    }
    
    if (family === 'gemini') {
      const geminiHost = resolveBaseUrl('google', baseUrl).replace(/\/+$/, '');
      const url = `${geminiHost}/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`;
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
      const ollamaHost = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const url = `${ollamaHost}/api/chat`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama3.2',
          messages: [{ role: 'user', content: summarizePrompt }],
          stream: false
        })
      });
      if (!response.ok) throw new Error(`Ollama HTTP error ${response.status}`);
      const json: any = await response.json();
      return json.message?.content?.trim() || defaultTitle;
    }
    
    // OpenAI-compatible
    const openAiHost = resolveBaseUrl(provider, baseUrl);
    const url = `${openAiHost}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: summarizePrompt }],
        temperature: 0.5,
        max_tokens: 30
      })
    });
    if (!response.ok) {
      if (response.status === 404 && provider === 'openrouter' && model !== 'openrouter/free') {
        console.warn(`[desktop] generateChatName model "${model}" returned 404, retrying with "openrouter/free"`);
        const fallbackResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
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
      throw new Error(`OpenAI HTTP error ${response.status}`);
    }
    const json: any = await response.json();
    return json.choices?.[0]?.message?.content?.trim() || defaultTitle;
  } catch (err: any) {
    console.warn(`[desktop] generateChatName failed (falling back to default title): ${err.message || err}`);
    return defaultTitle;
  }
}
