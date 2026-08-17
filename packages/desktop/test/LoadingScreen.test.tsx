import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { LoadingScreen } from '../src/renderer/components/LoadingScreen';

describe('LoadingScreen Component', () => {
  it('renders the atmospheric scenery with moon, hills, and stars', () => {
    const html = renderToString(<LoadingScreen />);
    expect(html).toContain('data-testid="loading-screen"');
    expect(html).toContain('Super');
    expect(html).toContain('Agent');
    expect(html).toContain('Your Autonomous Workspace');
    expect(html).toContain('loading-bar-warm');
    expect(html).toContain('SuperAgent — your autonomous workspace');
  });

  it('supports custom signature and custom status message', () => {
    const html = renderToString(
      <LoadingScreen
        statusMessage="Custom status booting..."
        signature="Build by Aninda"
      />
    );
    expect(html).toContain('Custom status booting...');
    expect(html).toContain('Build by Aninda');
  });
});
