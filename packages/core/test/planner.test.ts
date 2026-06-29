import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ReActExecutor, ReActStep } from '../src/planner/react.js';
import { TurnQueue } from '../src/planner/queue.js';
import { TrajectoryLogger } from '../src/planner/trajectory.js';
import { SubagentManager } from '../src/planner/subagents.js';
import { SystemDiagnostics } from '../src/planner/diagnostics.js';
import { BYOKProviderManager } from '../src/providers/byok.js';
import { ToolDefinition, AgentMessage } from '../src/types/agent.js';

describe('Planner Modules (Steps 016 - 020)', () => {

  describe('Step 016: ReAct Agent Reasoning Loop Core', () => {
    it('should run default ReAct execution loop successfully', async () => {
      const executor = new ReActExecutor({ maxSteps: 3 });
      const result = await executor.executeLoop('Calculate standard metric');
      expect(result.steps.length).toBe(1);
      expect(result.steps[0].isFinal).toBe(true);
      expect(result.finalOutput).toContain('Executed ReAct loop');
    });

    it('should handle tool invocation within LLM driver steps', async () => {
      const mockTool: ToolDefinition = {
        name: 'calculator',
        description: 'Performs basic math',
        parameters: { type: 'object' },
        execute: async (args: Record<string, any>) => {
          return { result: args.a + args.b };
        }
      };

      let stepCounter = 0;
      const executor = new ReActExecutor({
        maxSteps: 5,
        llmDriver: async (_messages, _tools) => {
          stepCounter++;
          if (stepCounter === 1) {
            return {
              thought: 'Need to compute sum',
              action: {
                id: 'call-1',
                toolName: 'calculator',
                args: { a: 5, b: 10 }
              }
            };
          }
          return {
            thought: 'Calculation done',
            isFinal: true,
            finalOutput: 'Result is 15'
          };
        }
      });

      executor.registerTool(mockTool);
      const config = { provider: 'openai' as const, apiKey: 'sk-test-key' };
      const result = await executor.executeLoop('Add 5 and 10', [], config);

      expect(result.steps.length).toBe(2);
      expect(result.steps[0].action?.toolName).toBe('calculator');
      expect(result.steps[0].action?.status).toBe('completed');
      expect(result.steps[0].observation).toContain('15');
      expect(result.finalOutput).toBe('Result is 15');
    });
  });

  describe('Step 017: Turn Queueing & Message Buffer Architecture', () => {
    it('should enqueue turns with priority handling', () => {
      const queue = new TurnQueue();
      queue.enqueue('Prompt 1', 'normal');
      queue.enqueue('Prompt 2', 'normal');
      queue.enqueue('System Prompt', 'system');

      expect(queue.size()).toBe(3);
      const first = queue.dequeue();
      expect(first?.prompt).toBe('System Prompt');
      expect(queue.peek()?.prompt).toBe('Prompt 1');
    });

    it('should manage processing flag and clearing operations', () => {
      const queue = new TurnQueue();
      queue.enqueue('Task A');
      expect(queue.isProcessing()).toBe(false);
      
      queue.setProcessing(true);
      expect(queue.isProcessing()).toBe(true);

      queue.clear();
      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('Step 018: System & User Session Trajectory Logger', () => {
    const testLogDir = path.join(process.cwd(), 'logs', 'test_trajectories');

    afterEach(async () => {
      try {
        await fs.rm(testLogDir, { recursive: true, force: true });
      } catch {
        // Ignore removal errors
      }
    });

    it('should log trajectory messages and redact sensitive tokens', async () => {
      const logger = new TrajectoryLogger(testLogDir);
      const testMsg: AgentMessage = {
        id: 'msg-101',
        role: 'user',
        content: 'Connect with key sk-secret1234567890',
        timestamp: Date.now()
      };

      await logger.logMessage('session-alpha', testMsg);

      const logs = await logger.readTrajectoryLogs('session-alpha');
      expect(logs.length).toBe(1);
      expect(logs[0].sessionId).toBe('session-alpha');
      expect((logs[0].payload as any).content).toContain('[REDACTED_TOKEN]');
    });
  });

  describe('Step 019: Subagent Manager & Task Forker', () => {
    it('should fork and execute child subagents asynchronously', async () => {
      const manager = new SubagentManager();
      const subagent = await manager.forkSubagent('parent-session-1', 'Analyze component', async (_id, task) => {
        return `Completed task: ${task}`;
      });

      expect(subagent.parentId).toBe('parent-session-1');
      expect(subagent.status).toBe('running');

      // Wait brief moment for async execution
      await new Promise(resolve => setTimeout(resolve, 50));

      const updated = manager.getSubagent(subagent.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.result).toContain('Analyze component');
    });

    it('should list and terminate subagents correctly', async () => {
      const manager = new SubagentManager();
      const sub = await manager.forkSubagent('parent-session-2', 'Long running task', () => new Promise(() => {}));
      
      const sublist = manager.listSubagents('parent-session-2');
      expect(sublist.length).toBe(1);

      const terminated = manager.terminateSubagent(sub.id);
      expect(terminated).toBe(true);
      expect(manager.getSubagent(sub.id)?.status).toBe('terminated');
    });
  });

  describe('Step 020: System Diagnostics & Health Checker', () => {
    it('should perform health checks and produce diagnostic report', async () => {
      const diagnostics = new SystemDiagnostics();
      const providerManager = new BYOKProviderManager();
      providerManager.registerKey({ provider: 'openai', apiKey: 'sk-dummy-key' });

      const report = await diagnostics.runDiagnostics(providerManager);
      expect(report.diagnostics.length).toBe(4);
      expect(report.diagnostics[0].name).toBe('Node.js Runtime');
      expect(report.diagnostics[0].status).toBe('pass');
      expect(report.overallStatus).not.toBe('unhealthy');
    });
  });

});
