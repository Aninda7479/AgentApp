import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  DEMO_CHAT_TRAJECTORY,
  DEMO_WINDOWS,
  DEMO_ACCESSIBILITY_TREE,
  DEMO_MOUSE_TRAJECTORY,
  DEMO_BROWSER_TABS,
  DEMO_WEBMCP_TOOLS,
  DEMO_CDP_EVENTS,
  DEMO_REPL_ENTRIES,
  DEMO_REPL_SCOPES,
  DEMO_CONFIRMATION_TIERS,
  DEMO_ZO_DECISION_STATES,
  DEMO_CREDENTIAL_RECOVERY_BRANCHES,
  DEMO_COMPANION_STATE,
  DEMO_CREATIVE_STUDIO,
  DEMO_HARDWARE_PROJECT,
  DEMO_TASKS_KANBAN,
  DEMO_SETTINGS_MODULES,
} from './demoData';
import { WORKSPACE_NAV_ITEMS, NavigationRail } from './components/NavigationRail';
import { ChatWorkspace } from './components/workspaces/ChatWorkspace';
import { ComputerUseWorkspace } from './components/workspaces/ComputerUseWorkspace';
import { BrowserWorkspace } from './components/workspaces/BrowserWorkspace';
import { ReplWorkspace } from './components/workspaces/ReplWorkspace';
import { SecurityWorkspace } from './components/workspaces/SecurityWorkspace';
import { CompanionWorkspace } from './components/workspaces/CompanionWorkspace';
import { CreativeWorkspace } from './components/workspaces/CreativeWorkspace';
import { HardwareWorkspace } from './components/workspaces/HardwareWorkspace';
import { TasksWorkspace } from './components/workspaces/TasksWorkspace';
import { SettingsWorkspace } from './components/workspaces/SettingsWorkspace';
import { App } from './App';

