import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import {
  SlashCommandRouter,
  registerMemoryCommand,
  registerGoalCommand,
  GoalStore,
  createSessionContext
} from '../src/index.js';

const TMP = join(process.cwd(), 'tmp', 'memory_goal_dir');

describe('memory command (/memory)', () => {
  it('renders the memory profile from skills and insights', async () => {
    const session = createSessionContext();
    const router = new SlashCommandRouter();
    registerMemoryCommand(router, session);
    const res = await router.execute('/memory');
    expect(res.success).toBe(true);
    expect(res.output).toContain('=== SuperAgent Memory Profile ===');
    expect(res.output).toContain('Skills installed:');
  });
});

describe('GoalStore (/goal)', () => {
  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('sets, loads, and clears a goal', () => {
    expect(GoalStore.load(TMP)).toBeNull();
    const goal = GoalStore.set('ship the CLI', 'all tests pass', TMP);
    expect(goal.text).toBe('ship the CLI');
    const loaded = GoalStore.load(TMP);
    expect(loaded?.text).toBe('ship the CLI');
    expect(loaded?.doneWhen).toBe('all tests pass');

    GoalStore.clear(TMP);
    expect(GoalStore.load(TMP)).toBeNull();
  });

  it('formats a goal and a null state', () => {
    expect(GoalStore.format(null)).toContain('No active goal');
    const goal = GoalStore.set('build docs', undefined, TMP);
    expect(GoalStore.format(goal)).toContain('=== SuperAgent Active Goal ===');
  });

  it('exposes /goal through the router', async () => {
    const router = new SlashCommandRouter();
    registerGoalCommand(router);
    const set = await router.execute('/goal finish the feature');
    expect(set.success).toBe(true);
    expect(set.output).toContain('finish the feature');

    const view = await router.execute('/goal');
    expect(view.output).toContain('Active Goal');

    const clear = await router.execute('/goal clear');
    expect(clear.success).toBe(true);

    const after = await router.execute('/goal');
    expect(after.output).toContain('No active goal');
  });
});
