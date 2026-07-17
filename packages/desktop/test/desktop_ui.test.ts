import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Mock Electron module before importing WindowManager
vi.mock('electron', () => {
  class MockBrowserWindow {
    id: number;
    static idCounter = 1;
    destroyed = false;
    opts: any;
    listeners: Record<string, Function[]> = {};

    constructor(options: any) {
      this.id = MockBrowserWindow.idCounter++;
      this.opts = options;
    }

    loadFile(path: string) {
      return Promise.resolve();
    }

    on(event: string, fn: Function) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }

    emit(event: string) {
      if (this.listeners[event]) {
        this.listeners[event].forEach((fn) => fn());
      }
    }

    isDestroyed() {
      return this.destroyed;
    }

    close() {
      this.destroyed = true;
      this.emit('closed');
    }

    isMinimized() {
      return false;
    }

    restore() {}
    focus() {}
    minimize() {}
    maximize() {}
    unmaximize() {}
    isMaximized() {
      return false;
    }
  }

  return {
    BrowserWindow: MockBrowserWindow,
    app: {
      whenReady: () => Promise.resolve(),
      on: vi.fn(),
      quit: vi.fn()
    },
    ipcMain: {
      on: vi.fn()
    }
  };
});

import { WindowManager } from '../src/main/window';
import { Sidebar } from '../src/renderer/components/Sidebar';
import { TrajectoryCanvas, TrajectoryStep } from '../src/renderer/components/TrajectoryCanvas';
import { Composer } from '../src/renderer/components/Composer';
import { DiffViewer } from '../src/renderer/components/DiffViewer';
import { BYOKModal } from '../src/renderer/components/BYOKModal';
import { MCPDashboard, MCPServerInfo } from '../src/renderer/components/MCPDashboard';
import { SearchModal } from '../src/renderer/components/SearchModal';
import { ScheduledView } from '../src/renderer/components/ScheduledView';
import { SettingsView } from '../src/renderer/settings/SettingsView';
import { IntegrationsSettings } from '../src/renderer/settings/IntegrationsSettings';
import { McpInstallModal } from '../src/renderer/components/McpInstallModal';
import { App } from '../src/renderer/App';

describe('Step 081: Electron Main Process & Multi-Window Manager', () => {
  let wm: WindowManager;

  beforeEach(() => {
    wm = new WindowManager();
  });

  it('should create and manage main window', () => {
    const win = wm.createMainWindow();
    expect(win).toBeDefined();
    expect(wm.getMainWindow()).toBe(win);
    expect(wm.getAllWindows()).toHaveLength(1);
  });

  it('should create named windows and handle window closure', () => {
    const settingsWin = wm.createWindow('settings', { width: 600, height: 400 });
    expect(wm.getWindowByName('settings')).toBe(settingsWin);
    expect(wm.getAllWindows()).toHaveLength(1);

    wm.closeWindow(settingsWin.id);
    expect(wm.getWindowByName('settings')).toBeUndefined();
    expect(wm.getAllWindows()).toHaveLength(0);
  });

  it('should restore/focus existing window when recreating with same name', () => {
    const win1 = wm.createWindow('preview');
    const win2 = wm.createWindow('preview');
    expect(win1.id).toBe(win2.id);
  });

  it('should close all windows on closeAllWindows', () => {
    wm.createMainWindow();
    wm.createWindow('aux1');
    wm.createWindow('aux2');
    expect(wm.getAllWindows()).toHaveLength(3);

    wm.closeAllWindows();
    expect(wm.getAllWindows()).toHaveLength(0);
    expect(wm.getMainWindow()).toBeNull();
  });
});

