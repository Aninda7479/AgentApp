/**
 * App Shell Root Coordinator (<200 lines)
 * Initializes store repositories, mounts event bus, and renders main workspace layout.
 */

import React, { useEffect, useState } from 'react';
import { WorkspaceLayout } from './WorkspaceLayout';
import { ChatRepository } from '../services/ChatRepository';
import { ProviderRegistry } from '../services/ProviderRegistry';
import { agentEventBus } from '../core/eventBus';

export const AppShell: React.FC = () => {
  const [initialized, setInitialized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // 1. Initialize single event bus subscriber
    agentEventBus.init();

    // 2. Bootstrap ChatRepository and ProviderRegistry
    async function boot() {
      try {
        await ChatRepository.bootstrap();
        await ProviderRegistry.autoDetect();
      } catch (err) {
        console.error('[AppShell] Boot failed:', err);
      } finally {
        setInitialized(true);
      }
    }

    boot();
  }, []);

  if (!initialized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-slate-950 text-cyan-400 font-mono text-sm space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
        <span>Bootstrapping SuperAgent Engine...</span>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950">
      <WorkspaceLayout onOpenSettings={() => setShowSettings(!showSettings)} />
    </div>
  );
};
