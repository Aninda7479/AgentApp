/**
 * React Hook for Triggering & Controlling Agent Runs per Session
 */

import { useCallback } from 'react';
import { AgentOrchestrator } from '../services/AgentOrchestrator';
import { useSessionStore } from '../stores/sessionStore';
import type { ComposerOptions, ComposerAttachment } from '../core/types';

export function useAgent(chatId: string) {
  const isRunning = useSessionStore((s) => s.runningSessions.get(chatId)?.isGenerating ?? false);
  const queueDepth = useSessionStore((s) => s.queues.get(chatId)?.length ?? 0);
  const lastError = useSessionStore((s) => s.runningSessions.get(chatId)?.lastError);
  const contextUsage = useSessionStore((s) => s.runningSessions.get(chatId)?.contextUsage || null);

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