describe('Step 083: Responsive Left Sidebar Navigation', () => {
  it('should render expanded sidebar with navigation items', () => {
    const html = renderToString(
      React.createElement(Sidebar, {
        activeTab: 'trajectory',
        onSelectTab: () => {},
        mcpCount: 3
      })
    );
    expect(html).toContain('Settings');
    expect(html).toContain('New chat');
    expect(html).toContain('Scheduled');
    expect(html).toContain('width:260px');
  });

  it('should render collapsed sidebar when collapsed prop is true', () => {
    const html = renderToString(
      React.createElement(Sidebar, {
        activeTab: 'mcp',
        onSelectTab: () => {},
        collapsed: true
      })
    );
    expect(html).toContain('width:70px');
    expect(html).not.toContain('Settings');
  });

  it('should show a running indicator for chats that continue in the background', () => {
    const html = renderToString(
      React.createElement(Sidebar, {
        activeTab: 'trajectory',
        onSelectTab: () => {},
        chats: [{
          id: 'chat-1',
          title: 'Vision task',
          project: '',
          model: 'gpt-4o',
          timestamp: '2026-07-01',
          steps: [],
          isRunning: true
        }],
        activeChatId: 'chat-1'
      })
    );

    expect(html).toContain('Working...');
    expect(html).toContain('animate-pulse');
  });
});

describe('Step 084: Streaming Chat Trajectory Canvas', () => {
  it('should render empty state when no steps provided', () => {
    const html = renderToString(
      React.createElement(TrajectoryCanvas, { steps: [] })
    );
    expect(html).toContain('empty-state');
    expect(html).toContain('No agent execution trajectory yet');
  });

  it('should render trajectory steps including user, thought, tool, and assistant', () => {
    const steps: TrajectoryStep[] = [
      { id: '1', type: 'user', content: 'Build a react app' },
      { id: '2', type: 'thought', content: 'Analyzing requirements...' },
      {
        id: '3',
        type: 'tool_call',
        toolName: 'fs_write',
        status: 'success',
        content: 'Wrote file src/index.tsx',
        metadata: { filename: 'src/index.tsx', originalCode: 'old', modifiedCode: 'new', addedLines: 1, removedLines: 0 }
      },
      { id: '4', type: 'assistant', content: 'App constructed successfully!' }
    ];

    const html = renderToString(
      React.createElement(TrajectoryCanvas, { steps, isStreaming: false, initialExpanded: true, onViewDiff: () => {} })
    );

    expect(html).toContain('Build a react app');
    expect(html).toContain('Analyzing requirements...');
    expect(html).toContain('fs_write');
    expect(html).toContain('Review');
    expect(html).toContain('Thought for');
  });

  it('should summarize noisy tool output in the worked-details list', () => {
    const steps: TrajectoryStep[] = [
      { id: '1', type: 'user', content: 'Summarize the PDF' },
      { id: '2', type: 'thought', content: 'Inspecting attachment...' },
      {
        id: '3',
        type: 'tool_call',
        toolName: 'read_file',
        status: 'success',
        content: '%PDF-1.4 \uFFFD\uFFFD\uFFFD\uFFFD 10 0 obj << /Type /Catalog /Version',
      },
      {
        id: '4',
        type: 'tool_call',
        toolName: 'run_command',
        status: 'error',
        content: 'Error: Command failed: pip install pdfplumber 2>&1 | tail -20\nmore stderr here'
      },
      { id: '5', type: 'assistant', content: 'I need to use a different extraction path.' }
    ];

    const html = renderToString(
      React.createElement(TrajectoryCanvas, { steps, isStreaming: false, initialExpanded: true })
    );

    expect(html).toContain('Opened a binary document preview');
    expect(html).toContain('Command failed: pip install pdfplumber 2&gt;&amp;1 | tail -20');
    expect(html).not.toContain('%PDF-1.4');
    expect(html).not.toContain('more stderr here');
  });

  it('should keep the prompt visible when attachment user steps follow it', () => {
    const steps: TrajectoryStep[] = [
      { id: '1', type: 'user', content: 'Extract text from this image' },
      {
        id: '2',
        type: 'user',
        content: '📎 Attached context: mockup.png',
        metadata: { mediaType: 'image', mediaPath: '/tmp/mockup.png' } as any
      },
      { id: '3', type: 'assistant', content: 'I can inspect the image directly.' }
    ];

    const html = renderToString(
      React.createElement(TrajectoryCanvas, { steps, isStreaming: false })
    );

    expect(html).toContain('Extract text from this image');
    expect(html).toContain('Attached context: mockup.png');
    expect(html).toContain('I can inspect the image directly.');
  });
});

