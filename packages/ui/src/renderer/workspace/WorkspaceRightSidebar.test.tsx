import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';
import type { TrajectoryStep } from '../pages/Workspace/TrajectoryCanvas';

// Mock stores
vi.mock('../stores/chatStore', () => ({
  useChatStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({
      chats: [
        {
          id: 'chat-1',
          title: 'Hello, What is in My Memory?',
          model: 'gpt-4o',
          timestamp: '2026-09-17T18:42:17.549Z',
          project: 'DemoProject',
          steps: [],
        },
        {
          id: 'chat-2',
          title: 'Unrelated Chat 2',
          model: 'claude-3-5-sonnet',
          timestamp: '2026-09-17T17:00:00.000Z',
          steps: [],
        },
      ],
      activeProject: 'DemoProject',
      draftProject: null,
    }),
}));

vi.mock('../stores/sessionStore', () => ({
  useSessionStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({
      runningSessions: new Map(),
    }),
}));

vi.mock('../pages/Settings/companion/library', () => ({
  usePartners: () => ({
    pets: [
      { id: 'partner-1', name: 'Neko', modelPath: '/models/neko.vrm' },
    ],
    activeId: 'partner-1',
  }),
}));

vi.mock('../partner-popup/PetSprite', () => ({
  PetSprite: () => <div data-testid="pet-sprite">Pet Sprite</div>,
}));

describe('WorkspaceRightSidebar Component', () => {
  it('does not display unrelated chat sessions in the Agents tab and shows empty state', () => {
    const html = renderToStaticMarkup(
      <WorkspaceRightSidebar
        steps={[]}
        activeChatId="chat-1"
        isGenerating={false}
        initialTab="agents"
      />
    );

    // Verifies chat-scoped subagents
    expect(html).toContain('No Sub-agents in this Chat');
    expect(html).toContain('Sub-agents in this Chat (0)');
    // Must NOT contain Unrelated Chat 2 in right sidebar!
    expect(html).not.toContain('Unrelated Chat 2');
  });

  it('renders chat-scoped subagents when steps contain subagent tool calls', () => {
    const subagentSteps: TrajectoryStep[] = [
      {
        id: 'step-sub-1',
        type: 'tool_call',
        toolName: 'run_subagent',
        content: 'Delegating to architecture review subagent',
        status: 'success',
        metadata: {
          toolArgs: {
            persona_id: 'code-architect',
            prompt: 'Audit memory leakage in trajectory cache',
          },
          result: 'Audit complete: No major leaks identified in cache map.',
          durationMs: 2500,
        },
      },
    ];

    const html = renderToStaticMarkup(
      <WorkspaceRightSidebar
        steps={subagentSteps}
        activeChatId="chat-1"
        isGenerating={false}
        initialTab="agents"
      />
    );

    // Subagent card should be rendered with persona and prompt
    expect(html).toContain('@code-architect');
    expect(html).toContain('Audit memory leakage in trajectory cache');
    expect(html).toContain('Sub-agents in this Chat (1)');
    expect(html).toContain('Completed');
    expect(html).not.toContain('Unrelated Chat 2');
  });

  it('renders accurate context window tokens, cost, size, and chat ID in the Info tab', () => {
    const conversationSteps: TrajectoryStep[] = [
      {
        id: 'step-1',
        type: 'user',
        content: 'Hello, what is in my memory? Do you know my name?',
      },
      {
        id: 'step-2',
        type: 'assistant',
        content: 'I do not have persistent memory across conversations.',
      },
    ];

    const html = renderToStaticMarkup(
      <WorkspaceRightSidebar
        steps={conversationSteps}
        activeChatId="chat-1"
        isGenerating={false}
        initialTab="info"
      />
    );

    // Session ID display
    expect(html).toContain('chat-1');
    expect(html).toContain('Copy Chat ID');

    // Context Window should show actual tokens, NOT 0%!
    expect(html).toContain('Context Window');
    expect(html).not.toContain('>0%<');
    expect(html).toContain('tokens');
    expect(html).toContain('User Prompts');
    expect(html).toContain('Assistant');

    // Total Cost
    expect(html).toContain('Total Chat Cost');
    expect(html).toContain('Main Chat');
    expect(html).toContain('Sub-agents');

    // Total Size
    expect(html).toContain('Total Chat Size');
    expect(html).toContain('Transcript');

    // Attachments section
    expect(html).toContain('Attachments &amp; Media');
  });
});
