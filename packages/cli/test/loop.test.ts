import { describe, it, expect, vi } from 'vitest';
import { SlashCommandRouter } from '../src/commands/router.js';
import { registerLoopCommand } from '../src/commands/loop.js';

describe('loop command (/loop)', () => {
  it('handles loop command execution, registration and methods', async () => {
    const router = new SlashCommandRouter();
    
    const startLoop = vi.fn().mockReturnValue('loop-123');
    const stopLoop = vi.fn().mockReturnValue(true);
    const listLoops = vi.fn().mockReturnValue([
      { id: 'loop-123', interval: '5m', prompt: 'test prompt', nextRunAt: '2026-07-16' }
    ]);
    const clearLoops = vi.fn();

    registerLoopCommand(router, { startLoop, stopLoop, listLoops, clearLoops });

    // Test list
    const resList = await router.execute('/loop list');
    expect(resList.success).toBe(true);
    expect(resList.output).toContain('=== Active Loop Tasks ===');
    expect(resList.output).toContain('loop-123');
    expect(listLoops).toHaveBeenCalled();

    // Test stop
    const resStop = await router.execute('/loop stop loop-123');
    expect(resStop.success).toBe(true);
    expect(resStop.output).toContain('Stopped loop task: loop-123');
    expect(stopLoop).toHaveBeenCalledWith('loop-123');

    // Test clear
    const resClear = await router.execute('/loop clear');
    expect(resClear.success).toBe(true);
    expect(resClear.output).toContain('All active loop tasks stopped');
    expect(clearLoops).toHaveBeenCalled();

    // Test start
    const resStart = await router.execute('/loop 5m check status');
    expect(resStart.success).toBe(true);
    expect(resStart.output).toContain('Loop started successfully.');
    expect(resStart.output).toContain('loop-123');
    expect(startLoop).toHaveBeenCalledWith('check status', '5m');
  });

  it('handles loop-x command execution and parsing', async () => {
    const router = new SlashCommandRouter();
    registerLoopCommand(router, {});

    const res = await router.execute('/loop-x 5 check git status');
    expect(res.success).toBe(true);
    expect(res.output).toContain('Starting Loop-X with 5 runs...');
    expect(res.data).toEqual({ count: 5, prompt: 'check git status', isLoopX: true });

    const resError = await router.execute('/loop-x invalid prompt');
    expect(resError.success).toBe(false);
    expect(resError.error).toContain('Please specify a valid number of runs');
  });
});