describe('Step 085: Codex Floating Prompt Composer', () => {
  it('should render composer with inputs and action button', () => {
    const html = renderToString(
      React.createElement(Composer, {
        onSend: () => {},
        defaultModel: '5.5 Medium'
      })
    );

    expect(html).toContain('composer-container');
    expect(html).toContain('Do anything');
    expect(html).toContain('Ask for approval');
    expect(html).toContain('5.5 Medium');
  });

  it('should render stop button during active generation', () => {
    const html = renderToString(
      React.createElement(Composer, {
        onSend: () => {},
        isGenerating: true,
        onStop: () => {}
      })
    );

    expect(html).toContain('⏹');
  });
});

describe('Step 086: Interactive Side-by-Side GUI Diff Viewer', () => {
  it('should render side-by-side split diff view with file statistics', () => {
    const orig = 'const x = 1;\nconsole.log(x);';
    const mod = 'const x = 2;\nconsole.log(x);\nconsole.log("added");';

    const html = renderToString(
      React.createElement(DiffViewer, {
        originalCode: orig,
        modifiedCode: mod,
        filename: 'src/config.ts',
        onAccept: () => {},
        onReject: () => {}
      })
    );

    expect(html).toContain('src/config.ts');
    expect(html).toContain('split-diff-container');
    expect(html).toContain('Original Base');
    expect(html).toContain('Modified Proposed');
    expect(html).toContain('Accept All');
    expect(html).toContain('Reject');
  });
});

describe('Step 092: Graphical BYOK Settings Modal', () => {
  it('should not render anything when isOpen is false', () => {
    const html = renderToString(
      React.createElement(BYOKModal, {
        isOpen: false,
        onClose: () => {},
        onSaveKeys: () => {}
      })
    );
    expect(html).toBe('');
  });

  it('should render providers and inputs when isOpen is true', () => {
    const html = renderToString(
      React.createElement(BYOKModal, {
        isOpen: true,
        onClose: () => {},
        onSaveKeys: () => {},
        initialKeys: { openai: 'sk-test-key' }
      })
    );

    expect(html).toContain('BYOK Provider Settings');
    expect(html).toContain('OpenAI API Key');
    expect(html).toContain('Anthropic API Key');
    expect(html).toContain('sk-test-key');
    expect(html).toContain('Save Keys');
  });
});

describe('Step 093: Visual MCP Server Dashboard', () => {
  it('should render server cards and status badges', () => {
    const servers: MCPServerInfo[] = [
      {
        id: 'srv-1',
        name: 'PostgreSQL MCP',
        transport: 'stdio',
        commandOrUrl: 'npx postgres-mcp',
        status: 'connected',
        enabled: true,
        toolsCount: 8,
        latencyMs: 12
      }
    ];

    const html = renderToString(
      React.createElement(MCPDashboard, {
        servers,
        onAddServer: () => {},
        onRemoveServer: () => {},
        onToggleServer: () => {}
      })
    );

    expect(html).toContain('Visual MCP Server Dashboard');
    expect(html).toContain('PostgreSQL MCP');
    expect(html).toContain('STDIO');
    expect(html).toContain('Connected');
    expect(html).toContain('Tools Exposed:');
  });

  it('should render empty state when no servers configured', () => {
    const html = renderToString(
      React.createElement(MCPDashboard, {
        servers: [],
        onAddServer: () => {},
        onRemoveServer: () => {},
        onToggleServer: () => {}
      })
    );

    expect(html).toContain('No MCP servers registered yet');
  });
});

describe('Step 082: Codex Clone Frameless Dark UI Window (App)', () => {
  it('should render complete Codex App UI layout', () => {
    const html = renderToString(React.createElement(App));

    expect(html).toContain('SuperAgent');
    expect(html).toContain('BYOK');
    expect(html).toContain('Configure');
    expect(html).toContain('New chat');
  });
});

