import * as fs from 'fs';
import * as path from 'path';
import { ImageAttachment } from '@superagent/core';

/** File extensions treated as attachable images. */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

/**
 * Inspect the first bytes of a file to confirm it is a real image and return
 * its media type. Returns `null` for anything that isn't a recognized image
 * (so a `.png` that is actually a text file is rejected, not forwarded).
 */
function sniffImageType(bytes: Buffer): string | null {
  if (bytes.length >= 8) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image/png';
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return 'image/gif';
    }
    if (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
      return 'image/webp';
    }
  }
  if (bytes.length >= 3) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
  }
  if (bytes.length >= 2) {
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
      return 'image/bmp';
    }
  }
  const head = bytes.slice(0, 128).toString('utf8').trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) {
    return 'image/svg+xml';
  }
  return null;
}

/** Strip a single matching pair of surrounding quotes a terminal may insert on drop. */
function stripWrappingQuotes(t: string): string {
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' || first === "'") && (last === '"' || last === "'")) {
      return t.slice(1, -1);
    }
  }
  return t;
}

/**
 * Validate that `filePath` points to a real, readable image file and, if so,
 * return an {@link ImageAttachment} with a `data:` URL. Returns `null` when the
 * path does not exist, is not a recognized image extension, or its bytes are
 * not actually an image.
 */
export async function validateImageFile(filePath: string): Promise<ImageAttachment | null> {
  try {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return null;
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return null;

    const ext = resolved.split('.').pop()?.toLowerCase() ?? '';
    if (!IMAGE_EXTENSIONS.includes(ext)) return null;

    const buf = fs.readFileSync(resolved);
    const mediaType = sniffImageType(buf);
    if (!mediaType) return null;

    const dataUrl = `data:${mediaType};base64,${buf.toString('base64')}`;
    return { path: resolved, mediaType, dataUrl, size: stat.size };
  } catch {
    return null;
  }
}

/**
 * Find candidate image-path tokens in free text. A candidate is a whitespace
 * token (with optional surrounding quotes, as terminals insert on drag/drop)
 * that ends in an image extension and contains a path separator — so plain
 * words like `photo.png` are left untouched unless they are real paths.
 */
export function findImagePathCandidates(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(stripWrappingQuotes)
    .filter((t) => {
      const ext = t.split('.').pop()?.toLowerCase() ?? '';
      const hasSeparator = t.includes('/') || t.includes('\\');
      return IMAGE_EXTENSIONS.includes(ext) && hasSeparator;
    });
}

/**
 * Given user text, detect drag-dropped or typed image paths, validate each,
 * and return the cleaned prompt (validated path tokens removed) plus the
 * resulting attachments. Invalid candidates are left in the text untouched.
 */
export async function prepareAttachments(
  text: string
): Promise<{ cleanText: string; attachments: ImageAttachment[] }> {
  const candidates = findImagePathCandidates(text);
  const attachments: ImageAttachment[] = [];
  const validated = new Set<string>();

  for (const candidate of candidates) {
    const att = await validateImageFile(candidate);
    if (att) {
      attachments.push(att);
      validated.add(candidate);
    }
  }

  const cleanText = text
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => {
      const bare = stripWrappingQuotes(t);
      return !validated.has(bare);
    })
    .join(' ');

  return { cleanText, attachments };
}

/** Format a byte count into a short human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
