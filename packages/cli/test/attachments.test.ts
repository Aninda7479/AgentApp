import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  findImagePathCandidates,
  validateImageFile,
  prepareAttachments,
  formatBytes,
  IMAGE_EXTENSIONS
} from '../src/attachments.js';
import { SlashCommandRouter } from '../src/commands/router.js';
import { registerAttachCommand } from '../src/commands/attach.js';
import { ImageAttachment } from '@superagent/core';

const TMP = join(tmpdir(), `sa-attach-${Date.now()}`);
const REAL_PNG = join(TMP, 'real.png');
const FAKE_PNG = join(TMP, 'fake.png');

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  // A file whose first bytes are a genuine PNG signature.
  writeFileSync(REAL_PNG, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
  // A file with an image extension but non-image bytes.
  writeFileSync(FAKE_PNG, 'this is definitely not an image');
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('findImagePathCandidates', () => {
  it('keeps absolute/relative path tokens ending in an image extension', () => {
    const found = findImagePathCandidates('check /abs/path/x.png now');
    expect(found).toEqual(['/abs/path/x.png']);
  });

  it('strips wrapping quotes a terminal inserts on drag-and-drop', () => {
    const found = findImagePathCandidates('drag "C:\\Users\\me\\pic.jpg" here');
    expect(found).toEqual(['C:\\Users\\me\\pic.jpg']);
  });

  it('ignores bare filenames without a path separator', () => {
    expect(findImagePathCandidates('see photo.png today')).toEqual([]);
  });

  it('ignores non-image extensions', () => {
    expect(findImagePathCandidates('read notes.txt please')).toEqual([]);
  });

  it('exposes the supported extension list', () => {
    expect(IMAGE_EXTENSIONS).toContain('png');
    expect(IMAGE_EXTENSIONS).toContain('svg');
  });
});

describe('validateImageFile', () => {
  it('accepts a real image and returns a data URL', async () => {
    const att = await validateImageFile(REAL_PNG);
    expect(att).not.toBeNull();
    expect(att?.mediaType).toBe('image/png');
    expect(att?.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(att?.size).toBeGreaterThan(0);
  });

  it('rejects a file whose bytes are not actually an image', async () => {
    const att = await validateImageFile(FAKE_PNG);
    expect(att).toBeNull();
  });

  it('rejects a missing path', async () => {
    const att = await validateImageFile(join(TMP, 'does-not-exist.png'));
    expect(att).toBeNull();
  });
});

describe('prepareAttachments', () => {
  it('removes validated path tokens from the prompt and attaches them', async () => {
    const { cleanText, attachments } = await prepareAttachments(`describe ${REAL_PNG} please`);
    expect(attachments).toHaveLength(1);
    expect(cleanText).toBe('describe please');
  });

  it('leaves invalid path tokens in the text and attaches nothing', async () => {
    const bad = join(TMP, 'nope.png');
    const { cleanText, attachments } = await prepareAttachments(`look ${bad} now`);
    expect(attachments).toHaveLength(0);
    expect(cleanText).toBe(`look ${bad} now`);
  });
});

describe('formatBytes', () => {
  it('formats byte counts', () => {
    expect(formatBytes(50)).toBe('50 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
});

describe('/attach command', () => {
  const pending: ImageAttachment[] = [];
  const router = new SlashCommandRouter();
  registerAttachCommand(router, { pendingAttachments: pending });

  it('queues a valid image for the next message', async () => {
    const res = await router.execute(`/attach ${REAL_PNG}`);
    expect(res.success).toBe(true);
    expect(pending).toHaveLength(1);
    expect(pending[0].mediaType).toBe('image/png');
  });

  it('refuses a non-image file', async () => {
    const before = pending.length;
    const res = await router.execute(`/attach ${FAKE_PNG}`);
    expect(res.success).toBe(false);
    expect(pending).toHaveLength(before);
  });

  it('lists and clears the queue', async () => {
    await router.execute(`/attach ${REAL_PNG}`);
    const list = await router.execute('/attach list');
    expect(list.output).toContain(REAL_PNG);

    const cleared = await router.execute('/attach clear');
    expect(cleared.success).toBe(true);
    expect(pending).toHaveLength(0);
  });
});
