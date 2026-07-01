import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getUserDataDirectory } from '@superagent/core';
import {
  parseCliArguments,
  createCliProgram,
  parseMarkdownTokens,
  TurnQueueManager,
  handleQueueShortcut,
  TranscriptManager,
  handleTranscriptToggleShortcut,
  cyclePermissionLevel,
  getPermissionLabel,
  handlePermissionCycleShortcut,
  App,
  Composer,
  MarkdownStream,
} from '../src/index.js';

describe('Phase 4: Terminal UI & CLI Shell Suite (Steps 061 - 067)', () => {
  beforeEach(async () => {
    try {
      const testSettingsDir = getUserDataDirectory();
      await fs.rm(testSettingsDir, { recursive: true, force: true });
    } catch {}
  });

  afterEach(async () => {
    try {
      const testSettingsDir = getUserDataDirectory();
      await fs.rm(testSettingsDir, { recursive: true, force: true });
    } catch {}
  });
  describe('Step 061: Commander CLI Binary & Argument Parser', () => {
    it('should parse CLI default options correctly', () => {
      const options = parseCliArguments([]);
      expect(options.provider).toBe('openai');
      expect(options.verbose).toBe(false);
      expect(options.permission).toBe('ask');
      expect(options.interactive).toBe(true);
    });

    it('should parse custom options and flags', () => {
      const options = parseCliArguments(['-p', 'anthropic', '-k', 'secret-key', '-v', '--permission', 'auto']);
      expect(options.provider).toBe('anthropic');
      expect(options.key).toBe('secret-key');
      expect(options.verbose).toBe(true);
      expect(options.permission).toBe('auto');
    });

    it('should handle chat command with positional prompt', () => {
      const onExecute = vi.fn();
      const program = createCliProgram(onExecute);
      program.parse(['chat', 'hello world', '-p', 'gemini'], { from: 'user' });
      expect(onExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'gemini',
          interactive: false,
        }),
        'hello world'
      );
    });
  });

  describe('Step 063: Streaming Markdown Terminal Renderer', () => {
    it('should parse markdown headers, bullets, and text tokens', () => {
      const markdown = '# Main Header\n- Bullet item 1\n* Bullet item 2\nNormal text line';
      const tokens = parseMarkdownTokens(markdown);
      expect(tokens).toHaveLength(4);
      expect(tokens[0]).toEqual({ type: 'header', text: '# Main Header' });
      expect(tokens[1]).toEqual({ type: 'bullet', text: '- Bullet item 1' });
      expect(tokens[2]).toEqual({ type: 'bullet', text: '* Bullet item 2' });
      expect(tokens[3]).toEqual({ type: 'text', text: 'Normal text line' });
    });

    it('should parse markdown code blocks correctly', () => {
      const markdown = 'Before code\n```typescript\nconst x = 10;\n```\nAfter code';
      const tokens = parseMarkdownTokens(markdown);
      expect(tokens).toHaveLength(3);
      expect(tokens[0]).toEqual({ type: 'text', text: 'Before code' });
      expect(tokens[1]).toEqual({
        type: 'codeblock',
        text: 'const x = 10;',
        language: 'typescript',
      });
      expect(tokens[2]).toEqual({ type: 'text', text: 'After code' });
    });
  });

  describe('Step 065: Turn Queueing Keyboard Shortcut (Tab)', () => {
    it('should manage turn queue items using TurnQueueManager', () => {
      const queue = new TurnQueueManager();
      expect(queue.count()).toBe(0);

      const item1 = queue.enqueue('First turn prompt');
      const item2 = queue.enqueue('Second turn prompt');
      expect(queue.count()).toBe(2);
      expect(item1?.prompt).toBe('First turn prompt');
      expect(item2?.prompt).toBe('Second turn prompt');

      const dequeued = queue.dequeue();
      expect(dequeued?.prompt).toBe('First turn prompt');
      expect(queue.count()).toBe(1);

      queue.clear();
      expect(queue.count()).toBe(0);
    });

    it('should trigger turn queueing on Tab key press when input exists', () => {
      const onQueue = vi.fn();
      const clearInput = vi.fn();

      const handled = handleQueueShortcut('Queued prompt text', { name: 'tab', shift: false }, onQueue, clearInput);
      expect(handled).toBe(true);
      expect(onQueue).toHaveBeenCalledWith('Queued prompt text');
      expect(clearInput).toHaveBeenCalled();
    });

    it('should ignore Tab key press if input is empty or Shift+Tab is pressed', () => {
      const onQueue = vi.fn();
      const clearInput = vi.fn();

      const handledEmpty = handleQueueShortcut('', { name: 'tab', shift: false }, onQueue, clearInput);
      expect(handledEmpty).toBe(false);

      const handledShiftTab = handleQueueShortcut('Text', { name: 'tab', shift: true }, onQueue, clearInput);
      expect(handledShiftTab).toBe(false);
      expect(onQueue).not.toHaveBeenCalled();
    });
  });

  describe('Step 066: Verbose Transcript Viewer Toggle (Ctrl+O)', () => {
    it('should record transcript logs and format verbose output', () => {
      const transcript = new TranscriptManager();
      transcript.addRecord('user', 'User question');
      transcript.addRecord('assistant', 'Assistant answer', { tokens: 42 });

      const records = transcript.getRecords();
      expect(records).toHaveLength(2);
      expect(records[0].content).toBe('User question');

      const formatted = transcript.formatVerboseTranscript();
      expect(formatted).toContain('[USER] User question');
      expect(formatted).toContain('[ASSISTANT] Assistant answer');
      expect(formatted).toContain('metadata: {"tokens":42}');
    });

    it('should toggle verbose mode on Ctrl+O', () => {
      const onToggle = vi.fn();
      const handled = handleTranscriptToggleShortcut({ name: 'o', ctrl: true }, false, onToggle);
      expect(handled).toBe(true);
      expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('should not toggle without Ctrl modifier', () => {
      const onToggle = vi.fn();
      const handled = handleTranscriptToggleShortcut({ name: 'o', ctrl: false }, false, onToggle);
      expect(handled).toBe(false);
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  describe('Step 067: Execution Permission Cycle Shortcut (Shift+Tab)', () => {
    it('should cycle through permission levels sequentially', () => {
      let level = cyclePermissionLevel('ask');
      expect(level).toBe('auto');
      level = cyclePermissionLevel(level);
      expect(level).toBe('deny');
      level = cyclePermissionLevel(level);
      expect(level).toBe('ask');
    });

    it('should provide human-readable labels for permission levels', () => {
      expect(getPermissionLabel('ask')).toBe('Ask Before Execution');
      expect(getPermissionLabel('auto')).toBe('Auto-Execute Tools');
      expect(getPermissionLabel('deny')).toBe('Deny Tool Execution');
    });

    it('should handle Shift+Tab shortcut for cycling permission levels', () => {
      const onChangeLevel = vi.fn();
      const handled = handlePermissionCycleShortcut({ name: 'tab', shift: true }, 'ask', onChangeLevel);
      expect(handled).toBe(true);
      expect(onChangeLevel).toHaveBeenCalledWith('auto');
    });
  });

  describe('Step 062 & Step 064: Component Exports Verification', () => {
    it('should export React UI components cleanly', () => {
      expect(App).toBeDefined();
      expect(Composer).toBeDefined();
      expect(MarkdownStream).toBeDefined();
    });
  });
});
