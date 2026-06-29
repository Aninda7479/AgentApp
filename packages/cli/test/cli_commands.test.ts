import { describe, it, expect, beforeEach } from 'vitest';
import {
  HistorySearch,
  EditorBridge,
  ClipboardCopier,
  MockClipboard,
  SlashCommandRouter,
  ContextCompressor,
  registerCompactCommand,
  ContextMessage,
  DiffReviewer,
  registerDiffCommand
} from '../src/index.js';

describe('CLI Shortcuts & Slash Commands Suite (Steps 068 - 073)', () => {
  describe('Step 068: Reverse History Prompt Search (HistorySearch)', () => {
    let historySearch: HistorySearch;

    beforeEach(() => {
      historySearch = new HistorySearch(['git status', 'npm test', 'docker compose up', 'git commit -m "fix"']);
    });

    it('should initialize with history items and support adding new items', () => {
      expect(historySearch.getHistory()).toHaveLength(4);
      historySearch.addHistory('npm run build');
      expect(historySearch.getHistory()).toHaveLength(5);
      expect(historySearch.getHistory()).toContain('npm run build');
    });

    it('should ignore duplicate consecutive items or empty strings', () => {
      historySearch.addHistory('npm run build');
      historySearch.addHistory('npm run build');
      historySearch.addHistory('  ');
      expect(historySearch.getHistory().filter((h) => h === 'npm run build')).toHaveLength(1);
    });

    it('should perform fuzzy search and cycle through matching results', () => {
      historySearch.startSearch();
      expect(historySearch.isActive()).toBe(true);

      historySearch.setQuery('git');
      expect(historySearch.getMatchedCount()).toBe(2);
      expect(historySearch.getCurrentMatch()).toBe('git commit -m "fix"');

      expect(historySearch.nextMatch()).toBe('git status');
      expect(historySearch.nextMatch()).toBe('git commit -m "fix"');
      expect(historySearch.previousMatch()).toBe('git status');
    });

    it('should cancel search cleanly', () => {
      historySearch.startSearch();
      historySearch.setQuery('docker');
      historySearch.cancelSearch();
      expect(historySearch.isActive()).toBe(false);
      expect(historySearch.getQuery()).toBe('');
      expect(historySearch.getCurrentMatch()).toBeNull();
    });
  });

  describe('Step 069: External Text Editor Bridge (EditorBridge)', () => {
    it('should initialize with default editor and options', () => {
      const bridge = new EditorBridge({ editorCommand: 'nano', extension: '.md' });
      expect(bridge.getEditorCommand()).toBe('nano');
    });

    it('should create and clean up temporary file during sync operation simulation', () => {
      const bridge = new EditorBridge({ editorCommand: 'echo test' });
      const tempPath = bridge.createTempFile('Initial content');
      expect(tempPath).toContain('superagent_prompt_');
    });

    it('should correctly identify editor shortcut keys', () => {
      expect(EditorBridge.isEditorShortcut({ ctrl: true, name: 'g' })).toBe(true);
      expect(EditorBridge.isEditorShortcut({ ctrl: true, name: 'e' })).toBe(true);
      expect(EditorBridge.isEditorShortcut({ sequence: '\x07' })).toBe(true);
      expect(EditorBridge.isEditorShortcut({ ctrl: true, name: 'a' })).toBe(false);
    });
  });

  describe('Step 070: Clipboard Output Copier (ClipboardCopier)', () => {
    let mockClipboard: MockClipboard;
    let copier: ClipboardCopier;

    beforeEach(() => {
      mockClipboard = new MockClipboard();
      copier = new ClipboardCopier(mockClipboard);
    });

    it('should extract code blocks from markdown output', () => {
      const markdown = 'Here is some text\n```typescript\nconst x = 42;\n```\nAnd another:\n```python\nprint("hello")\n```';
      copier.setLastOutput(markdown);
      const blocks = copier.getCodeBlocks();
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toBe('const x = 42;');
      expect(blocks[1]).toBe('print("hello")');
    });

    it('should copy full last output to clipboard', () => {
      copier.setLastOutput('Hello world output');
      const result = copier.copyLastOutput();
      expect(result).toBe(true);
      expect(mockClipboard.lastCopied).toBe('Hello world output');
    });

    it('should copy specific code block by index', () => {
      const markdown = '```js\nconsole.log(1);\n```\n```js\nconsole.log(2);\n```';
      copier.setLastOutput(markdown);
      const result = copier.copyCodeBlock(1);
      expect(result).toBe(true);
      expect(mockClipboard.lastCopied).toBe('console.log(2);');
    });
  });

  describe('Step 071: Built-in Slash Command Router (SlashCommandRouter)', () => {
    let router: SlashCommandRouter;

    beforeEach(() => {
      router = new SlashCommandRouter();
    });

    it('should register commands and aliases and parse inputs', () => {
      router.register(
        'testcmd',
        (ctx) => ({ success: true, command: ctx.command, output: `Ran ${ctx.args[0]}` }),
        { description: 'Test command', aliases: ['tc'] }
      );

      expect(router.isSlashCommand('/testcmd arg1')).toBe(true);
      expect(router.isSlashCommand('hello')).toBe(false);

      const parsed = router.parse('/testcmd arg1 arg2');
      expect(parsed?.command).toBe('testcmd');
      expect(parsed?.args).toEqual(['arg1', 'arg2']);
    });

    it('should execute registered command and handle aliases', async () => {
      router.register(
        'echo',
        (ctx) => ({ success: true, command: ctx.command, output: ctx.rawArgs }),
        { description: 'Echo command', aliases: ['say'] }
      );

      const res1 = await router.execute('/echo hello world');
      expect(res1.success).toBe(true);
      expect(res1.output).toBe('hello world');

      const res2 = await router.execute('/say alias test');
      expect(res2.success).toBe(true);
      expect(res2.output).toBe('alias test');
    });

    it('should return error for unknown slash command', async () => {
      const res = await router.execute('/unknown');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unknown slash command');
    });
  });

  describe('Step 072: Context Compression Slash Command (/compact)', () => {
    it('should compact context turns leaving system message and recent turns', async () => {
      const messages: ContextMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Turn 1' },
        { role: 'assistant', content: 'Ans 1' },
        { role: 'user', content: 'Turn 2' },
        { role: 'assistant', content: 'Ans 2' },
        { role: 'user', content: 'Turn 3' },
        { role: 'assistant', content: 'Ans 3' },
        { role: 'user', content: 'Turn 4' },
        { role: 'assistant', content: 'Ans 4' }
      ];

      const result = await ContextCompressor.compress(messages, { keepRecentCount: 2 });
      expect(result.summaryAdded).toBe(true);
      expect(result.compactedCount).toBe(4); // system + summary + 2 recent
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[1].content).toContain('Context summary');
    });

    it('should handle /compact command execution via SlashCommandRouter', async () => {
      const router = new SlashCommandRouter();
      let messages: ContextMessage[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Msg 1' },
        { role: 'assistant', content: 'Ans 1' },
        { role: 'user', content: 'Msg 2' },
        { role: 'assistant', content: 'Ans 2' },
        { role: 'user', content: 'Msg 3' },
        { role: 'assistant', content: 'Ans 3' }
      ];

      registerCompactCommand(
        router,
        () => messages,
        (newMsgs) => {
          messages = newMsgs;
        },
        { keepRecentCount: 2 }
      );

      const res = await router.execute('/compact');
      expect(res.success).toBe(true);
      expect(res.output).toContain('Context compacted!');
      expect(messages.length).toBeLessThan(7);
    });
  });

  describe('Step 073: Interactive Visual Diff Reviewer (/diff)', () => {
    let reviewer: DiffReviewer;
    let router: SlashCommandRouter;

    beforeEach(() => {
      reviewer = new DiffReviewer();
      router = new SlashCommandRouter();
      registerDiffCommand(router, reviewer);
    });

    it('should generate diff lines correctly', () => {
      const orig = 'line 1\nline 2\nline 3';
      const mod = 'line 1\nline 2 modified\nline 3\nline 4';
      const lines = DiffReviewer.generateDiffLines(orig, mod);
      expect(lines.some((l) => l.type === 'delete')).toBe(true);
      expect(lines.some((l) => l.type === 'add')).toBe(true);
    });

    it('should manage file changes accept and reject lifecycle', async () => {
      const change1 = reviewer.addChange('src/a.ts', 'const a = 1;', 'const a = 2;');
      const change2 = reviewer.addChange('src/b.ts', 'const b = 1;', 'const b = 3;');

      expect(reviewer.getPendingChanges()).toHaveLength(2);

      const resList = await router.execute('/diff list');
      expect(resList.output).toContain('Pending Diffs: 2/2 files.');

      const resAccept = await router.execute(`/diff accept ${change1.id}`);
      expect(resAccept.success).toBe(true);
      expect(reviewer.getPendingChanges()).toHaveLength(1);

      const resRejectAll = await router.execute('/diff reject all');
      expect(resRejectAll.success).toBe(true);
      expect(reviewer.getPendingChanges()).toHaveLength(0);
    });

    it('should view diff details via /diff view', async () => {
      const change = reviewer.addChange('test.txt', 'hello', 'hello world');
      const resView = await router.execute(`/diff view ${change.id}`);
      expect(resView.success).toBe(true);
      expect(resView.output).toContain('=== Diff: test.txt ===');
    });
  });
});
