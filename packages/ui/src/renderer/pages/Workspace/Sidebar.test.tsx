import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from './Sidebar';
import { StoredProject, StoredChat } from '../../types';

// In-memory localStorage mock for Node test runner
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});

describe('Sidebar Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const mockProjects: StoredProject[] = [
    {
      name: 'DemoProject',
      description: 'Test project',
      path: '/path/to/demo',
    },
  ];

  const mockChats: StoredChat[] = [
    {
      id: 'chat-1',
      title: 'First Standalone Chat',
      timestamp: Date.now() - 1000 * 60 * 10, // 10 mins ago
      steps: [],
    },
    {
      id: 'chat-2',
      title: 'Project Nested Chat',
      project: 'DemoProject',
      timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
      steps: [],
    },
  ];

  it('renders correctly in expanded mode with actions, projects, chats, and 3-dot menu button', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeTab="trajectory"
        onSelectTab={vi.fn()}
        collapsed={false}
        projects={mockProjects}
        chats={mockChats}
        onNewChat={vi.fn()}
        onOpenSearch={vi.fn()}
      />
    );

    // Sidebar container and matching background
    expect(html).toContain('data-testid="sidebar-container"');
    expect(html).toContain('bg-[color:var(--brand-bg)]');

    // Action buttons & search
    expect(html).toContain('data-testid="nav-new-chat"');
    expect(html).toContain('data-testid="nav-search"');

    // Navigation items
    expect(html).toContain('data-testid="nav-item-tasks"');
    expect(html).toContain('data-testid="nav-item-scheduled"');
    expect(html).toContain('data-testid="nav-item-artifacts"');
    expect(html).toContain('data-testid="nav-item-partner"');

    // Projects and chats
    expect(html).toContain('data-testid="project-item-DemoProject"');
    expect(html).toContain('DemoProject');
    expect(html).toContain('data-testid="chat-item-First-Standalone-Chat"');
    expect(html).toContain('First Standalone Chat');

    // Project folder is collapsed by default on initial render/refresh
    expect(html).not.toContain('Project Nested Chat');

    // Chat 3-dot menu button on maximum right
    expect(html).toContain('data-testid="chat-menu-btn-chat-1"');

    // Footer settings
    expect(html).toContain('data-testid="sidebar-settings-btn"');
    expect(html).toContain('Settings');
  });

  it('restores expanded project folder when saved in localStorage', () => {
    localStorage.setItem('superagent_sidebar_expanded_projects', JSON.stringify({ DemoProject: true }));

    const html = renderToStaticMarkup(
      <Sidebar
        activeTab="trajectory"
        onSelectTab={vi.fn()}
        collapsed={false}
        projects={mockProjects}
        chats={mockChats}
      />
    );

    // Now nested chats are visible because DemoProject was saved as expanded
    expect(html).toContain('Project Nested Chat');
  });

  it('renders in collapsed mode with compact width', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeTab="trajectory"
        onSelectTab={vi.fn()}
        collapsed={true}
      />
    );

    // Width should be 68px
    expect(html).toContain('width:68px');

    // In collapsed mode, expanded text labels like "Projects" section should not render
    expect(html).not.toContain('data-testid="project-item-DemoProject"');
  });

  it('renders mobile drawer header with brand logo and close button when mobileOpen is true', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeTab="trajectory"
        onSelectTab={vi.fn()}
        collapsed={false}
        mobileOpen={true}
        onMobileClose={vi.fn()}
      />
    );

    expect(html).toContain('translate-x-0');
    expect(html).toContain('shadow-2xl');
    expect(html).toContain('SuperAgent');
    expect(html).toContain('Close sidebar');
  });

  it('highlights active chat with soft indicator styling and shows time on the right', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeTab="trajectory"
        onSelectTab={vi.fn()}
        collapsed={false}
        chats={mockChats}
        activeChatId="chat-1"
      />
    );

    expect(html).toContain('chat-item-First-Standalone-Chat');
    // Active chat has font-medium and accent pip
    expect(html).toContain('var(--brand-accent)');
    // Time is rendered on the right
    expect(html).toContain('10m');
  });

  it('displays running status with pulsing dot when a chat is running', () => {
    const runningChats: StoredChat[] = [
      {
        id: 'chat-running',
        title: 'Active Running Chat',
        isRunning: true,
        steps: [],
      },
    ];

    const html = renderToStaticMarkup(
      <Sidebar
        activeTab="trajectory"
        onSelectTab={vi.fn()}
        collapsed={false}
        chats={runningChats}
      />
    );

    expect(html).toContain('Active Running Chat');
    expect(html).toContain('animate-pulse');
    expect(html).toContain('var(--neon-live)');
  });
});
