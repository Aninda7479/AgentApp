# 012 — Add request timeout to provider `complete()` calls

- **Date:** 2026-07-15
- **Area:** Core LLM provider resilience (`packages/core/src/providers/`)
- **Files:** `anthropic.ts`, `custom.ts`, `gemini.ts`, `openai.ts`

## Problem

The four standalone provider classes (`AnthropicProvider`, `CustomProvider`,
`GeminiProvider`, `OpenAIProvider`) made their non-streaming `complete()`
`fetch()` calls with **no timeout and no `AbortSignal`**. The main orchestration
path (`ai-engine.ts`) already wires an `AbortController` through `run()`, but
these per-provider `complete()` calls are a separate surface (used by model
governance optimization, direct completions, etc.). A dead or black-holed
provider endpoint — connection opens but never responds — would hang that call
(and the agent relying on it) indefinitely.

## Change

Added an `AbortController` + `setTimeout` guard to each `complete()` `fetch()`,
cleared in a `.finally()` so the timer can never leak:

```ts
const controller = new AbortController();
const timeoutMs = Number(process.env.SUPERAGENT_HTTP_TIMEOUT_MS ?? 300000);
const timer = setTimeout(() => controller.abort(), timeoutMs);
const response = await fetch(url, { /* ... */, signal: controller.signal })
  .finally(() => clearTimeout(timer));
```

Default 300000 ms (5 min), overridable via `SUPERAGENT_HTTP_TIMEOUT_MS`.

## Impact

- A hung provider endpoint now aborts after the timeout and surfaces a clear
  abort error instead of stalling the agent forever.

## Risk

- **Low.** Only the non-streaming `complete()` path is changed; the
  `streamComplete()` methods are untouched (a fixed timeout there would wrongly
  cut off legitimate long generations). Default is generous (5 min) so normal
  completions are unaffected. `tsc --noEmit` on core passes (exit 0).
