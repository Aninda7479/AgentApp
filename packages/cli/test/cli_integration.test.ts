import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getUserDataDirectory } from '@superagent/core';
import {
  createSessionContext,
  processSlashCommand,
  executeScript,
  ProjectContextGenerator
} from '../src/index.js';

describe('Step 080: CLI Integration Verification Suite', () => {
  const integrationTmpDir = path.join(process.cwd(), 'tmp', 'test_tmp_integration');

  beforeEach(async () => {
    await fs.mkdir(integrationTmpDir, { recursive: true });
    try {
      const testSettingsDir = getUserDataDirectory();
      await fs.rm(testSettingsDir, { recursive: true, force: true });
    } catch { }
  });

  afterEach(async () => {
    try {
      await fs.rm(integrationTmpDir, { recursive: true, force: true });
      const testSettingsDir = getUserDataDirectory();
      await fs.rm(testSettingsDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('should execute end-to-end interactive slash command workflows seamlessly', async () => {
    const context = createSessionContext('openai', 'gpt-4o');

    // 1. Initial status check
    const status1 = await processSlashCommand('/status', context);
    expect(status1).toContain('Active Model:      gpt-4o');

    // 2. Switch model and theme
    const modelRes = await processSlashCommand('/model claude-3-7-sonnet-20250219', context);
    expect(modelRes).toContain('Active model switched to');
    expect(context.activeModel).toBe('claude-3-7-sonnet-20250219');

    const themeRes = await processSlashCommand('/theme dracula', context);
    expect(themeRes).toContain("switched to 'DRACULA'");
    expect(context.activeTheme.name).toBe('dracula');

    // 3. Learn insights and skills
    const learnInsightRes = await processSlashCommand('/learn insight Architecture Use clean decoupled functions', context);
    expect(learnInsightRes).toContain('recorded successfully');

    // 4. Verify updated status report
    const status2 = await processSlashCommand('/status', context);
    expect(status2).toContain('Visual Theme:      dracula');
  });

  it('should execute non-interactive scripting mode (superagent exec) with prompt and file output', async () => {
    const outputFile = path.join(integrationTmpDir, 'exec_out.txt');

    const result = await executeScript({
      prompt: 'Summarize project structure',
      provider: 'openai',
      model: 'gpt-4o-mini',
      output: outputFile,
      silent: true
    });

    expect(result.success).toBe(true);
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);

    const savedContent = await fs.readFile(outputFile, 'utf-8');
    expect(savedContent.length).toBeGreaterThan(0);
  });

  it('should execute superagent exec reading input file and returning JSON output', async () => {
    const inputFile = path.join(integrationTmpDir, 'task_prompt.txt');
    await fs.writeFile(inputFile, 'Automate test bench build step.', 'utf-8');

    const result = await executeScript({
      file: inputFile,
      json: true,
      silent: true
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Automate test bench build step');
  });

  it('should handle project init and verify generated metadata', async () => {
    const targetFolder = path.join(integrationTmpDir, 'subproject');
    await fs.mkdir(targetFolder, { recursive: true });
    await fs.writeFile(
      path.join(targetFolder, 'package.json'),
      JSON.stringify({ name: 'sub-cli', version: '0.5.0', dependencies: { typescript: '^5.0.0' } }),
      'utf-8'
    );

    const initResult = await ProjectContextGenerator.generateContext(targetFolder, true);
    expect(initResult.success).toBe(true);

    const contextJson = await fs.readFile(path.join(targetFolder, '.agent', 'context.json'), 'utf-8');
    expect(contextJson).toContain('sub-cli');
    expect(contextJson).toContain('TypeScript');
  });
});
