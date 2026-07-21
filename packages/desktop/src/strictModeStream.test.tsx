// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// Replicates StoreService.updateChatSteps' pattern INSIDE React.StrictMode,
// which double-invokes updaters. We want to confirm the nested setTrajectorySteps
// still propagates (no dropped update under StrictMode).
function Mirror() {
  const [chats, setChats] = useState([{ id: 'c1', steps: [{ id: 'u', type: 'user', content: 'hi' }] }]);
  const [trajectorySteps, setTrajectorySteps] = useState<any[]>([]);
  const [activeChatId] = useState('c1');
  (globalThis as any).__trigger = () => {
    setChats((prevChats) => {
      const chat = prevChats.find((c) => c.id === 'c1');
      if (!chat) return prevChats;
      const nextSteps = [...(chat.steps || []), { id: 'a', type: 'assistant', content: 'REPLY' }];
      if ('c1' === activeChatId) setTrajectorySteps(nextSteps);
      return prevChats.map((c) => (c.id === 'c1' ? { ...c, steps: nextSteps } : c));
    });
  };
  return React.createElement('div', { id: 'out' }, trajectorySteps.map((s) => s.content).join('|'));
}

describe('nested setState under StrictMode', () => {
  it('propagates trajectorySteps update', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(React.StrictMode, null, React.createElement(Mirror)));
    });
    await act(async () => {
      (globalThis as any).__trigger();
    });
    expect(container.querySelector('#out')!.textContent).toContain('REPLY');
  });
});
