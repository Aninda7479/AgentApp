import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { CodeReviewer, ReviewRule, registerReviewCommand } from '../src/commands/review.js';
import { SlashCommandRouter, DiffReviewer } from '../src/index.js';

const TMP = join(process.cwd(), 'tmp', 'review_apply_dir');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
});

describe('CodeReviewer (CLI /review fix verification)', () => {
  it('exposes a typed RULES array that compiles', () => {
    // This would not compile before the ReviewRule interface was added.
    const rules: ReviewRule[] = CodeReviewer['RULES'] as ReviewRule[];
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('flags eval() usage as critical', () => {
    const findings = CodeReviewer.analyzeFile('foo.ts', 'const x = eval("1+1");\n');
    expect(findings.some((f) => f.category === 'code-injection' && f.severity === 'critical')).toBe(true);
  });

  it('does not flag example hardcoded secrets (skipIf)', () => {
    const findings = CodeReviewer.analyzeFile(
      'conf.ts',
      "const key = 'your-api-key-here';"
    );
    expect(findings.some((f) => f.category === 'hardcoded-secret')).toBe(false);
  });

  it('auto-applies safe fixes by dropping debug lines', () => {
    const input = { path: 'a.ts', content: "console.log('hi');\nconst y = 2;\n" };
    const { fixed, applied } = CodeReviewer.applySafeFixes(input);
    expect(applied.length).toBe(1);
    expect(fixed.content).toBe('const y = 2;\n');
  });
});

describe('CodeReviewer /review --apply', () => {
  it('writes safe fixes to disk and registers a pending diff', async () => {
    const file = join(TMP, 'sample.ts');
    writeFileSync(file, "console.log('debug');\nconst n = 1;\n", 'utf8');

    const reviewer = new DiffReviewer();
    const router = new SlashCommandRouter();
    registerReviewCommand(router, { diffReviewer: reviewer });

    const res = await router.execute(`/review --apply ${file}`);
    expect(res.success).toBe(true);
    expect(res.output).toContain('Applied 1 safe fix');
    // The debug line was removed from disk.
    expect(existsSync(file) ? readFileSync(file, 'utf8') : '').toBe('const n = 1;\n');
    // A pending diff was registered for the change.
    expect(reviewer.getPendingChanges()).toHaveLength(1);
    expect(reviewer.getPendingChanges()[0].filePath).toBe(file);
  });

  it('reports risky findings without modifying files', async () => {
    const file = join(TMP, 'risk.ts');
    writeFileSync(file, "const x = eval('1+1');\n", 'utf8');

    const router = new SlashCommandRouter();
    registerReviewCommand(router);

    const res = await router.execute(`/review --apply ${file}`);
    expect(res.success).toBe(true);
    expect(res.output).toContain('Applied 0 safe fix');
    // eval() line is untouched.
    expect(readFileSync(file, 'utf8')).toContain('eval');
  });
});
