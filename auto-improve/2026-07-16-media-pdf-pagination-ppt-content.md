# Improvement: Media tool no longer drops content (PDF pagination + PPT bullets)

**Date:** 2026-07-16
**Packages:** `core`
**Files touched:** `packages/core/src/tools/media.ts`

## Summary
The `generate_media` tool had two content-loss defects in its PDF and PPT
backends.

### 1. PDF: long content silently clipped
`generateAIPdf` drew bullet points on a single fixed-size page starting at
`yPos = 270`, decrementing by 25 with **no bounds check**. Anything past ~10
bullets was drawn below `y = 0` — off the page and lost. The returned
`byteLength` made it look successful.

**Fix:** when `yPos` falls below a `BOTTOM_MARGIN` (40), start a new page:

```ts
const BOTTOM_MARGIN = 40;
let yPos = 270;
for (const line of content) {
  if (yPos < BOTTOM_MARGIN) {
    page = pdfDoc.addPage([600, 400]);
    yPos = 360;
  }
  page.drawText(`• ${line}`, { x: 60, y: yPos, size: 14, font, color: rgb(0.2, 0.2, 0.2) });
  yPos -= 25;
}
```

(`page` changed from `const` to `let`.)

### 2. PPT: user `content` ignored entirely
`generateAIPpt` only rendered the title and prompt. The `content` array the
tool schema advertises (`Bullet points or slides content`) was never drawn, so
every AI-generated deck ignored the actual bullet points the user/model asked
for.

**Fix:** render the bullets as a bulleted list:

```ts
const bullets: string[] = req.options?.content || [];
if (bullets.length) {
  slide.addText(
    bullets.map((b) => ({ text: b, options: { bullet: true } })),
    { x: 1, y: 3.2, w: 8, h: 3, fontSize: 16, color: '333333' }
  );
}
```

## Impact
- PDF generation now preserves all bullet points (multi-page) instead of
  truncating after ~10.
- PPT generation actually uses the requested content, producing meaningful
  decks rather than a title-only slide.

## Verification
- Pure logic change; `pdf-lib`/`pptxgenjs` APIs used correctly.
- No change to the success response shape, so callers/UI are unaffected.
