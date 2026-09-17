import { describe, it, expect } from 'vitest';
import { TrajectoryService } from './trajectory';
import type { TrajectoryStep } from './types';

describe('TrajectoryService', () => {
  describe('getFileLanguageBadge', () => {
    it('returns Rust badge for .rs files', () => {
      const badge = TrajectoryService.getFileLanguageBadge('src/models.rs');
      expect(badge.icon).toBe('🦀');
      expect(badge.label).toBe('Rust');
    });

    it('returns TypeScript / React badge for .ts and .tsx files', () => {
      const badgeTsx = TrajectoryService.getFileLanguageBadge('Composer.tsx');
      expect(badgeTsx.icon).toBe('⚛️');
      const badgeTs = TrajectoryService.getFileLanguageBadge('trajectory.ts');
      expect(badgeTs.icon).toBe('⚛️');
    });

    it('returns Python badge for .py files', () => {
      const badge = TrajectoryService.getFileLanguageBadge('script.py');
      expect(badge.icon).toBe('🐍');
      expect(badge.label).toBe('Python');
    });

    it('returns default badge for unknown extensions', () => {
      const badge = TrajectoryService.getFileLanguageBadge('data.bin');
      expect(badge.icon).toBe('📄');
    });
  });

  describe('parseToolDetails', () => {
    it('parses view_file / read_file with line ranges', () => {
      const step: TrajectoryStep = {
        id: '1',
        type: 'tool_call',
        toolName: 'view_file',
        content: 'file content',
        metadata: {
          toolInput: {
            AbsolutePath: 'packages/core_v2/src/models.rs',
            StartLine: 50,
            EndLine: 180,
          },
        },
      };

      const details = TrajectoryService.parseToolDetails(step);
      expect(details.category).toBe('analyze');
      expect(details.actionLabel).toBe('Analyzed');
      expect(details.icon).toBe('🦀');
      expect(details.targetName).toBe('models.rs');
      expect(details.lineRange).toBe('#L50-180');
    });

    it('parses edit_file / replace_file_content with diff stats', () => {
      const step: TrajectoryStep = {
        id: '2',
        type: 'tool_call',
        toolName: 'replace_file_content',
        content: 'success',
        metadata: {
          filename: 'engine.rs',
          addedLines: 36,
          removedLines: 0,
        },
      };

      const details = TrajectoryService.parseToolDetails(step);
      expect(details.category).toBe('edit');
      expect(details.actionLabel).toBe('Edited');
      expect(details.icon).toBe('🦀');
      expect(details.targetName).toBe('engine.rs');
      expect(details.diffStats).toEqual({ added: 36, removed: 0 });
    });

    it('parses run_command with command line and cwd', () => {
      const step: TrajectoryStep = {
        id: '3',
        type: 'tool_call',
        toolName: 'run_command',
        content: 'test output',
        metadata: {
          toolInput: {
            CommandLine: 'cargo test -p superagent-core-v2',
            Cwd: 'packages/core_v2',
          },
        },
      };

      const details = TrajectoryService.parseToolDetails(step);
      expect(details.category).toBe('command');
      expect(details.actionLabel).toBe('Ran');
      expect(details.targetName).toBe('cargo test -p superagent-core-v2');
      expect(details.cwd).toBe('packages/core_v2');
    });

    it('parses thought steps', () => {
      const step: TrajectoryStep = {
        id: '4',
        type: 'thought',
        content: 'Thinking about the architecture...',
        metadata: {
          workedDuration: '13s',
        },
      };

      const details = TrajectoryService.parseToolDetails(step);
      expect(details.category).toBe('thought');
      expect(details.actionLabel).toBe('Thought for 13s');
    });

    it('parses running thought steps with Thinking... action label', () => {
      const step: TrajectoryStep = {
        id: '5',
        type: 'thought',
        status: 'running',
        content: 'Analyzing deep chain of thought...',
      };

      const details = TrajectoryService.parseToolDetails(step);
      expect(details.category).toBe('thought');
      expect(details.actionLabel).toBe('Thinking...');
    });
  });

  describe('parseThinkingContent', () => {
    it('extracts completed think blocks and returns clean main content', () => {
      const input = '<think>\nThe user just said "HI" - a casual greeting.\n</think>\n\nHey there! 👋 How can I help?';
      const result = TrajectoryService.parseThinkingContent(input);

      expect(result.thinking).toBe('The user just said "HI" - a casual greeting.');
      expect(result.mainContent).toBe('Hey there! 👋 How can I help?');
      expect(result.isThinkingActive).toBe(false);
    });

    it('handles unclosed think tags during live streaming', () => {
      const streamingInput = '<think>\nFormulating response and planning tools...';
      const result = TrajectoryService.parseThinkingContent(streamingInput);

      expect(result.thinking).toBe('Formulating response and planning tools...');
      expect(result.mainContent).toBe('');
      expect(result.isThinkingActive).toBe(true);
    });

    it('supports thought and reasoning tags', () => {
      const thoughtInput = '<thought>Internal model thought</thought>Hello!';
      const res1 = TrajectoryService.parseThinkingContent(thoughtInput);
      expect(res1.thinking).toBe('Internal model thought');
      expect(res1.mainContent).toBe('Hello!');

      const reasoningInput = '<reasoning>Step-by-step logic</reasoning>Done.';
      const res2 = TrajectoryService.parseThinkingContent(reasoningInput);
      expect(res2.thinking).toBe('Step-by-step logic');
      expect(res2.mainContent).toBe('Done.');
    });

    it('handles multiple thinking tags in a single message', () => {
      const multiInput = '<think>Part 1</think>\nInterim\n<think>Part 2</think>\nFinal answer.';
      const result = TrajectoryService.parseThinkingContent(multiInput);

      expect(result.thinking).toBe('Part 1\n\nPart 2');
      expect(result.mainContent).toBe('Interim\n\nFinal answer.');
      expect(result.isThinkingActive).toBe(false);
    });

    it('returns null thinking for normal content without thinking tags', () => {
      const normalInput = 'Just a standard assistant reply.';
      const result = TrajectoryService.parseThinkingContent(normalInput);

      expect(result.thinking).toBe(null);
      expect(result.mainContent).toBe('Just a standard assistant reply.');
      expect(result.isThinkingActive).toBe(false);
    });

    it('handles empty input gracefully', () => {
      const result = TrajectoryService.parseThinkingContent('');
      expect(result.thinking).toBe(null);
      expect(result.mainContent).toBe('');
      expect(result.isThinkingActive).toBe(false);
    });
  });
});
