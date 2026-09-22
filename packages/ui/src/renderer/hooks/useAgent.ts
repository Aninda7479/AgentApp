/**
 * React Hook for Triggering & Controlling Agent Runs per Session
 */

import { useCallback } from 'react';
import { AgentOrchestrator } from '../services/AgentOrchestrator';
import { useSessionStore } from '../stores/sessionStore';
import type { ComposerOptions, ComposerAttachment } from '../core/types';

export function useAgent(chatId: string) {
  const cleanId = chatId.replace(/^session-/, '');
  const prefId = `session-${cleanId}`;

  const isRunning = useSessionStore((s) => {
    return (
      s.runningSessions.get(chatId)?.isGenerating ??
      s.runningSessions.get(cleanId)?.isGenerating ??
      s.runningSessions.get(prefId)?.isGenerating ??
      false
    );
  });
  const queueDepth = useSessionStore((s) => {
    return (
      s.queues.get(chatId)?.length ??
      s.queues.get(cleanId)?.length ??
      s.queues.get(prefId)?.length ??
      0
    );
  });
  const lastError = useSessionStore((s) => {
    return (
      s.runningSessions.get(chatId)?.lastError ??
      s.runningSessions.get(cleanId)?.lastError ??
      s.runningSessions.get(prefId)?.lastError
    );
  });
  const contextUsage = useSessionStore((s) => {
    return (
      s.runningSessions.get(chatId)?.contextUsage ||
      s.runningSessions.get(cleanId)?.contextUsage ||
      s.runningSessions.get(prefId)?.contextUsage ||
      null
    );
  });

  const sendPrompt = useCallback(
    async (prompt: string, options?: ComposerOptions, attachments?: ComposerAttachment[]) => {
      await AgentOrchestrator.sendPrompt(chatId, prompt, options, attachments);
    },
    [chatId]
  );

  const stopRun = useCallback(async () => {
    await AgentOrchestrator.stopRun(chatId);
  }, [chatId]);

  return {
    isRunning,
    queueDepth,
    lastError,
    contextUsage,
    sendPrompt,
    stopRun,
  };
}
