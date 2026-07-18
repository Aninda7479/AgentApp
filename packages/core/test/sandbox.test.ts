import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  PermissionModeController,
  TerminalShellExecutor,
  TerminalAccessControl,
  EnvironmentSanitizer,
  FileSystemInspector,
  AtomicFileWriter,
  UnifiedDiffGenerator,
  SandboxRunner
} from '../src/sandbox/index.js';

describe('Sandbox Engine Suite (Steps 009 - 015)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sandbox-test-'));
  });

  afterEach(async () => {
    if (tempDir && fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  // Step 009: Permission Mode Controller
  describe('Step 009: PermissionModeController', () => {
    it('should initialize with default read-only mode and switch modes', () => {
      const controller = new PermissionModeController();
      expect(controller.getMode()).toBe('read-only');
      expect(controller.canModifyFile()).toBe(false);
      expect(controller.canAutoExecuteCommand()).toBe(false);

      controller.setMode('auto-approve-edits');
      expect(controller.getMode()).toBe('auto-approve-edits');
      expect(controller.canModifyFile()).toBe(true);

      controller.setMode('full-autonomy');
      expect(controller.getMode()).toBe('full-autonomy');
      expect(controller.canAutoExecuteCommand()).toBe(true);
    });

    it('should handle confirmation handlers for approval requests', async () => {
      let requested = false;
      const controller = new PermissionModeController({
        initialMode: 'read-only',
        onConfirmationRequired: async (req) => {
          requested = true;
          return req.action === 'allowed_action';
        }
      });

      const res1 = await controller.requestApproval({ action: 'allowed_action' });
      expect(requested).toBe(true);
      expect(res1).toBe(true);

      const res2 = await controller.requestApproval({ action: 'disallowed' });
      expect(res2).toBe(false);
    });
  });

  // Step 010: Terminal Shell Executor
  describe('Step 010: TerminalShellExecutor', () => {
    it('should execute shell command and return output', async () => {
      const executor = new TerminalShellExecutor(
        new PermissionModeController({ initialMode: 'full-autonomy' })
      );
      const res = await executor.execute('echo "Hello Sandbox"', { timeoutMs: 5000 });
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Hello Sandbox');
      expect(res.timedOut).toBe(false);
    });

    it('should handle execution timeout gracefully', async () => {
      const executor = new TerminalShellExecutor(
        new PermissionModeController({ initialMode: 'full-autonomy' })
      );
      const isWindows = process.platform === 'win32';
      const cmd = isWindows ? 'Start-Sleep -Seconds 3' : 'sleep 3';
      const res = await executor.execute(cmd, { timeoutMs: 500 });
      expect(res.timedOut).toBe(true);
    });
  });

  // Step 011: Terminal Access Control & Whitelisting
  describe('Step 011: TerminalAccessControl', () => {
    it('should block dangerous commands and allow safe commands', () => {
      const access = new TerminalAccessControl();
      const checkBlocked = access.inspectCommand('rm -rf /');
      expect(checkBlocked.allowed).toBe(false);
      expect(checkBlocked.riskLevel).toBe('blocked');

      const checkDangerous = access.inspectCommand('rm file.txt');
      expect(checkDangerous.allowed).toBe(true);
      expect(checkDangerous.riskLevel).toBe('potentially_dangerous');

      const checkSafe = access.inspectCommand('echo hello');
      expect(checkSafe.allowed).toBe(true);
      expect(checkSafe.riskLevel).toBe('safe');
    });

    it('should support whitelisting exact commands', () => {
      const access = new TerminalAccessControl();
      access.addWhitelistedCommand('rm file.txt');
      const check = access.inspectCommand('rm file.txt');
      expect(check.allowed).toBe(true);
      expect(check.riskLevel).toBe('safe');
    });
  });

  // Step 012: Environment Variable Sanitizer
  describe('Step 012: EnvironmentSanitizer', () => {
    it('should redact sensitive patterns from text', () => {
      const sanitizer = new EnvironmentSanitizer();
      const text = 'API key is sk-123456789012345678901234 and Bearer mytoken123';
      const sanitized = sanitizer.sanitizeString(text);
      expect(sanitized).not.toContain('sk-123456789012345678901234');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should sanitize registered custom secrets and environment object', () => {
      const sanitizer = new EnvironmentSanitizer();
      sanitizer.registerSecret('my-super-secret');
      expect(sanitizer.sanitizeString('Secret is my-super-secret')).toBe('Secret is [REDACTED]');

      const env = {
        NORMAL_VAR: 'hello',
        MY_API_KEY: 'secret123'
      };
      const sanitizedEnv = sanitizer.sanitizeEnv(env);
      expect(sanitizedEnv.NORMAL_VAR).toBe('hello');
      expect(sanitizedEnv.MY_API_KEY).toBe('[REDACTED]');
    });
  });

  // Step 013: File System Inspector & Reading Engine
  describe('Step 013: FileSystemInspector', () => {
    it('should inspect text file and read line ranges accurately', async () => {
      const inspector = new FileSystemInspector();
      const testFile = path.join(tempDir, 'sample.txt');
      await fs.promises.writeFile(testFile, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5', 'utf8');

      const inspectRes = await inspector.inspect(testFile);
      expect(inspectRes.exists).toBe(true);
      expect(inspectRes.isFile).toBe(true);
      expect(inspectRes.isBinary).toBe(false);
      expect(inspectRes.totalLines).toBe(5);

      const readRes = await inspector.readFile(testFile, { startLine: 2, endLine: 4 });
      expect(readRes.startLine).toBe(2);
      expect(readRes.endLine).toBe(4);
      expect(readRes.content).toBe('Line 2\nLine 3\nLine 4');
    });

    it('should detect binary content', () => {
      const inspector = new FileSystemInspector();
      const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00]);
      expect(inspector.isBinaryBuffer(binaryBuffer)).toBe(true);
    });
  });

  // Step 014: Atomic File Writer & Patch Engine
  describe('Step 014: AtomicFileWriter', () => {
    it('should write files atomically', async () => {
      const writer = new AtomicFileWriter();
      const testFile = path.join(tempDir, 'atomic.txt');
      await writer.writeFileAtomic(testFile, 'Hello Atomic World');

      const content = await fs.promises.readFile(testFile, 'utf8');
      expect(content).toBe('Hello Atomic World');
    });

    it('should apply structured patch accurately', async () => {
      const writer = new AtomicFileWriter();
      const testFile = path.join(tempDir, 'patch.txt');
      await fs.promises.writeFile(testFile, 'Line A\nLine B\nLine C\nLine D', 'utf8');

      await writer.applyPatch(testFile, [
        {
          startLine: 2,
          endLine: 3,
          targetContent: 'Line B\nLine C',
          replacementContent: 'Line B Modified\nLine C Modified'
        }
      ]);

      const updatedContent = await fs.promises.readFile(testFile, 'utf8');
      expect(updatedContent).toBe('Line A\nLine B Modified\nLine C Modified\nLine D');
    });
  });

  // Step 015: Structured Unified Diff Generator
  describe('Step 015: UnifiedDiffGenerator', () => {
    it('should generate line-by-line unified diff output', () => {
      const generator = new UnifiedDiffGenerator();
      const oldStr = 'const a = 1;\nconst b = 2;\nconst c = 3;';
      const newStr = 'const a = 1;\nconst b = 20;\nconst c = 3;\nconst d = 4;';

      const diff = generator.generateDiff(oldStr, newStr, { filePath: 'test.ts' });
      expect(diff).toContain('--- a/test.ts');
      expect(diff).toContain('+++ b/test.ts');
      expect(diff).toContain('-const b = 2');
      expect(diff).toContain('+const b = 20');
      expect(diff).toContain('+const d = 4');
    });
  });

  // Step 016: SandboxRunner approval-gate integration
  // This is the path that surfaces the renderer permission dialog: a risky
  // command must invoke the injected `requestApproval` handler (which the desktop
  // host bridges to `agent-permission-request` -> <PermissionDialog>) and honor
  // its decision. Lower-level pieces are covered above; this proves they wire
  // together end-to-end without needing a browser.
  describe('Step 016: SandboxRunner approval-gate integration', () => {
    it('invokes requestApproval for a risky command and a denial blocks execution', async () => {
      let requested: any = null;
      const runner = new SandboxRunner({
        projectRoot: tempDir,
        permissionMode: 'auto-approve-edits',
        requestApproval: async (req) => { requested = req; return false; }
      });
      const marker = path.join(tempDir, 'do-not-delete.txt');
      await fs.promises.writeFile(marker, 'keep me', 'utf8');

      const res = await runner.runCommand('rm do-not-delete.txt');

      expect(requested).not.toBeNull();
      expect(requested.action).toBe('execute_command');
      expect(requested.command).toBe('rm do-not-delete.txt');
      expect(res.stderr).toMatch(/rejected by user permission/i);
      expect(res.exitCode).not.toBe(0);
      // Denial must prevent the command from running (file preserved).
      expect(fs.existsSync(marker)).toBe(true);
    });

    it('executes a risky command when requestApproval grants approval', async () => {
      let requested: any = null;
      const runner = new SandboxRunner({
        projectRoot: tempDir,
        permissionMode: 'auto-approve-edits',
        requestApproval: async (req) => { requested = req; return true; }
      });
      const marker = path.join(tempDir, 'delete-me.txt');
      await fs.promises.writeFile(marker, 'gone', 'utf8');

      const res = await runner.runCommand('rm delete-me.txt');

      expect(requested).not.toBeNull();
      expect(requested.action).toBe('execute_command');
      // Approved risky command must actually run (file removed), not be rejected.
      expect(res.stderr).not.toMatch(/rejected by user permission/i);
      expect(fs.existsSync(marker)).toBe(false);
    });

    it('full-autonomy mode skips requestApproval and runs risky commands', async () => {
      let called = false;
      const runner = new SandboxRunner({
        projectRoot: tempDir,
        permissionMode: 'full-autonomy',
        requestApproval: async () => { called = true; return true; }
      });
      const marker = path.join(tempDir, 'delete-anyway.txt');
      await fs.promises.writeFile(marker, 'gone', 'utf8');

      const res = await runner.runCommand('rm delete-anyway.txt');

      expect(called).toBe(false);
      expect(res.stderr).not.toMatch(/rejected by user permission/i);
      expect(fs.existsSync(marker)).toBe(false);
    });

    it('read-only mode prompts for non-readonly commands and honors approval', async () => {
      let requested: any = null;
      const runner = new SandboxRunner({
        projectRoot: tempDir,
        permissionMode: 'read-only',
        requestApproval: async (req) => { requested = req; return true; }
      });
      const marker = path.join(tempDir, 'ro-delete.txt');
      await fs.promises.writeFile(marker, 'gone', 'utf8');

      const res = await runner.runCommand('rm ro-delete.txt');

      expect(requested).not.toBeNull();
      expect(res.stderr).not.toMatch(/rejected by user permission/i);
      expect(fs.existsSync(marker)).toBe(false);
    });

    it('deny-all mode blocks every command (no allowlist → "Never approve")', async () => {
      let requested: any = null;
      const runner = new SandboxRunner({
        projectRoot: tempDir,
        permissionMode: 'deny-all',
        allowedCommands: [], // empty → deny-all gate is what fires
        requestApproval: async (req) => { requested = req; return true; }
      });
      const marker = path.join(tempDir, 'deny-delete.txt');
      await fs.promises.writeFile(marker, 'gone', 'utf8');

      const res = await runner.runCommand('rm deny-delete.txt');
      expect(requested).toBeNull(); // never asks the user
      expect(res.stderr).toMatch(/Never approve/i);
      expect(res.exitCode).toBe(126);
      expect(fs.existsSync(marker)).toBe(true); // never ran
    });

    it('deny-all mode still runs a command on the project allowlist', async () => {
      let requested: any = null;
      const runner = new SandboxRunner({
        projectRoot: tempDir,
        permissionMode: 'deny-all',
        allowedCommands: ['rm'], // first-token match permits rm *
        requestApproval: async (req) => { requested = req; return true; }
      });
      const marker = path.join(tempDir, 'allow-delete.txt');
      await fs.promises.writeFile(marker, 'gone', 'utf8');

      const res = await runner.runCommand('rm allow-delete.txt');
      expect(requested).toBeNull(); // allowlist path never prompts
      expect(res.stderr).not.toMatch(/Never approve/i);
      expect(fs.existsSync(marker)).toBe(false); // ran

      // A command NOT on the allowlist is blocked.
      const blocked = await runner.runCommand('git status');
      expect(blocked.stderr).toMatch(/allowed commands/i);
    });

    it('deny-all mode also blocks file writes', async () => {
      const runner = new SandboxRunner({
        projectRoot: tempDir,
        permissionMode: 'deny-all',
        requestApproval: async () => true
      });
      const target = path.join(tempDir, 'should-not-write.txt');
      const res = await runner.writeFile(target, 'nope');
      expect(res.written).toBe(false);
      expect(fs.existsSync(target)).toBe(false);
    });
  });
});
