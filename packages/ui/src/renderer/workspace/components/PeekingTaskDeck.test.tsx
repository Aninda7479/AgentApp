// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { PeekingTaskDeck } from './PeekingTaskDeck';
import { sessionStore } from '../../stores/sessionStore';
import { chatStore } from '../../stores/chatStore';

describe('PeekingTaskDeck Component', () => {
  beforeEach(() => {
    chatStore.setActiveChatId('chat-test-1');
    sessionStore.clearQueue('chat-test-1');
    sessionStore.setActiveTask('chat-test-1', null);
  });

  it('renders nothing when no active tasks and no queues exist', () => {
    const html = renderToStaticMarkup(<PeekingTaskDeck chatId="chat-test-1" />);
    expect(html).toBe('');
  });

  it('renders active command task with live indicator and command detail', () => {
    sessionStore.markRunning('chat-test-1');
    sessionStore.setActiveTask('chat-test-1', {
      type: 'command',
      name: 'run_command',
      detail: 'yt-dlp https://youtube.com/shorts/test',
      startedAt: Date.now(),
    });

    const html = renderToStaticMarkup(<PeekingTaskDeck chatId="chat-test-1" />);
    expect(html).toContain('peeking-task-deck');
    expect(html).toContain('Active Processing Deck');
    expect(html).toContain('Shell Command Executing');
    expect(html).toContain('yt-dlp https://youtube.com/shorts/test');
  });

  it('renders active sleep timer with countdown and reason', () => {
    sessionStore.markRunning('chat-test-1');
    sessionStore.setActiveTask('chat-test-1', {
      type: 'timer',
      name: 'sleep_timer',
      detail: 'Waiting for video generation to complete',
      startedAt: Date.now(),
      totalSeconds: 30,
    });

    const html = renderToStaticMarkup(<PeekingTaskDeck chatId="chat-test-1" />);
    expect(html).toContain('Agent Sleep Timer');
    expect(html).toContain('30s left');
    expect(html).toContain('Waiting for video generation to complete');
  });

  it('renders queued prompts with cancel button', () => {
    sessionStore.markRunning('chat-test-1');
    sessionStore.enqueue('chat-test-1', {
      chatId: 'chat-test-1',
      prompt: 'Send another message',
      options: {},
      attachments: [],
    });

    const html = renderToStaticMarkup(<PeekingTaskDeck chatId="chat-test-1" />);
    expect(html).toContain('Queued to Run Next (1)');
    expect(html).toContain('Send another message');
    expect(html).toContain('Cancel Queue');
  });

  it('uses brand design system tokens instead of hardcoded slate colors', () => {
    sessionStore.markRunning('chat-test-1');
    sessionStore.setActiveTask('chat-test-1', {
      type: 'command',
      name: 'run_command',
      detail: 'npm test',
      startedAt: Date.now(),
    });

    const html = renderToStaticMarkup(<PeekingTaskDeck chatId="chat-test-1" />);
    expect(html).toContain('border-brand-border');
    expect(html).toContain('text-brand-textMain');
    expect(html).not.toContain('bg-slate-900');
    expect(html).not.toContain('border-slate-700');
  });

  it('cleans up [object Object] artifacts in task details gracefully', () => {
    sessionStore.markRunning('chat-test-1');
    sessionStore.setActiveTask('chat-test-1', {
      type: 'tool',
      name: 'question',
      detail: 'questions: [object Object], [object Object]',
      startedAt: Date.now(),
    });

    const html = renderToStaticMarkup(<PeekingTaskDeck chatId="chat-test-1" />);
    expect(html).not.toContain('[object Object]');
    expect(html).toContain('questions');
  });

  it('mounts into DOM without triggering infinite render loop or Maximum update depth exceeded', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    expect(() => {
      act(() => {
        root.render(<PeekingTaskDeck chatId="chat-test-1" />);
      });
    }).not.toThrow();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
