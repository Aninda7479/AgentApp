---
name: playwright-audit
description: Isolated accessibility and console audit micro-session. Called as a subprocess by ux-critic to walk a persona through the live app, capture console errors, and produce a structured findings JSON. NEVER called directly — always invoked via Bash from ux-critic's main session. browser_snapshot is banned. Max 5 turns enforced by caller.
allowed-tools: mcp__playwright__*, Read, Write
argument-hint: (no arguments — reads .playwright/pending-audit.json)
---

# /playwright-audit — Isolated UX Audit Sub-Session

## CRITICAL: Why You Exist

You are NOT a standalone skill. You are a subprocess called by `/ux-critic` to handle all
Playwright work in a completely isolated context. This prevents the main ux-critic session from
ever having Playwright response payloads (50K–200K token accessibility trees) in its context
window — which was causing context bloat, compact failures, and full chat crashes.

You run with `--max-turns 5`. Complete everything in those 5 turns.

## Absolute Rules

1. **NEVER call `browser_snapshot`** — ever. This single rule prevents the context crash.
2. **`browser_take_screenshot` only** for visual evidence. Always pass `filename`.
3. **`browser_find` for element location** — text/regex search, returns only matching nodes (small).
4. **`browser_console_messages` must write to file**: pass `filename: ".playwright/console-<ts>.log"`.
   Do NOT read that log back into context — just note the path in your findings.
5. Write ONE output file: `.playwright/audit-<timestamp>.json`. That is your only deliverable.

## Steps (5 turns maximum)

### Turn 1 — Read persona details
Read `.playwright/pending-audit.json`, written by ux-critic:
```json
{
  "skill": "ux-critic",
  "persona": "first-time-setup",
  "flow_description": "Non-technical user connecting first provider and sending first message",
  "dev_url": "http://localhost:3000",
  "steps": [
    "Navigate to app",
    "Click Connect Provider",
    "Fill in API key",
    "Send first message"
  ],
  "look_for": ["confusion points", "missing loading states", "unclear labels"],
  "timestamp": "..."
}
```

### Turn 2 — Navigate + start flow
Navigate to dev_url. Take initial screenshot.
```
browser_navigate: { url: "<dev_url>" }
browser_take_screenshot: { filename: ".playwright/audit-<ts>-start.png" }
```
Start walking through the first step of the persona's flow using `browser_find` to locate
interactive elements. Perform 1-2 actions (click, fill).

### Turn 3 — Continue flow + capture issues
Continue the flow. Take a screenshot at the most interesting state (e.g., after submitting):
```
browser_take_screenshot: { filename: ".playwright/audit-<ts>-mid.png" }
```
Use `browser_find` to check for specific elements from `look_for` items.
Capture console errors to disk:
```
browser_console_messages: { filename: ".playwright/console-<ts>.log" }
```
Do NOT read the console log file back — just note its path.

### Turn 4 — Check error paths (if turns remain)
Deliberately trigger one error state from `look_for` if time permits.
Take one more screenshot if the error state is meaningful.

### Turn 5 — Write findings and exit
Write the audit findings JSON. This is your ONLY output to the main session:

```json
{
  "skill": "playwright-audit",
  "persona": "first-time-setup",
  "timestamp": "<ISO timestamp>",
  "screenshots": [
    ".playwright/audit-<ts>-start.png",
    ".playwright/audit-<ts>-mid.png"
  ],
  "console_log_path": ".playwright/console-<ts>.log",
  "findings": [
    {
      "step": "Click Connect Provider",
      "severity": "high",
      "category": "missing-feedback",
      "description": "After clicking Connect Provider, no loading indicator appears for ~2s. A first-time user has no signal anything happened and is likely to click again.",
      "actionable_fix": "Add a spinner to the Connect Provider button on click, disabled state during request"
    },
    {
      "step": "Fill in API key",
      "severity": "low",
      "category": "copy",
      "description": "Label says 'API Key' with no hint about where to find it. A non-technical user won't know.",
      "actionable_fix": "Add helper text: 'Find this in your provider dashboard under Settings > API Keys'"
    }
  ],
  "console_errors": ["TypeError: Cannot read properties of undefined (reading 'model')"],
  "overall_rating": "3/5",
  "blocker_count": 1,
  "friction_count": 1,
  "flow_completed": true
}
```

`flow_completed` is true if you reached the end of the persona's steps, false if you got blocked.
`console_errors` should be copied from the log file — only the error lines, not the full log.

Write to `.playwright/audit-<unix_timestamp>.json`, then exit.

## What NOT to Do

- Do NOT edit application code.
- Do NOT `browser_snapshot` — ever.
- Do NOT log to the shared queue — ux-critic handles that.
- Do NOT exceed 5 turns — you will be killed anyway.
- Do NOT read `console-<ts>.log` back into context — just put its path in the findings.
