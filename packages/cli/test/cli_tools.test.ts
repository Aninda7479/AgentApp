import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  createSessionContext,
  handleModelCommand,
  handleStatusCommand,
  handleLearnCommand,
  handleInitCommand,
  handleThemeCommand,
  ModelSwitcher,
  SessionTracker,
  SkillCodifier,
  ProjectContextGenerator,
  ThemeSwitcher,
  SystemDoctor,
  handleDoctorCommand,
  MIN_NODE_MAJOR
} from '../src/index.js';

describe('CLI Command Unit Tools', () => {
  const testTmpDir = path.join(process.cwd(), 'tmp', 'test_tmp_tools');

  beforeEach(async () => {
    await fs.mkdir(testTmpDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testTmpDir, { recursive: true, force: true });
    } catch {
      // ignore clean errors
    }
  });

  describe('Model Switcher (/model)', () => {
    it('should list available models', () => {
      const context = createSessionContext();
      const result = handleModelCommand(['list'], context);
      expect(result.success).toBe(true);
      expect(result.message).toContain('=== Available AI Models ===');
      expect(result.message).toContain('gpt-4o');
    });

    it('should switch active model to valid model', () => {
      const context = createSessionContext('openai', 'gpt-4o');
      const result = handleModelCommand(['claude-3-5-sonnet-20241022'], context);
      expect(result.success).toBe(true);
      expect(context.activeModel).toBe('claude-3-5-sonnet-20241022');
      expect(context.activeProvider).toBe('anthropic');
    });

    it('should switch provider and select default model', () => {
      const context = createSessionContext();
      const result = ModelSwitcher.switchProvider(context, 'gemini');
      expect(result.success).toBe(true);
      expect(context.activeProvider).toBe('gemini');
      expect(context.activeModel).toBe('gemini-2.5-flash');
    });
  });

  describe('Session Status & Token Meter (/status)', () => {
    it('should accurately report session metrics', () => {
      const context = createSessionContext();
      const tracker = new SessionTracker();
      tracker.recordTokenUsage(context, 500, 150, 0.0025);

      context.messages.push({ role: 'user', content: 'Hello agent' });
      context.messages.push({ role: 'assistant', content: 'Hello user' });

      const report = tracker.getStatusReport(context);
      expect(report.promptTokens).toBe(500);
      expect(report.completionTokens).toBe(150);
      expect(report.totalTokens).toBe(650);
      expect(report.estimatedCostUSD).toBe(0.0025);
      expect(report.messageCount).toBe(2);

      const commandRes = handleStatusCommand([], context);
      expect(commandRes.success).toBe(true);
      expect(commandRes.message).toContain('Total Tokens:      650');
    });
  });

  describe('Skill Codifier (/learn)', () => {
    it('should record insight and codify skills', async () => {
      const context = createSessionContext();
      const insightRes = await handleLearnCommand(['insight', 'Testing', 'Always write unit tests'], context);
      expect(insightRes.success).toBe(true);

      const skillRes = await SkillCodifier.codifySkill(
        context,
        'Web Scraping',
        'Scrape websites using Playwright',
        'Use page.goto and extract selectors.',
        testTmpDir
      );
      expect(skillRes.success).toBe(true);

      const skillFileExists = await fs.stat(path.join(testTmpDir, '.agent', 'skills', 'web-scraping', 'SKILL.md'));
      expect(skillFileExists.isFile()).toBe(true);

      const listRes = await handleLearnCommand(['list'], context);
      expect(listRes.message).toContain('Web Scraping');
      expect(listRes.message).toContain('Testing: Always write unit tests');
    });
  });

  describe('Project Context Generator (/init)', () => {
    it('should inspect and initialize project context files', async () => {
      const pkgPath = path.join(testTmpDir, 'package.json');
      await fs.writeFile(pkgPath, JSON.stringify({ name: 'test-app', version: '2.0.0', dependencies: { react: '^18.0.0' } }), 'utf-8');

      const initRes = await handleInitCommand([], testTmpDir);
      expect(initRes.success).toBe(true);

      const contextJson = JSON.parse(await fs.readFile(path.join(testTmpDir, '.agent', 'context.json'), 'utf-8'));
      expect(contextJson.projectName).toBe('test-app');
      expect(contextJson.frameworks).toContain('React');

      const agentsMd = await fs.readFile(path.join(testTmpDir, 'AGENTS.md'), 'utf-8');
      expect(agentsMd).toContain('# test-app — Agent Guidelines');

      // Re-running without force should fail
      const retryRes = await handleInitCommand([], testTmpDir);
      expect(retryRes.success).toBe(false);
    });
  });

  describe('Terminal Visual Theme Switcher (/theme)', () => {
    it('should list available themes and switch active theme', () => {
      const context = createSessionContext();
      const listRes = handleThemeCommand(['list'], context);
      expect(listRes.message).toContain('DRACULA');
      expect(listRes.message).toContain('CYBERPUNK');

      const switchRes = handleThemeCommand(['cyberpunk'], context);
      expect(switchRes.success).toBe(true);
      expect(context.activeTheme.name).toBe('cyberpunk');

      const invalidRes = handleThemeCommand(['nonexistent'], context);
      expect(invalidRes.success).toBe(false);
    });
  });

  describe('System Doctor (/doctor)', () => {
    it('should detect a supported Node.js runtime version', () => {
      const check = SystemDoctor.checkNodeVersion(MIN_NODE_MAJOR);
      expect(check.name).toBe('Node.js Runtime');
      expect(check.status).toBe('pass');
      expect(check.detail).toContain('Node.js v');
    });

    it('should fail when the Node.js version is below the minimum', () => {
      const check = SystemDoctor.checkNodeVersion(999);
      expect(check.status).toBe('fail');
    });

    it('should warn when no provider API key is configured', () => {
      const context = createSessionContext();
      const check = SystemDoctor.checkProviderKeys(context);
      expect(check.name).toBe('Provider API Keys');
      expect(check.status).toBe('warn');
    });

    it('should pass when a provider API key is configured', () => {
      const context = createSessionContext();
      context.byokManager.registerKey({ provider: 'openai', apiKey: 'sk-test' });
      const check = SystemDoctor.checkProviderKeys(context);
      expect(check.status).toBe('pass');
      expect(check.detail).toContain('1 provider key(s)');
    });

    it('should populate the model registry check', () => {
      const context = createSessionContext();
      const check = SystemDoctor.checkModelRegistry(context);
      expect(check.name).toBe('Model Registry');
      expect(check.status).toBe('pass');
      expect(check.detail).toContain('model capabilities registered');
    });

    it('should run a full diagnostic report with four checks', () => {
      const context = createSessionContext();
      const report = SystemDoctor.run(context);
      expect(report.checks).toHaveLength(4);
      expect(typeof report.healthy).toBe('boolean');
      const formatted = SystemDoctor.formatReport(report);
      expect(formatted).toContain('=== SuperAgent Doctor (Setup Diagnostics) ===');

      const cmdRes = handleDoctorCommand([], context);
      expect(cmdRes.success).toBe(report.healthy);
      expect(cmdRes.message).toBe(formatted);
    });
  });
});
