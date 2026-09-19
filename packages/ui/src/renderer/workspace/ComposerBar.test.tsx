import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComposerBar } from './ComposerBar';
import { ModelPicker } from './ModelPicker';
import { sessionStore } from '../stores/sessionStore';
import { chatStore } from '../stores/chatStore';

describe('ComposerBar Component', () => {
  it('renders text bar with left plus button, textarea, right mic and rounded arrow send button', () => {
    const html = renderToStaticMarkup(
      <ComposerBar onSend={vi.fn()} />
    );

    // Left plus button for file attachment
    expect(html).toContain('composer-attach-btn');

    // Central textarea input
    expect(html).toContain('composer-input');
    expect(html).toContain('Write a message...');

    // Supports custom placeholder
    const customHtml = renderToStaticMarkup(
      <ComposerBar onSend={vi.fn()} placeholder="Ask anything" />
    );
    expect(customHtml).toContain('Ask anything');

    // Right mic button
    expect(html).toContain('composer-mic-btn');

    // Right rounded arrow send button
    expect(html).toContain('btn-send');

    // Under-input Permission mode level button (shows text)
    expect(html).toContain('approval-dropdown-btn');
    expect(html).toContain('Ask for approval');

    // Under-input Model select button
    expect(html).toContain('model-select-btn');
  });

  it('includes responsive min-w-0 and break-words classes to prevent mobile overflow', () => {
    const html = renderToStaticMarkup(
      <ComposerBar onSend={vi.fn()} />
    );

    // Textarea must have min-w-0 and word wrapping to avoid expanding parent flex row on narrow screens
    expect(html).toContain('min-w-0');
    expect(html).toContain('break-words');
    expect(html).toContain('[overflow-wrap:anywhere]');

    // Sub-bar should use justify-between on mobile screens
    expect(html).toContain('justify-between');
    expect(html).toContain('sm:justify-end');
  });

  it('integrates active task cue card seamlessly inside the composer card when a task is running', () => {
    chatStore.setActiveChatId('chat-composer-test');
    sessionStore.markRunning('chat-composer-test');
    sessionStore.setActiveTask('chat-composer-test', {
      type: 'command',
      name: 'run_command',
      detail: 'cargo check --workspace',
      startedAt: Date.now(),
    });

    const html = renderToStaticMarkup(
      <ComposerBar chatId="chat-composer-test" onSend={vi.fn()} />
    );

    // Both PeekingTaskDeck and textarea input are rendered inside the ComposerBar
    expect(html).toContain('peeking-task-deck');
    expect(html).toContain('Active Processing Deck');
    expect(html).toContain('cargo check --workspace');
    expect(html).toContain('composer-input');
    // Verifies brand tokens are used
    expect(html).toContain('bg-brand-card/90');
    expect(html).toContain('border-brand-border');

    // Cleanup
    sessionStore.setActiveTask('chat-composer-test', null);
  });
});

describe('ModelPicker Component', () => {
  it('renders trigger button showing only text with hoverable rounded style', () => {
    const html = renderToStaticMarkup(
      <ModelPicker
        selectedModel="Claude 3.7 Sonnet"
        onSelectModel={vi.fn()}
      />
    );

    expect(html).toContain('model-select-btn');
    expect(html).toContain('Claude 3.7 Sonnet');
    expect(html).toContain('rounded-md');
  });
});

describe('ProjectPicker Component', () => {
  it('renders compact trigger button with selected project name', async () => {
    const { ProjectPicker } = await import('./ProjectPicker');
    const html = renderToStaticMarkup(
      <ProjectPicker
        selectedProject="MySuperProject"
        onSelectProject={vi.fn()}
      />
    );

    expect(html).toContain('project-select-btn');
    expect(html).toContain('MySuperProject');
  });

  it('renders pill variant trigger button with default fallback label', async () => {
    const { ProjectPicker } = await import('./ProjectPicker');
    const html = renderToStaticMarkup(
      <ProjectPicker
        variant="pill"
        onSelectProject={vi.fn()}
      />
    );

    expect(html).toContain('project-select-btn');
    expect(html).toContain('rounded-full');
  });
});
