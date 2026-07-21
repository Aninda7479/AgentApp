// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// Replicates StoreService.updateChatSteps' pattern: a setChats updater that
// calls setTrajectorySteps (nested setState) and returns nextChats.
function Mirror({ onReady }: { onReady: (trigger: () => void) => void }) {
  const [chats, setChats] = useState([{ id: 'c1', steps: [{ id: 'u', type: 'user', content: 'hi' }] }]);
  const [trajectorySteps, setTrajectorySteps] = useState<any[]>([]);
  const [activeChatId] = useState('c1');

  const update = () => {
    setChats((prevChats) => {
      const chat = prevChats.find((c) => c.id === 'c1');
      if (!chat) return prevChats;
      const nextSteps = [...(chat.steps || []), { id: 'a', type: 'assistant', content: 'REPLY' }];
      if ('c1' === activeChatId) setTrajectorySteps(nextSteps);
      return prevChats.map((c) => (c.id === 'c1' ? { ...c, steps: nextSteps } : c));
    });
  };

  onReady(update);

  return React.createElement('div', { id: 'out' }, trajectorySteps.map((s) => s.content).join('|'));
}

describe('nested setState in updater', () => {
  it('propagates trajectorySteps update in real React', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let trigger!: () => void;
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Mirror, { onReady: (t) => (trigger = t) }));
    });
    expect(container.querySelector('#out')!.textContent).toBe('');

    await act(async () => {
      trigger();
    });

    expect(container.querySelector('#out')!.textContent).toBe('hi|REPLY');
  });
});
