import * as path from 'path';
import {
  AgentEngine,
  MultiAgentManager,
  multiAgentManager,
  createBuiltinTools,
  isCommandAllowed,
  isContextOverflowError,
  resolveProviderFamily,
  resolveBaseUrl,
  generateChatName,
  cleanTitle,
  formatLocalTruncatedTitle
} from '@superagent/core';

export {
  AgentEngine,
  MultiAgentManager,
  multiAgentManager,
  createBuiltinTools,
  isCommandAllowed,
  isContextOverflowError,
  generateChatName,
  cleanTitle,
  formatLocalTruncatedTitle
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

