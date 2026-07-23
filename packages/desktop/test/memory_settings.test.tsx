import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemorySettings } from '../src/renderer/pages/Settings/MemorySettings';
import { SettingsSidebar } from '../src/renderer/pages/Settings/SettingsSidebar';

describe('MemorySettings Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Memory & System Prompts title correctly', () => {
    const html = renderToString(<MemorySettings />);
    expect(html).toContain('Memory &amp; System Prompts');
    expect(html).toContain('Section 1: Global System');
    expect(html).toContain('Section 2: Project');
  });

  it('renders Global System and Project sections', () => {
    const html = renderToString(<MemorySettings />);
    expect(html).toContain('Default Core Agent System Prompt');
    expect(html).toContain('Global Memory System Instructions');
    expect(html).toContain('User Profile Memories');
    expect(html).toContain('Learned Insights');
    expect(html).toContain('Discovered Project Prompts &amp; Instructions');
  });

  it('renders Memory item under Personal category in SettingsSidebar', () => {
    const html = renderToString(
      <SettingsSidebar
        activeCategory="memory"
        onSelectCategory={vi.fn()}
        onBackToApp={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
      />
    );
    expect(html).toContain('Memory');
    expect(html).toContain('data-testid="settings-category-memory"');
  });
});