describe('Step 082b: Additional Codex UI Sub-components', () => {
  it('should render SearchModal with real chats and actions when open', () => {
    const html = renderToString(
      React.createElement(SearchModal, {
        isOpen: true,
        onClose: () => {},
        chats: [
          { id: 'c1', title: 'Find online data listings', project: 'GlacierPharma' },
          { id: 'c2', title: 'Draft BYOM executive memo', project: 'LawX' }
        ],
        projects: [{ name: 'GlacierPharma' }],
        onSelectChat: () => {},
        onSelectProject: () => {},
        onNewChat: () => {},
        onOpenFolder: () => {},
        onOpenSettings: () => {}
      })
    );
    expect(html).toContain('Search chats or run a command');
    expect(html).toContain('Find online data listings');
    expect(html).toContain('New chat');
    expect(html).toContain('Open folder');
    expect(html).toContain('Settings');
  });

  it('should render ScheduledView with Tasks and Templates tabs', () => {
    const html = renderToString(
      React.createElement(ScheduledView, {
        onCreateTask: () => {},
        onUseTemplate: () => {}
      })
    );
    expect(html).toContain('Scheduled');
    expect(html).toContain('Create your first scheduled task');
  });


  it('should render SettingsView with left categories and work mode selection', () => {
    const html = renderToString(
      React.createElement(SettingsView, {
        activeCategory: 'general',
        onSelectCategory: () => {},
        onBackToApp: () => {},
        themeMode: 'dark',
        onThemeChange: () => {},
        mcpDashboard: React.createElement('div', { id: 'mcp-stub' }, 'MCP Stub'),
        connectedProviders: [],
        modelsCatalog: [],
        onConnectProvider: () => {},
        onDisconnectProvider: () => {},
        onToggleModel: () => {},
        skills: [],
        onToggleSkill: () => {},
        pluginCatalog: [],
        pluginEnabled: {},
        onTogglePlugin: () => {},
        workMode: 'coding',
        onWorkModeChange: () => {},
        confirmShellCommands: true,
        onConfirmShellCommandsChange: () => {},
        autoReviewPlan: true,
        onAutoReviewPlanChange: () => {},
        unsandboxedActions: true,
        onUnsandboxedActionsChange: () => {}
      })
    );
    expect(html).toContain('settings-container');
    expect(html).toContain('General');
    expect(html).toContain('Work mode');
    expect(html).toContain('For coding');
    expect(html).toContain('Default permissions');
    expect(html).toContain('SuperAgent');
  });
});

