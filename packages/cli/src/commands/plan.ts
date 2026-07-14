import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';

/** Lifecycle state for a single plan step. */
export type PlanStepStatus = 'pending' | 'in-progress' | 'done' | 'blocked';

/** A single actionable step within an execution plan. */
export interface PlanStep {
  id: number;
  title: string;
  detail: string;
  status: PlanStepStatus;
}

/** A structured, multi-step execution plan for a high-level goal. */
export interface Plan {
  id: string;
  goal: string;
  createdAt: string;
  steps: PlanStep[];
}

/**
 * Deterministic execution-plan generator (maps to the Claude/Codex/ChatGPT
 * Work `/plan` slash command). Given a free-text goal it decomposes it into a
 * structured, ordered set of steps following a proven engineering workflow
 * (Analyze → Design → Implement → Test → Verify → Review), with keyword-based
 * customisation (e.g. goals mentioning "deploy" gain a deploy step). No LLM or
 * network access is required, so plans are reproducible and fully testable.
 */
export class PlanGenerator {
  /** Generates a plan for the supplied goal. */
  public static generate(goal: string, options: { id?: string; createdAt?: string } = {}): Plan {
    const g = goal.trim();
    const lower = g.toLowerCase();
    const steps: PlanStep[] = [];

    const add = (title: string, detail: string): void => {
      steps.push({ id: steps.length + 1, title, detail, status: 'pending' });
    };

    add('Analyze requirements & gather context', `Clarify the goal: "${g.slice(0, 80)}${g.length > 80 ? '…' : ''}". Survey the relevant code, docs, and dependencies.`);
    add('Design the approach', 'Decide the architecture and interfaces; identify files to create or modify and any edge cases.');

    if (/\b(refactor|clean\s*up|simplif)/.test(lower)) {
      add('Refactor for clarity & reuse', 'Restructure the affected code for readability and reuse without changing behavior.');
    }
    if (/\b(bug|fix|debug|regression|broken|crash)/.test(lower)) {
      add('Reproduce & isolate the issue', 'Write a minimal reproduction, then locate the root cause before changing code.');
    }

    add('Implement the core changes', 'Write the main implementation following the project style and existing patterns.');

    if (/\b(test|spec|cover|unit|integration)/.test(lower)) {
      add('Add automated tests', 'Cover the new behavior (and regressions) with unit/integration tests.');
    }

    add('Verify build & run tests', 'Run the build, linter, and test suite; fix any failures introduced by the change.');

    if (/\b(deploy|ship|release|publish|roll\s*out)/.test(lower)) {
      add('Deploy & verify in target environment', 'Ship the change and confirm it works in the real environment (smoke check).');
    }

    if (/\b(doc|readme|documentation|wiki|changelog)/.test(lower)) {
      add('Update documentation', 'Reflect the change in README / docs / changelog as appropriate.');
    }

    add('Review & self-check', 'Re-read the diff, run a code review pass, and confirm the goal is satisfied.');

    return {
      id: options.id ?? `plan-${Date.now().toString(36)}`,
      goal: g,
      createdAt: options.createdAt ?? new Date().toISOString(),
      steps
    };
  }

  /** Renders a plan as a numbered, human-readable checklist. */
  public static formatPlan(plan: Plan): string {
    const lines: string[] = ['=== Execution Plan ===', `Goal: ${plan.goal}`, ''];
    for (const s of plan.steps) {
      lines.push(`${s.id}. [ ] ${s.title} — ${s.detail}`);
    }
    const done = plan.steps.filter((s) => s.status === 'done').length;
    lines.push('', `Progress: ${done}/${plan.steps.length} steps complete.`);
    return lines.join('\n');
  }
}

/** Persists a plan to `<cwd>/.superagent/plan.json` for later recall. */
export function savePlan(plan: Plan, cwd: string = process.cwd()): string {
  const dir = join(cwd, '.superagent');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, 'plan.json');
  writeFileSync(path, JSON.stringify(plan, null, 2), 'utf8');
  return path;
}

/** Loads the most recently saved plan from `<cwd>/.superagent/plan.json`. */
export function loadPlan(cwd: string = process.cwd()): Plan | null {
  const path = join(cwd, '.superagent', 'plan.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Plan;
  } catch {
    return null;
  }
}

/** Registers the `/plan` slash command: draft a multi-step execution plan. */
export function registerPlanCommand(router: SlashCommandRouter): void {
  router.register(
    'plan',
    async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
      if (ctx.args.length === 0) {
        const existing = loadPlan();
        if (existing) {
          return {
            success: true,
            command: ctx.command,
            output: PlanGenerator.formatPlan(existing),
            data: existing
          };
        }
        return {
          success: false,
          command: ctx.command,
          output: 'Usage: /plan <goal> — e.g. /plan Refactor the auth module and add tests',
          error: 'Missing goal argument'
        };
      }

      const goal = ctx.rawArgs;
      const plan = PlanGenerator.generate(goal);
      savePlan(plan);
      return {
        success: true,
        command: ctx.command,
        output: PlanGenerator.formatPlan(plan),
        data: plan
      };
    },
    {
      description: 'Draft a structured multi-step execution plan for a goal',
      aliases: ['p'],
      usage: '/plan <goal>'
    }
  );
}