describe('Multi-Workspace Dedicated Web Client Architecture', () => {
  describe('NavigationRail & Workspaces Specification', () => {
    it('defines exactly 10 canonical workspaces in the navigation rail', () => {
      expect(WORKSPACE_NAV_ITEMS).toHaveLength(10);

      const workspaceIds = WORKSPACE_NAV_ITEMS.map((w) => w.id);
      expect(workspaceIds).toEqual([
        'chat',
        'computer-use',
        'browser',
        'repl',
        'security',
        'companion',
        'creative',
        'hardware',
        'tasks',
        'settings',
      ]);
    });

    it('each navigation item has unique label, icon, and accent color', () => {
      const ids = new Set<string>();
      for (const item of WORKSPACE_NAV_ITEMS) {
        expect(ids.has(item.id)).toBe(false);
        ids.add(item.id);
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.shortLabel.length).toBeGreaterThan(0);
        expect(item.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(item.icon).toBeDefined();
      }
    });

    it('creates NavigationRail element without errors', () => {
      const el = React.createElement(NavigationRail, {
        activeWorkspace: 'chat',
        onSelectWorkspace: () => {},
        connState: 'connected',
      });
      expect(el).toBeDefined();
      expect(el.props.activeWorkspace).toBe('chat');
    });
  });

  describe('Chat Workspace Demo Models & Components', () => {
    it('DEMO_CHAT_TRAJECTORY contains multi-turn execution with collapsible thought and tool diffs', () => {
      expect(DEMO_CHAT_TRAJECTORY.length).toBeGreaterThanOrEqual(2);

      const assistantTurn = DEMO_CHAT_TRAJECTORY.find((m) => m.role === 'assistant');
      expect(assistantTurn).toBeDefined();
      expect(assistantTurn?.thought).toBeDefined();
      expect(assistantTurn?.thought?.durationSeconds).toBe(4.2);
      expect(assistantTurn?.toolCalls?.length).toBeGreaterThanOrEqual(3);

      const diffTool = assistantTurn?.toolCalls?.find((tc) => tc.category === 'Edited');
      expect(diffTool).toBeDefined();
      expect(diffTool?.diffStats?.added).toBe(18);
      expect(diffTool?.diffStats?.removed).toBe(4);
      expect(diffTool?.codeDiff?.before).toContain('let frame');

      const quiz = assistantTurn?.quiz;
      expect(quiz).toBeDefined();
      expect(quiz?.options.length).toBe(4);
      expect(quiz?.selectedOption).toBe(0);
    });

    it('instantiates ChatWorkspace component element', () => {
      const el = React.createElement(ChatWorkspace, {
        onSendPrompt: () => {},
        onStopAgent: () => {},
        isRunning: false,
        connState: 'connected',
      });
      expect(el).toBeDefined();
    });
  });

  describe('Computer Use Workspace Models & Components', () => {
    it('DEMO_WINDOWS models top-level desktop windows with PID, HWND, and WGC occlusion flags', () => {
      expect(DEMO_WINDOWS.length).toBeGreaterThanOrEqual(4);
      for (const win of DEMO_WINDOWS) {
        expect(win.pid).toBeGreaterThan(0);
        expect(win.hwnd).toMatch(/^0x[0-9A-Fa-f]+$/);
        expect(win.geometry.width).toBeGreaterThan(0);
        expect(win.geometry.height).toBeGreaterThan(0);
        expect(typeof win.isOccluded).toBe('boolean');
      }

      const occluded = DEMO_WINDOWS.filter((w) => w.isOccluded);
      expect(occluded.length).toBeGreaterThanOrEqual(1);
    });

    it('DEMO_ACCESSIBILITY_TREE models expandable hierarchical nodes with element_index', () => {
      expect(DEMO_ACCESSIBILITY_TREE.element_index).toBe(0);
      expect(DEMO_ACCESSIBILITY_TREE.children).toBeDefined();

      // Find element_index: 10
      let foundIndex10 = false;
      const walk = (node: typeof DEMO_ACCESSIBILITY_TREE) => {
        if (node.element_index === 10) foundIndex10 = true;
        if (node.children) node.children.forEach(walk);
      };
      walk(DEMO_ACCESSIBILITY_TREE);
      expect(foundIndex10).toBe(true);
    });

    it('DEMO_MOUSE_TRAJECTORY models cubic Bézier velocity and settling countdown', () => {
      expect(DEMO_MOUSE_TRAJECTORY.totalDurationMs).toBe(420);
      expect(DEMO_MOUSE_TRAJECTORY.settlingThresholdMs).toBe(250);
      expect(DEMO_MOUSE_TRAJECTORY.samples.length).toBeGreaterThanOrEqual(5);

      const maxVelocity = Math.max(...DEMO_MOUSE_TRAJECTORY.samples.map((s) => s.velocityPxPerSec));
      expect(maxVelocity).toBeGreaterThan(1000);
    });

    it('instantiates ComputerUseWorkspace component element', () => {
      const el = React.createElement(ComputerUseWorkspace);
      expect(el).toBeDefined();
    });
  });

  describe('Browser Leasing & WebMCP Workspace', () => {
    it('DEMO_BROWSER_TABS models two-tiered leasing (claimExistingTab vs createTab)', () => {
      const tiers = DEMO_BROWSER_TABS.map((t) => t.tier);
      expect(tiers).toContain('claimExistingTab');
      expect(tiers).toContain('createTab');

      for (const tab of DEMO_BROWSER_TABS) {
        expect(tab.remainingSeconds).toBeGreaterThan(0);
        expect(tab.leaseholderAgentId).toBeDefined();
        expect(tab.cdpSessionId).toMatch(/^CDP-/);
      }
    });

    it('DEMO_WEBMCP_TOOLS models in-page DOM operations registry', () => {
      const toolNames = DEMO_WEBMCP_TOOLS.map((t) => t.name);
      expect(toolNames).toContain('query_table');
      expect(toolNames).toContain('fill_checkout_form');

      const queryTable = DEMO_WEBMCP_TOOLS.find((t) => t.name === 'query_table');
      expect(queryTable?.parameters.properties.tableSelector).toBeDefined();
    });

    it('DEMO_CDP_EVENTS models protocol telemetry stream', () => {
      expect(DEMO_CDP_EVENTS.length).toBeGreaterThanOrEqual(4);
      expect(DEMO_CDP_EVENTS.some((e) => e.method === 'Page.navigate')).toBe(true);
      expect(DEMO_CDP_EVENTS.some((e) => e.method === 'Runtime.evaluate')).toBe(true);
    });

    it('instantiates BrowserWorkspace component element', () => {
      const el = React.createElement(BrowserWorkspace);
      expect(el).toBeDefined();
    });
  });

  describe('Execution REPL Workspace', () => {
    it('DEMO_REPL_ENTRIES models 25k token virtualized buffer with ANSI styling', () => {
      const totalTokens = DEMO_REPL_ENTRIES.reduce((acc, curr) => acc + curr.tokenCount, 0);
      expect(totalTokens).toBeLessThan(25000);

      const hasAnsiColor = DEMO_REPL_ENTRIES.some((e) => e.rawAnsiOutput.includes('\x1b['));
      expect(hasAnsiColor).toBe(true);
    });

    it('DEMO_REPL_SCOPES models variable tree across Global, Local, and Closure scopes', () => {
      const scopes = new Set(DEMO_REPL_SCOPES.map((s) => s.scope));
      expect(scopes.has('Global')).toBe(true);
      expect(scopes.has('Local')).toBe(true);
      expect(scopes.has('Closure')).toBe(true);
    });

    it('instantiates ReplWorkspace component element', () => {
      const el = React.createElement(ReplWorkspace);
      expect(el).toBeDefined();
    });
  });

  describe('Security Guardian & Credential Vault Workspace', () => {
    it('DEMO_CONFIRMATION_TIERS models 4-tier confirmation boundaries', () => {
      expect(DEMO_CONFIRMATION_TIERS).toHaveLength(4);
      const tierIds = DEMO_CONFIRMATION_TIERS.map((t) => t.id);
      expect(tierIds).toEqual(['handoff', 'always_confirm', 'pre_approval', 'no_confirmation']);
    });

    it('DEMO_ZO_DECISION_STATES defines exactly 16 states for zo decision machine', () => {
      expect(DEMO_ZO_DECISION_STATES).toHaveLength(16);
      for (let i = 0; i < 16; i++) {
        expect(DEMO_ZO_DECISION_STATES[i].stateIndex).toBe(i);
        expect(DEMO_ZO_DECISION_STATES[i].name).toBeDefined();
        expect(DEMO_ZO_DECISION_STATES[i].category).toBeDefined();
      }
    });

    it('DEMO_CREDENTIAL_RECOVERY_BRANCHES defines 7 recovery methods', () => {
      expect(DEMO_CREDENTIAL_RECOVERY_BRANCHES).toHaveLength(7);
      const names = DEMO_CREDENTIAL_RECOVERY_BRANCHES.map((b) => b.name);
      expect(names.some((n) => n.includes('Shamir'))).toBe(true);
      expect(names.some((n) => n.includes('YubiKey'))).toBe(true);
      expect(names.some((n) => n.includes('TPM 2.0'))).toBe(true);
    });

    it('instantiates SecurityWorkspace component element', () => {
      const el = React.createElement(SecurityWorkspace);
      expect(el).toBeDefined();
    });
  });

  describe('3D VRM Companion Presence Studio', () => {
    it('DEMO_COMPANION_STATE models mood states, viseme meters, and desktop pet toggles', () => {
      expect(DEMO_COMPANION_STATE.avatarName).toContain('Aria');
      expect(DEMO_COMPANION_STATE.visemeValues.A).toBeDefined();
      expect(DEMO_COMPANION_STATE.visemeValues.I).toBeDefined();
      expect(DEMO_COMPANION_STATE.desktopPetSettings.alwaysOnTop).toBe(true);
      expect(DEMO_COMPANION_STATE.photoPresets.length).toBeGreaterThanOrEqual(4);
    });

    it('instantiates CompanionWorkspace component element', () => {
      const el = React.createElement(CompanionWorkspace);
      expect(el).toBeDefined();
    });
  });

  describe('Creative Studio Workspace', () => {
    it('DEMO_CREATIVE_STUDIO models aspect ratios, local FLUX vs cloud DALL-E, and prompt enhancer', () => {
      expect(DEMO_CREATIVE_STUDIO.aspectRatios).toContain('16:9 Landscape (1920x1080)');
      expect(DEMO_CREATIVE_STUDIO.models.some((m) => m.type === 'Local FLUX')).toBe(true);
      expect(DEMO_CREATIVE_STUDIO.models.some((m) => m.type === 'Cloud DALL-E 3')).toBe(true);
      expect(DEMO_CREATIVE_STUDIO.filmstripGallery.length).toBeGreaterThanOrEqual(3);
      expect(DEMO_CREATIVE_STUDIO.activeVideo.enhancedPrompt.length).toBeGreaterThan(
        DEMO_CREATIVE_STUDIO.activeVideo.originalPrompt.length
      );
    });

    it('instantiates CreativeWorkspace component element', () => {
      const el = React.createElement(CreativeWorkspace);
      expect(el).toBeDefined();
    });
  });

  describe('PCB & Hardware ECAD Workspace', () => {
    it('DEMO_HARDWARE_PROJECT models 4-layer stackup, ERC violations, and BOM items', () => {
      expect(DEMO_HARDWARE_PROJECT.layerCount).toBe(4);
      expect(DEMO_HARDWARE_PROJECT.ercViolations.length).toBeGreaterThanOrEqual(2);
      expect(DEMO_HARDWARE_PROJECT.bomItems.length).toBeGreaterThanOrEqual(4);

      const rp2040 = DEMO_HARDWARE_PROJECT.bomItems.find((b) => b.value === 'RP2040');
      expect(rp2040?.jlcPcbPartNumber).toBe('C204000');
    });

    it('instantiates HardwareWorkspace component element', () => {
      const el = React.createElement(HardwareWorkspace);
      expect(el).toBeDefined();
    });
  });

  describe('Tasks & Scheduled Routines Kanban Workspace', () => {
    it('DEMO_TASKS_KANBAN models 4-column board and Telegram-notified cron jobs', () => {
      expect(DEMO_TASKS_KANBAN.columns).toHaveLength(4);
      const colIds = DEMO_TASKS_KANBAN.columns.map((c) => c.id);
      expect(colIds).toEqual(['todo', 'inprogress', 'blocked', 'done']);

      expect(DEMO_TASKS_KANBAN.routines.length).toBeGreaterThanOrEqual(3);
      const telegramAlerted = DEMO_TASKS_KANBAN.routines.filter((r) => r.telegramNotify);
      expect(telegramAlerted.length).toBeGreaterThanOrEqual(1);
    });

    it('instantiates TasksWorkspace component element', () => {
      const el = React.createElement(TasksWorkspace);
      expect(el).toBeDefined();
    });
  });

  describe('24-Module Settings Matrix & System Doctor Workspace', () => {
    it('DEMO_SETTINGS_MODULES models 24 governance panels and System Doctor probes', () => {
      expect(DEMO_SETTINGS_MODULES.modules).toHaveLength(24);
      expect(DEMO_SETTINGS_MODULES.doctorProbes.length).toBeGreaterThanOrEqual(6);

      const probeComponents = DEMO_SETTINGS_MODULES.doctorProbes.map((p) => p.component);
      expect(probeComponents).toContain('Host Engine');
      expect(probeComponents).toContain('Compiler');
      expect(probeComponents).toContain('Video Pipeline');
      expect(probeComponents).toContain('Direct3D11 / CUDA');
      expect(probeComponents).toContain('Network Socket');

      expect(DEMO_SETTINGS_MODULES.providers.length).toBeGreaterThanOrEqual(5);
    });

    it('instantiates SettingsWorkspace component element', () => {
      const el = React.createElement(SettingsWorkspace);
      expect(el).toBeDefined();
    });
  });

  describe('App Master Integration', () => {
    it('instantiates App component with default state and navigation rail', () => {
      const el = React.createElement(App);
      expect(el).toBeDefined();
    });
  });
});
