// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceView } from './renderer/pages/Workspace/WorkspaceView.js';

const userStep = { id: 'u1', type: 'user', content: 'hi' };
const assistantStep = { id: 'a1', type: 'assistant', content: 'Hello from the model' };

describe('WorkspaceView renders streamed reply', () => {
  it('shows assistant content through the full workspace', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkspaceView as any, {
        activeProject: 'proj',
        trajectorySteps: [userStep, assistantStep],
        isGenerating: false,
        modelsCatalog: [],
        mcpServers: [],
        hasCredentials: true,
        composerPrompt: '',
        onPromptChange: () => {},
        onSendPrompt: () => {},
        onStop: () => {},
        onViewDiff: () => {},
        onOpenMcp: () => {},
        onOpenSettings: () => {},
        onToast: () => {}
      } as any)
    );
    expect(html).toContain('Hello from the model');
  });
});