describe('Step 094: Integrations (Skills / Connectors / Plugins) Panel', () => {
  const pluginCatalog = [
    { id: 'browser-use', name: 'Browser Use', description: 'Drive a browser.', icon: '🌐', category: 'automation', tags: ['web'], defaultEnabled: true, status: 'active', source: 'builtin' },
    { id: 'computer-use', name: 'Computer Use', description: 'Control the desktop.', icon: '🖥️', category: 'automation', tags: ['desktop'], defaultEnabled: true, status: 'active', source: 'builtin' },
    { id: 'document', name: 'Document', description: 'Author documents.', icon: '📄', category: 'document', tags: ['office'], defaultEnabled: true, status: 'active', source: 'builtin' },
    { id: 'pdf', name: 'PDF', description: 'Generate PDFs.', icon: '📕', category: 'document', tags: ['pdf'], defaultEnabled: true, status: 'active', source: 'builtin' },
    { id: 'spreadsheets', name: 'Spreadsheets', description: 'Edit spreadsheets.', icon: '📊', category: 'document', tags: ['data'], defaultEnabled: true, status: 'active', source: 'builtin' },
    { id: 'presentations', name: 'Presentations', description: 'Build slides.', icon: '📽️', category: 'media', tags: ['slides'], defaultEnabled: true, status: 'active', source: 'builtin' },
    { id: 'visualize', name: 'Visualize', description: 'Render charts.', icon: '📈', category: 'media', tags: ['data'], defaultEnabled: false, status: 'active', source: 'builtin' },
    { id: 'pdf-viewer', name: 'PDF Viewer', description: 'Annotate PDFs.', icon: '📄', category: 'document', tags: ['pdf'], defaultEnabled: false, status: 'under-development', source: 'marketplace' },
    { id: 'small-business', name: 'Small Business', description: 'Business workflows.', icon: '🏪', category: 'automation', tags: ['business'], defaultEnabled: false, status: 'under-development', source: 'marketplace' }
  ];
  const skills = [
    { id: 'graphify', name: 'Graphify', description: 'Index a codebase.', instructions: 'do the thing', status: 'active', source: 'discovered' },
    { id: 'docs', name: 'Docs', description: 'No description provided', instructions: '', status: 'incomplete', source: 'discovered' }
  ];

  const render = (view: 'skills' | 'connectors' | 'plugins') =>
    renderToString(
      React.createElement(IntegrationsSettings, {
        view,
        mcpDashboard: React.createElement('div', { id: 'mcp-stub' }, 'MCP Stub'),
        skills,
        onToggleSkill: () => {},
        pluginCatalog,
        pluginEnabled: { 'browser-use': true, 'visualize': false },
        onTogglePlugin: () => {}
      })
    );

  it('should render the Skills panel with a status badge per skill', () => {
    const html = render('skills');
    expect(html).toContain('Skills');
    expect(html).toContain('integration-view-skills');
    // discovered/incomplete skill is flagged
    expect(html).toContain('integration-skill-graphify');
    expect(html).toContain('integration-skill-docs');
    expect(html).toContain('status-badge-incomplete');
  });

  it('should list built-in plugins plus under-development marketplace plugins', () => {
    const html = render('plugins');
    expect(html).toContain('integration-view-plugins');
    expect(html).toContain('integration-plugin-browser-use');
    expect(html).toContain('integration-plugin-computer-use');
    expect(html).toContain('integration-plugin-document');
    expect(html).toContain('integration-plugin-pdf');
    expect(html).toContain('integration-plugin-spreadsheets');
    expect(html).toContain('integration-plugin-presentations');
    expect(html).toContain('integration-plugin-visualize');
    // marketplace items rendered inactive + under development
    expect(html).toContain('integration-plugin-pdf-viewer');
    expect(html).toContain('integration-plugin-small-business');
    expect(html).toContain('status-badge-under-development');
  });

  it('should render the MCP dashboard inside the Connectors panel', () => {
    const html = render('connectors');
    expect(html).toContain('Connectors');
    expect(html).toContain('integration-mcp');
    expect(html).toContain('MCP Stub');
  });
});

describe('Step 095: MCP Install Modal (Popup for Required Details)', () => {
  const githubEntry = {
    id: 'github',
    name: 'GitHub',
    description: 'Repository, issue, and pull-request automation.',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envKeys: [
      {
        key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        label: 'GitHub Personal Access Token',
        required: true,
        secret: true,
        url: 'https://github.com/settings/tokens'
      }
    ],
    tags: ['devtools'],
    icon: '🐙',
    homepage: 'https://github.com/modelcontextprotocol/servers'
  };

  it('should render a popup asking for required keys with industry framing', () => {
    const html = renderToString(
      React.createElement(McpInstallModal, {
        isOpen: true,
        entry: githubEntry as any,
        onClose: () => {},
        onInstall: () => {}
      })
    );
    expect(html).toContain('mcp-install-modal-content');
    expect(html).toContain('How this works');
    expect(html).toContain('GITHUB_PERSONAL_ACCESS_TOKEN');
    expect(html).toContain('/mcp');
    expect(html).toContain('toolName');
    expect(html).toContain('mcp-install-submit-github');
    // Surfaces the skills/capabilities the server unlocks
    expect(html).toContain('create-pr');
    expect(html).toContain('triage-issues');
    expect(html).toContain('Computer Use');
  });

  it('should not render when closed', () => {
    const html = renderToString(
      React.createElement(McpInstallModal, {
        isOpen: false,
        entry: githubEntry as any,
        onClose: () => {},
        onInstall: () => {}
      })
    );
    expect(html).not.toContain('mcp-install-modal-content');
  });
});
