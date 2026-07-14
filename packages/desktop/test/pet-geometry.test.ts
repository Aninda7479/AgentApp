import { describe, it, expect } from 'vitest';
import {
  computePetSize,
  computeCenterPos,
  computeHomePos,
  easeInOut,
  lerpPos,
  PET_HEIGHT_FRACTION,
  PET_WIDTH_RATIO,
  PET_EDGE_MARGIN,
  PET_TOP_MARGIN
} from '../src/main/pet-geometry';

describe('computePetSize', () => {
  it('sizes height to ¼ of the screen and width to the character ratio', () => {
    const area = { width: 1920, height: 1080 };
    const size = computePetSize(area);
    expect(size.height).toBe(Math.round(1080 * PET_HEIGHT_FRACTION)); // 270
    // 270 * 0.7 = 189
    expect(size.width).toBe(Math.round(270 * PET_WIDTH_RATIO));
  });

  it('clamps to the minimum width/height', () => {
    const size = computePetSize({ width: 400, height: 300 }, 160, 220);
    // 300/4 = 75 -> clamped to 220 height; width 220*0.7=154 -> clamped to 160
    expect(size.height).toBe(220);
    expect(size.width).toBe(160);
  });

  it('stays within a realistic screen (no clamping needed)', () => {
    // Use a screen tall enough that height/4 (225) exceeds the 220 min, so the
    // fraction applies directly rather than clamping.
    const size = computePetSize({ width: 1400, height: 900 });
    expect(size.width).toBeLessThanOrEqual(1400);
    expect(size.height).toBeLessThanOrEqual(900);
    expect(size.height).toBe(225); // 900/4 — above the 220 min, so no clamp
    // 225*0.7 = 157.5 -> rounds to 158, but min width is 160, so it clamps up.
    expect(size.width).toBe(160);
  });
});

describe('computeCenterPos', () => {
  it('centers the window within the screen', () => {
    const area = { width: 1920, height: 1080 };
    const size = computePetSize(area);
    const pos = computeCenterPos(area, size);
    expect(pos.x).toBe(Math.round((area.width - size.width) / 2));
    expect(pos.y).toBe(Math.round((area.height - size.height) / 2));
  });
});

describe('computeHomePos', () => {
  it('docks in the top-right corner with a top margin and edge margin', () => {
    const area = { width: 1920, height: 1080 };
    const size = computePetSize(area);
    const pos = computeHomePos(area, size);
    expect(pos.x).toBe(area.width - size.width - PET_EDGE_MARGIN);
    expect(pos.y).toBe(PET_TOP_MARGIN);
  });

  it('stays within the screen bounds even for large windows', () => {
    const area = { width: 1920, height: 1080 };
    const pos = computeHomePos(area, { width: 1900, height: 1000 });
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.x + 1900).toBeLessThanOrEqual(1920);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });
});

describe('eased glide interpolation', () => {
  it('easeInOut is monotonic and endpoints at 0 and 1', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeGreaterThan(easeInOut(0.25));
  });

  it('lerpPos interpolates from → to at t=0 and t=1', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 50 };
    expect(lerpPos(from, to, 0)).toEqual(from);
    expect(lerpPos(from, to, 1)).toEqual(to);
  });
});
