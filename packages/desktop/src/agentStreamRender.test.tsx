// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrajectoryCanvas } from './renderer/pages/Workspace/TrajectoryCanvas.js';

const userStep = { id: 'u1', type: 'user', content: 'hi' };
const assistantStep = { id: 'a1', type: 'assistant', content: 'Hello from the model' };

describe('TrajectoryCanvas renders streamed reply', () => {
  it('shows assistant content in the DOM', () => {
    const html = renderToStaticMarkup(
      React.createElement(TrajectoryCanvas as any, {
        steps: [userStep, assistantStep],
        isStreaming: false
      } as any)
    );
    expect(html).toContain('Hello from the model');
  });

  it('shows assistant content while streaming', () => {
    const html = renderToStaticMarkup(
      React.createElement(TrajectoryCanvas as any, {
        steps: [userStep, assistantStep],
        isStreaming: true
      } as any)
    );
    expect(html).toContain('Hello from the model');
  });
});
