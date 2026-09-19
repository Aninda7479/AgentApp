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

    it('parses plan tool with roadmap badge and goal', () => {
      const step: TrajectoryStep = {
        id: '6',
        type: 'tool_call',
        toolName: 'plan',
        content: 'roadmap',
        metadata: {
          toolInput: {
            title: 'Refactor Core Architecture',
          },
        },
      };

      const details = TrajectoryService.parseToolDetails(step);
      expect(details.category).toBe('task');
      expect(details.actionLabel).toBe('Planned roadmap');
      expect(details.icon).toBe('🗺️');
      expect(details.targetName).toBe('Refactor Core Architecture');
    });

    it('parses todo tool with checklist icon and task count', () => {
      const step: TrajectoryStep = {
        id: '7',
        type: 'tool_call',
        toolName: 'todo',
        content: 'checklist',
        metadata: {
          toolInput: {
            items: ['Web search', 'Read config', 'Run tests'],
          },
        },
      };

      const details = TrajectoryService.parseToolDetails(step);
      expect(details.category).toBe('task');
      expect(details.actionLabel).toBe('Updated checklist');
      expect(details.icon).toBe('☑️');
      expect(details.targetName).toBe('3 tasks');
    });

    it('parses skill tool with skill icon and name', () => {
      const step: TrajectoryStep = {
        id: '8',
        type: 'tool_call',
        toolName: 'skill',
        content: 'loaded',
        metadata: {
          toolInput: {
            name: 'code-review',
          },
        },
      };

      const details = TrajectoryService.parseToolDetails(step);
      expect(details.category).toBe('task');
      expect(details.actionLabel).toBe('Loaded skill');
      expect(details.icon).toBe('✨');
      expect(details.targetName).toBe('code-review');
    });

    it('parses browser_navigate / webfetch with globe icon', () => {
      const step: TrajectoryStep = {
        id: '9',
        type: 'tool_call',
        toolName: 'browser_navigate',
        content: 'content',
        metadata: {
          toolInput: {
            url: 'https://opencode.ai/docs',
          },
        },
      };

      const details = TrajectoryService.parseToolDetails(step);
      expect(details.category).toBe('search');
      expect(details.actionLabel).toBe('Browsed');
      expect(details.icon).toBe('🌐');
      expect(details.targetName).toBe('https://opencode.ai/docs');
    });

    it('parses websearch / web_search and glob search tools', () => {
      const searchStep: TrajectoryStep = {
        id: '10',
        type: 'tool_call',
        toolName: 'web_search',
        content: 'results',
        metadata: {
          toolInput: {
            query: 'Axum 0.7 WebSocket router',
          },
        },
      };
      const searchDetails = TrajectoryService.parseToolDetails(searchStep);
      expect(searchDetails.category).toBe('search');
      expect(searchDetails.actionLabel).toBe('Searched');
      expect(searchDetails.icon).toBe('🔍');
      expect(searchDetails.targetName).toBe('Axum 0.7 WebSocket router');

      const globStep: TrajectoryStep = {
        id: '11',
        type: 'tool_call',
        toolName: 'glob',
        content: 'files',
        metadata: {
          toolInput: {
            pattern: '**/*.rs',
          },
        },
      };
      const globDetails = TrajectoryService.parseToolDetails(globStep);
      expect(globDetails.category).toBe('search');
      expect(globDetails.actionLabel).toBe('Searched');
      expect(globDetails.targetName).toBe('**/*.rs');
    });

    it('parses question / ask_question tools and summarizes content', () => {
      const questionStep: TrajectoryStep = {
        id: '12',
        type: 'tool_call',
        toolName: 'question',
        content: 'prompt',
        metadata: {
          toolInput: {
            question: 'Which language powers SuperAgent?',
            options: ['Rust', 'Go'],
          },
        },
      };
      const details = TrajectoryService.parseToolDetails(questionStep);
      expect(details.category).toBe('task');
      expect(details.actionLabel).toBe('Asked question');
      expect(details.icon).toBe('❓');
      expect(details.targetName).toBe('Which language powers SuperAgent?');

      const summary = TrajectoryService.summarizeToolContent(questionStep);
      expect(summary).toBe('Asked user a question');

      const multiQStep: TrajectoryStep = {
        id: '13',
        type: 'tool_call',
        toolName: 'ask_question',
        content: 'quiz',
        metadata: {
          toolInput: {
            questions: [
              { question: 'Q1' },
              { question: 'Q2' },
              { question: 'Q3' },
            ],
          },
        },
      };
      const multiDetails = TrajectoryService.parseToolDetails(multiQStep);
      expect(multiDetails.category).toBe('task');
      expect(multiDetails.actionLabel).toBe('Asked question');
      expect(multiDetails.targetName).toBe('3 questions');
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

  describe('categorizeTurnSteps', () => {
    it('promotes assistant message before tool calls when no post-tool assistant step exists', () => {
      const steps: TrajectoryStep[] = [
        {
          id: 'step-user-1',
          type: 'user',
          content: 'whats in memory',
        },
        {
          id: 'stream-assistant-1',
          type: 'assistant',
          content: '<think>Checking memory...</think>\n\nHere is what is in memory:\n- file A\n- file B',
        },
        {
          id: 'tool-call-1',
          type: 'tool_call',
          toolName: 'list_dir',
          content: 'list_dir({})',
          status: 'success',
        },
        {
          id: 'tool-call-2',
          type: 'tool_call',
          toolName: 'list_artifacts',
          content: 'list_artifacts({})',
          status: 'success',
        },
      ];

      const categorized = TrajectoryService.categorizeTurnSteps(steps);
      // stream-assistant-1 should be promoted to rawAssistantSteps, NOT collapsed into baseThinkingSteps
      expect(categorized.rawAssistantSteps).toHaveLength(1);
      expect(categorized.rawAssistantSteps[0].id).toBe('stream-assistant-1');
      expect(categorized.baseThinkingSteps.map(s => s.id)).toEqual(['tool-call-1', 'tool-call-2']);
      expect(categorized.toolSteps).toHaveLength(2);
    });

    it('keeps intermediate assistant message in thinking when a post-tool assistant step exists', () => {
      const steps: TrajectoryStep[] = [
        {
          id: 'step-user-1',
          type: 'user',
          content: 'list files',
        },
        {
          id: 'interim-assistant-1',
          type: 'assistant',
          content: 'Let me list files for you.',
        },
        {
          id: 'tool-call-1',
          type: 'tool_call',
          toolName: 'list_dir',
          content: 'list_dir({})',
          status: 'success',
        },
        {
          id: 'final-assistant-2',
          type: 'assistant',
          content: 'Here are the files: a.txt, b.txt',
        },
      ];

      const categorized = TrajectoryService.categorizeTurnSteps(steps);
      expect(categorized.rawAssistantSteps).toHaveLength(1);
      expect(categorized.rawAssistantSteps[0].id).toBe('final-assistant-2');
      expect(categorized.baseThinkingSteps.map(s => s.id)).toEqual(['interim-assistant-1', 'tool-call-1']);
    });
  });

  describe('parseToolDetails for directory and artifact exploration', () => {
    it('parses list_dir tool with folder icon and action label', () => {
      const step: TrajectoryStep = {
        id: '1',
        type: 'tool_call',
        toolName: 'list_dir',
        content: 'list_dir({})',
        metadata: {
          toolInput: { DirectoryPath: 'src/components' },
        },
      };

      const details = TrajectoryService.parseToolDetails(step);
      expect(details.actionLabel).toBe('Explored directory');
      expect(details.icon).toBe('📁');
      expect(details.targetName).toBe('components');
    });

    it('parses list_artifacts tool with palette icon and action label', () => {
      const step: TrajectoryStep = {
        id: '2',
        type: 'tool_call',
        toolName: 'list_artifacts',
        content: 'list_artifacts({})',
      };

      const details = TrajectoryService.parseToolDetails(step);
      expect(details.actionLabel).toBe('Listed artifacts');
      expect(details.icon).toBe('🎨');
    });
  });
});
