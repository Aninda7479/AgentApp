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
  const maxWords = titleSettings.maxWords || 3;

  // Local fallback truncation (instant, offline)
  const words = rawPrompt.split(/\s+/).filter(Boolean);
  let defaultTitle = words.slice(0, Math.max(1, maxWords)).join(' ');
  if (rawPrompt.length > 25 && words.length > maxWords) {
    defaultTitle += '...';
  }
  if (!defaultTitle) defaultTitle = 'New Chat';

  // LLM-based chat title generation is paused
  return defaultTitle;
}
