---
name: ux-critic
description: Synthetic-user UX and frontend audit for SuperAgent — drives the live web GUI with Playwright MCP, walks through the app as different user personas, and logs concrete, screenshot-referenced findings into the same queue /auto-improve reads. Observation only, never edits code. Use on a schedule to compensate for having no real users yet.
allowed-tools: Read, Grep, Glob, Bash, Write, WebSearch, Playwright MCP tools
argument-hint: [optional persona or flow, e.g. "first-time-setup", "mobile", "accessibility", "video-gen-flow"]
---

# /ux-critic — Synthetic User & Frontend Critic Loop

## Why this exists

No real users yet means no one is naturally hitting confusing flows, unclear copy, broken mobile layouts, or inconsistent visuals and telling you about it. This skill substitutes for that missing signal by actually driving the running app the way a first-time user would, and writing down what it finds — specifically, with screenshots — so `/auto-improve` has real UX work to pull from instead of running dry once its code-completeness scan is exhausted.

Be honest about what this is and isn't: a simulated walkthrough is not the same as feedback from real people with real devices, real patience, and real reasons for being there. Treat it as a way to catch the obvious, structural, embarrassing problems before anyone else sees them — not a substitute for eventually getting a handful of real people to actually try the app.

## Setup this skill depends on (one-time, outside this file)

Add the Playwright MCP server, project-scoped:
```
claude mcp add playwright npx @playwright/mcp@latest
```
This covers the **web GUI** cleanly — point it at whatever `npm run dev` / your VPS serves. The **Electron desktop GUI** is a gap this skill can't close the same way: Playwright MCP drives browsers, not Electron's native shell. If the desktop app's React UI can also be served over plain HTTP in dev, point Playwright at that instead; if not, log it as an open question in Step 4 rather than pretending the desktop shell was tested.

## Step 0 — Orient

- Read `.claude/auto-improve-log.log`. Look for prior entries tagged `[ux-critic]` so you don't re-test the same flow back to back — rotate through personas/flows across runs.
- Confirm the dev server is running; if not, start it with the project's actual dev command (read `package.json` — don't guess it).
- Confirm Playwright MCP tools are available. If not, stop and say so in the log rather than fabricating a walkthrough.

## Step 1 — Pick a persona and a flow

Use `$ARGUMENTS` if given. Otherwise rotate to the next untested combination from this list (extend it as the app grows):

- **First-time setup** — a non-technical user connecting their first provider and sending their first message, zero prior context.
- **Power user / orchestration** — deliberately testing multi-model routing, e.g. uploading an image to a model that can't read images, checking whether the fallback is visible and makes sense.
- **Each capability, once each** — a user trying 3D gen/edit, image gen/edit, video gen/edit, audio gen/edit, a PDF, and an Office file, one at a time.
- **Mobile / narrow viewport** — 375×667, same flows as above.
- **Keyboard-only / accessibility** — no mouse: tab order, visible focus states, whether labels would make sense to a screen reader.
- **Error paths on purpose** — disconnect a provider mid-task, submit an empty form, upload an oversized file, go offline.

## Step 2 — Drive it for real

Using Playwright MCP: navigate to the local dev URL and actually perform the flow's steps as that persona would — click, fill, submit — screenshotting at each meaningful state, not just the end state. Capture:

- **Screenshots MUST be written into `.playwright/`** (the MCP server's `--output-dir`), never the project root. Always pass an explicit `path` under that folder, e.g. `path: ".playwright/ux-<persona>-<n>.png"`. The server also drops page snapshots (`page-*.yml`) and console logs (`console-*.log`) there automatically. Do not let artifacts leak to the repo root — keep `.playwright/` as the single home for all single-use Playwright output.

- Console errors and failed network requests during the flow.
- Any point where you, as the persona, would hesitate, misread, or not know what to do next.
- Loading/empty/error states — trigger them on purpose, don't just check the happy path.
- Visual consistency against the rest of the app (spacing, type scale, color use) and against any declared design tokens in the codebase.

## Step 3 — Critique like a reviewer, not a cheerleader

Write each issue as specific and actionable, not a vague impression.

- Weak: "The upload flow feels clunky."
- Useful: "On the image-gen screen, after clicking Upload there's no loading indicator for ~2s while the file processes — a first-time user gets no signal anything happened and is likely to click Upload again."

Rank findings by how likely they are to actually block or confuse a real user, not by how easy they'd be to fix. Note what's genuinely fine, too — don't manufacture problems to look productive.

## Step 4 — Log into the shared queue (no code edits)

Append an entry to `.claude/auto-improve-log.log`, same format `/auto-improve` already reads, tagged so it's identifiable:

```
## YYYY-MM-DD — [ux-critic] <persona/flow>
Researched: <flow tested, screenshot paths, console/network issues found>
Changed: none — observation only
Why: GUI quality / compensates for no real user feedback
Verified: n/a — this cycle only observes
Next priority queue: <ranked, specific, actionable UX fixes for /auto-improve to pick up>
Open questions: <anything needing a human call, e.g. desktop-shell testing gap>
```

Do not edit application code in this skill, even for something trivial. Keep the roles separate: this skill's only job is to see and report; `/auto-improve`'s job is to fix and verify. That separation is what stops the same agent from grading its own homework.

## Step 5 — Repeat

If session budget allows, move to the next untested persona/flow and repeat from Step 1.

## Step 6 — Compact the context

After the run ends (final persona/flow tested, or stopping because you're out of budget), run `/compact` to compress the accumulated context before handing control back. The `.claude/auto-improve-log.log` entry is the durable output — the screenshots and quotes in the working context are discardable once the log is written.