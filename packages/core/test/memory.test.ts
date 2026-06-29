import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ProjectInstructionsParser,
  UserProfileStore,
  TrajectoryTokenCounter,
  TrajectoryCompactor,
  LearningLoopEngine,
  SkillStore,
  AgentMessage
} from '../src/index.js';

describe('Memory Engine Suite (Steps 021 - 026)', () => {
  const testDir = path.join(process.cwd(), 'logs', 'test_memory_suite');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('Step 021: Project Guidelines Parser', () => {
    it('should parse content into sections and rules while sanitizing tokens', () => {
      const parser = new ProjectInstructionsParser();
      const content = `# Project Overview\nThis project uses sk-secret1234567890 for auth.\n\n# Guidelines\n- Rule 1: Always write clean code\n- Rule 2: Strict typing required`;
      const parsed = parser.parseContent(content, 'AGENT.md');

      expect(parsed.sourceType).toBe('agent');
      expect(parsed.rawContent).toContain('[REDACTED_TOKEN]');
      expect(parsed.sections.length).toBe(2);
      expect(parsed.rules).toEqual(['Rule 1: Always write clean code', 'Rule 2: Strict typing required']);
    });

    it('should discover and merge instruction files from workspace', async () => {
      const parser = new ProjectInstructionsParser();
      const agentFile = path.join(testDir, 'AGENT.md');
      const claudeFile = path.join(testDir, 'CLAUDE.md');

      await fs.writeFile(agentFile, '# Agent Rules\n- Maintain modularity', 'utf-8');
      await fs.writeFile(claudeFile, '# Claude Rules\n- Use ESM syntax', 'utf-8');

      const discovered = await parser.discoverAndParse(testDir);
      expect(discovered.length).toBe(2);

      const merged = parser.mergeInstructions(discovered);
      expect(merged.combinedPrompt).toContain('Maintain modularity');
      expect(merged.combinedPrompt).toContain('Use ESM syntax');
      expect(merged.rules.length).toBe(2);
    });
  });

  describe('Step 022: Global User Profile Memory Store', () => {
    it('should manage profile entries and sanitize sensitive values', async () => {
      const profilePath = path.join(testDir, 'user_profile.json');
      const store = new UserProfileStore(profilePath);

      await store.set('theme', 'dark', 'preference');
      await store.set('apiKey', 'sk-mysecretkey12345', 'environment');

      const themeEntry = await store.get('theme');
      expect(themeEntry?.value).toBe('dark');

      const keyEntry = await store.get('apiKey');
      expect(keyEntry?.value).toBe('[REDACTED_TOKEN]');

      const searchResult = await store.search('dark');
      expect(searchResult.length).toBe(1);
      expect(searchResult[0].key).toBe('theme');

      const deleted = await store.delete('theme');
      expect(deleted).toBe(true);
      expect(await store.get('theme')).toBeUndefined();
    });
  });

  describe('Step 023: Dynamic Trajectory Token Counter', () => {
    it('should calculate accurate trajectory usage and percentage', () => {
      const counter = new TrajectoryTokenCounter();
      const messages: AgentMessage[] = [
        { id: '1', role: 'user', content: 'Hello assistant', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'Hello! How can I help you today?', timestamp: Date.now() }
      ];

      const report = counter.calculateTrajectoryUsage(messages, [], 'System Prompt', 1000);
      expect(report.totalTokens).toBeGreaterThan(0);
      expect(report.systemTokens).toBeGreaterThan(0);
      expect(report.messageTokens).toBeGreaterThan(0);
      expect(report.usagePercentage).toBeGreaterThan(0);
    });
  });

  describe('Step 024: Automatic Trajectory Compactor', () => {
    it('should compact older trajectory turns when token limit threshold is reached', async () => {
      const compactor = new TrajectoryCompactor();
      const messages: AgentMessage[] = [
        { id: 'sys', role: 'system', content: 'System instructions', timestamp: Date.now() }
      ];

      // Add long conversation history
      for (let i = 1; i <= 10; i++) {
        messages.push({
          id: `msg-${i}`,
          role: i % 2 === 1 ? 'user' : 'assistant',
          content: `This is detailed message number ${i} containing contextual information and turn updates.`,
          timestamp: Date.now()
        });
      }

      const result = await compactor.compactTrajectory(messages, {
        maxContextTokens: 100, // force trigger by lowering max tokens
        triggerThresholdPercentage: 50,
        preserveRecentMessagesCount: 3
      });

      expect(result.wasCompacted).toBe(true);
      expect(result.compactedMessages.length).toBeLessThan(messages.length);
      expect(result.summaryCreated).toContain('[COMPACTED CONTEXT SUMMARY]');
      expect(result.compactedMessages[0].content).toBe('System instructions');
    });
  });

  describe('Step 025: Self-Improving Learning Loop Engine', () => {
    it('should extract learnings and manage insights in persistent store', async () => {
      const learnPath = path.join(testDir, 'learned_insights.json');
      const engine = new LearningLoopEngine(learnPath);

      await engine.saveInsight('Code Formatting', 'Prefer single quotes for imports', 'workflow_optimization');
      
      const trajectory: AgentMessage[] = [
        { id: '1', role: 'user', content: 'Please update code', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'Fixed build error and resolved compilation issue', timestamp: Date.now() },
        { id: '3', role: 'user', content: '/learn Always test before committing', timestamp: Date.now() }
      ];

      const extracted = await engine.extractLearningsFromTrajectory(trajectory);
      expect(extracted.length).toBe(2);

      const insights = await engine.getInsights('Always test');
      expect(insights.length).toBe(1);
      expect(insights[0].lesson).toContain('Always test before committing');
    });
  });

  describe('Step 026: Universal Skill Store & Discovery Manager', () => {
    it('should parse skill files and discover skills from directories', async () => {
      const store = new SkillStore();
      const skillFolder = path.join(testDir, 'my-skill');
      await fs.mkdir(skillFolder, { recursive: true });

      const skillContent = `---\nname: PDF Reader\ndescription: Reads and parses PDF documents\ntags: [pdf, document]\n---\n# Execution Steps\n1. Load file`;
      await fs.writeFile(path.join(skillFolder, 'SKILL.md'), skillContent, 'utf-8');

      const discovered = await store.discoverSkills(testDir);
      expect(discovered.length).toBe(1);
      expect(discovered[0].metadata.name).toBe('PDF Reader');

      const searchResult = store.searchSkills('document');
      expect(searchResult.length).toBe(1);
      expect(searchResult[0].id).toBe('pdf-reader');
    });
  });
});
