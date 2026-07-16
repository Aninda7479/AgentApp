# Improvement: Correct message mapping for Gemini multimodal & dead-code cleanup in Ollama

**Date:** 2026-07-16
**Packages:** `core`
**Files touched:** `packages/core/src/providers/ai-engine.ts`

## Summary
Two small correctness / cleanliness fixes in `AgentEngine` message serialization.

### 1. Gemini multimodal content was stringified to `[object Object]`
When a user message carried attachments, `m.content` is a `ContentBlock[]`
(`[{ type: 'text', ... }, { type: 'image_url', ... }]`), not a plain string.
The Gemini path built:

```ts
parts: [{ text: m.content }]
```

For a `ContentBlock[]` this serializes to `[object Object]`, silently dropping
every multimodal message sent to Gemini. Affected: image+text prompts against
`gemini-*` models.

**Fix:** branch on the content shape and extract `.text` from text blocks:

```ts
parts: typeof m.content === 'string'
  ? [{ text: m.content }]
  : m.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => ({ text: b.text }))
```

### 2. Ollama role mapping contained a no-op ternary
```ts
role: m.role === 'tool' ? 'tool' : m.role
```
always evaluates to `m.role`. Removed the dead branch:

```ts
role: m.role
```

## Impact
- Gemini sessions with attachments now receive real text instead of
  `[object Object]` (correctness, not just 1%).
- Removes misleading dead code that implied special tool-role handling that
  never happened.

## Verification
- Change is type-safe (`ContentBlock` filter narrows correctly).
- No behavior change for string-content messages or for Ollama roles
  (`'system' | 'user' | 'assistant' | 'tool'` are all valid Ollama roles).
