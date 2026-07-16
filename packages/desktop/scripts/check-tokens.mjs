/**
 * check-tokens.mjs — CI guard against raw STATE hues in the desktop UI.
 *
 * The Monolith design system reserves color for STATE only and routes every
 * state hue through the neon tokens (--neon-constructive / --neon-destructive /
 * --neon-live / --neon-attention). Raw Tailwind state hues (emerald/rose/red/
 * amber/yellow/orange/sky) are drift — they bypass the single source of truth
 * and break light/dark theme parity.
 *
 * This guard fails the build if any raw state hue class appears under
 * src/renderer, EXCEPT inside 3d_studio/ (a sanctioned intentional theme,
 * tracked as a human decision in .claude/auto-improve-log.log).
 *
 * Usage: node scripts/check-tokens.mjs   (exit 0 = clean, 1 = drift found)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '3d_studio']);
const STATE_HUE_RE =
  /\b(?:text|bg|border|from|to|via|ring|divide|fill|stroke)-(emerald|rose|red|amber|yellow|orange|sky)-/g;

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT, []);
const violations = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const matches = line.match(STATE_HUE_RE);
    if (matches) {
      for (const m of matches) {
        violations.push({ file: file.replace(ROOT + '/', ''), line: i + 1, token: m });
      }
    }
  });
}

if (violations.length) {
  console.error('✗ Raw state hues detected in desktop UI (should route through neon tokens):');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.token}`);
  }
  console.error(`\n${violations.length} violation(s). Migrate to --neon-* tokens (3d_studio is exempt).`);
  process.exit(1);
}

console.log(`✓ No raw state hues in desktop UI (${files.length} files scanned, 3d_studio exempt).`);
process.exit(0);
