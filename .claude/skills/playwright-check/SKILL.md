---
name: playwright-check
description: Isolated visual verification micro-session. Called as a subprocess by art-director to take screenshots and check specific UI items. NEVER called directly by a human — always invoked via Bash from art-director's main session. Banned from browser_snapshot to prevent context bloat. Max 5 turns enforced by caller.
allowed-tools: mcp__playwright__*, Read, Write
argument-hint: (no arguments — reads .playwright/pending-check.json)
---

# /playwright-check — Isolated Visual Verification Sub-Session

## CRITICAL: Why You Exist

You are NOT a standalone skill. You are called as a subprocess by `/art-director` to handle
all Playwright work in a completely isolated context. This prevents the main art-director session
from ever having Playwright response payloads in its context window — which was causing context
bloat, compact failures, and chat crashes.

You run with `--max-turns 5`. Do everything in those 5 turns and exit cleanly.

## Absolute Rules (non-negotiable)

1. **NEVER call `browser_snapshot`** — it returns the full accessibility tree as text (50K–200K tokens).
   This single rule is why you exist as a separate subprocess. Violating it defeats the entire architecture.
2. **ONLY use `browser_take_screenshot`** for visual capture — it returns a binary file path, never text.
   Always pass `filename: ".playwright/check-<timestamp>.png"`.
3. **Use `browser_find` for element location** — returns only matching nodes (small). Never use snapshot.
4. **Write ONE output file**: `.playwright/findings-<timestamp>.json` — this is the ONLY thing the
   main art-director session will read. Keep it under 200 lines.
5. **Exit after writing the findings file.** Do not loop, iterate, or try to fix things yourself.

## Steps (5 turns maximum — be efficient)

### Turn 1 — Read pending work
Read `.playwright/pending-check.json`. This file was written by art-director and contains:
```json
{
  "skill": "art-director",
  "page": "<page name>",
  "dev_url": "http://localhost:3000",
  "viewport": {"width": 1280, "height": 800},
  "check_items": ["palette consistency", "spacing rhythm", "..."],
  "timestamp": "..."
}
```

### Turn 2 — Navigate + screenshot
Navigate to `dev_url`. Take a screenshot:
```
browser_navigate: { url: "<dev_url>" }
browser_take_screenshot: { filename: ".playwright/check-<unix_timestamp>.png" }
```
The screenshot path is your primary evidence. Note it.

### Turn 3 — Check items via browser_find only
For each item in `check_items`, use `browser_find` to locate specific elements.
Example: `browser_find: { text: "Connect Provider" }` → returns element + context (small).
Note what you find about each check item. Do NOT take more screenshots unless absolutely
necessary (you only have 5 turns total).

### Turn 4 — Mobile viewport (if time allows)
Only if you have turns left: resize to 375x667, take one mobile screenshot.
```
browser_resize: { width: 375, height: 667 }
browser_take_screenshot: { filename: ".playwright/check-<unix_timestamp>-mobile.png" }
```

### Turn 5 — Write findings and exit
Write the findings JSON to disk. This is your ONLY output:

```json
{
  "skill": "playwright-check",
  "page": "<page from pending-check.json>",
  "timestamp": "<ISO timestamp>",
  "screenshots": [
    ".playwright/check-<ts>.png",
    ".playwright/check-<ts>-mobile.png"
  ],
  "findings": [
    {
      "item": "palette consistency",
      "verdict": "PASS",
      "note": "Color tokens applied correctly across header and body"
    },
    {
      "item": "spacing rhythm",
      "verdict": "FAIL",
      "note": "Nav padding is 8px but design tokens specify 12px"
    }
  ],
  "overall": "NEEDS_REVISION",
  "blocker_count": 1,
  "warning_count": 0
}
```

`overall` is either `"PASS"` or `"NEEDS_REVISION"`.
`blocker_count` = findings where verdict is `"FAIL"` and the issue would be immediately visible to a user.
`warning_count` = minor inconsistencies that don't block the experience.

Write this file to `.playwright/findings-<unix_timestamp>.json`.

After writing, your job is done. Exit cleanly.

## What NOT to Do

- Do NOT try to fix code issues you find — that is art-director's job in its main session.
- Do NOT `browser_snapshot` under any circumstance.
- Do NOT try to log to `.claude/auto-improve-log.log` — art-director handles that.
- Do NOT call more than 5 turns of tools — you will be killed by --max-turns anyway.
- Do NOT read the findings file back to confirm it — trust that Write succeeded.
