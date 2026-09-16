import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComposerBar } from './ComposerBar';
import { ModelPicker } from './ModelPicker';

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
