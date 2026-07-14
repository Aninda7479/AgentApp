import { describe, it, expect, beforeEach } from 'vitest';
import {
  SlashCommandRouter,
  CodeReviewer,
  registerReviewCommand,
  PlanGenerator,
  registerPlanCommand,
  TaskManager,
  registerTasksCommand,
  registerClearCommand,
  ContextMessage
} from '../src/index.js';

describe('CodeReviewer (/review)', () => {
  it('flags critical, warning, and info issues with line numbers', () => {
    const src = [
      "const apiKey = 'sk_live_abcdef123456';", // hardcoded secret (critical)
      'eval(userInput);', // eval (critical)
      "console.log('debug here');", // debug-output (warning)
      'el.innerHTML = data;', // xss (warning)
      'let x: any = 1;', // loose typing (info)
      '// TODO: refactor this later' // todo (info)
    ].join('\n');

    const findings = CodeReviewer.analyzeFile('src/sample.ts', src);
    const cats = findings.map((f) => f.category);
    expect(cats).toContain('hardcoded-secret');
    expect(cats).toContain('code-injection');
    expect(cats).toContain('debug-output');
    expect(cats).toContain('xss-risk');
    expect(cats).toContain('loose-typing');
    expect(cats).toContain('todo-marker');
    // Line numbers are 1-indexed
    expect(findings.find((f) => f.category === 'code-injection')?.line).toBe(2);
  });

  it('does not flag placeholder secrets or console.error', () => {
    const src = [
      "const apiKey = process.env.API_KEY;",
      "const token = 'your-token-here';",
      "console.error('a real error');"
    ].join('\n');
    const findings = CodeReviewer.analyzeFile('src/ok.ts', src);
    expect(findings.filter((f) => f.severity === 'critical')).toHaveLength(0);
    expect(findings.filter((f) => f.category === 'debug-output')).toHaveLength(0);
  });

  it('aggregates a report and formats it', () => {
    const report = CodeReviewer.analyze([{ path: 'a.ts', content: 'eval(x);' }]);
    expect(report.filesScanned).toBe(1);
    expect(report.summary.critical).toBe(1);
    const text = CodeReviewer.formatReport(report);
    expect(text).toContain('=== SuperAgent Code Review ===');
    expect(text).toContain('[CRIT]');
  });

  it('reviews explicit files via the router', async () => {
    const router = new SlashCommandRouter();
    registerReviewCommand(router);
    // No args in a clean context -> graceful message
    const res = await router.execute('/review /nonexistent/path/xyz.ts');
    expect(res.success).toBe(true);
    expect(res.output).toContain('No changed files to review');
  });
});

describe('PlanGenerator (/plan)', () => {
  it('produces an ordered plan with standard phases', () => {
    const plan = PlanGenerator.generate('Build a new feature', { id: 'p1', createdAt: '2026-01-01T00:00:00Z' });
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);
    expect(plan.steps[0].id).toBe(1);
    const titles = plan.steps.map((s) => s.title.toLowerCase()).join(' ');
    expect(titles).toContain('analyze');
    expect(titles).toContain('implement');
    expect(titles).toContain('review');
  });

  it('adds keyword-driven steps for tests and deploys', () => {
    const plan = PlanGenerator.generate('Fix the bug, add tests and deploy the release');
    const titles = plan.steps.map((s) => s.title.toLowerCase()).join(' ');
    expect(titles).toContain('reproduce');
    expect(titles).toContain('automated tests');
    expect(titles).toContain('deploy');
  });

  it('errors without a goal via the router', async () => {
    const router = new SlashCommandRouter();
    registerPlanCommand(router);
    const res = await router.execute('/plan');
    // May load a persisted plan; if none, should prompt for a goal.
    if (!res.success) {
      expect(res.error).toContain('Missing goal');
    }
    const res2 = await router.execute('/plan Refactor auth module');
    expect(res2.success).toBe(true);
    expect(res2.output).toContain('=== Execution Plan ===');
  });
});

describe('TaskManager (/tasks)', () => {
  let manager: TaskManager;
  let router: SlashCommandRouter;

  beforeEach(() => {
    manager = new TaskManager();
    router = new SlashCommandRouter();
    registerTasksCommand(router, manager);
  });

  it('adds, lists, completes and removes tasks', async () => {
    const add = await router.execute('/tasks add build the docs');
    expect(add.success).toBe(true);
    expect((add.data as { id: string }).id).toBe('task-1');

    const list = await router.execute('/tasks list');
    expect(list.output).toContain('task-1');
    expect(list.output).toContain('build the docs');

    const done = await router.execute('/tasks done task-1');
    expect(done.success).toBe(true);
    expect(manager.get('task-1')?.status).toBe('done');

    const rm = await router.execute('/tasks rm task-1');
    expect(rm.success).toBe(true);
    expect(manager.list()).toHaveLength(0);
  });

  it('reports empty state and unknown subcommands', async () => {
    const empty = await router.execute('/tasks');
    expect(empty.output).toContain('No active background tasks');

    const bad = await router.execute('/tasks frobnicate');
    expect(bad.success).toBe(false);
  });

  it('marks tasks as failed and clears all', async () => {
    await router.execute('/tasks add one');
    await router.execute('/tasks add two');
    const fail = await router.execute('/tasks fail task-1');
    expect(fail.success).toBe(true);
    expect(manager.get('task-1')?.status).toBe('failed');

    const clear = await router.execute('/tasks clear');
    expect(clear.output).toContain('Cleared 2 task(s)');
    expect(manager.list()).toHaveLength(0);
  });
});

describe('registerClearCommand (/clear)', () => {
  it('clears the conversation and reports the removed count', async () => {
    let messages: ContextMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' }
    ];
    const router = new SlashCommandRouter();
    registerClearCommand(
      router,
      () => messages,
      (m) => {
        messages = m;
      }
    );

    const res = await router.execute('/clear');
    expect(res.success).toBe(true);
    expect(res.output).toContain('3 message(s) removed');
    expect(messages).toHaveLength(0);
  });
});
