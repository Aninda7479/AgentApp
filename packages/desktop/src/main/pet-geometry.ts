/**
 * Pure geometry helpers for the 3D Partner (desktop pet) overlay window.
 *
 * Kept free of Electron/DOM so they can be unit-tested in isolation and reused
 * by PetWindowManager. The pet launches centered, greets you, then rests in the
 * top-right corner at ~¼ of the screen height.
 */

export interface ScreenArea {
  width: number;
  height: number;
}

export interface PetSize {
  width: number;
  height: number;
}

export interface PetPos {
  x: number;
  y: number;
}

/** The pet window is sized to a fraction of the screen height. */
export const PET_HEIGHT_FRACTION = 1 / 4;
/** Keep the character's natural-ish aspect ratio. */
export const PET_WIDTH_RATIO = 0.7;
/** Distance kept from the screen edges when docked. */
export const PET_EDGE_MARGIN = 48;
/** Gap from the top when docked in the top-right corner. */
export const PET_TOP_MARGIN = 48;

export const DEFAULT_MIN_WIDTH = 160;
export const DEFAULT_MIN_HEIGHT = 220;

/**
 * Window size for the pet: height = ¼ of the screen height, width scaled by the
 * character aspect ratio. Clamped to the supplied minimums.
 */
export function computePetSize(
  area: ScreenArea,
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT
): PetSize {
  const height = Math.max(minHeight, Math.round(area.height * PET_HEIGHT_FRACTION));
  const width = Math.max(minWidth, Math.round(height * PET_WIDTH_RATIO));
  return { width, height };
}

/** Centers the pet window in the screen. */
export function computeCenterPos(area: ScreenArea, size: PetSize): PetPos {
  return {
    x: Math.max(0, Math.round((area.width - size.width) / 2)),
    y: Math.max(0, Math.round((area.height - size.height) / 2))
  };
}

/**
 * Docked "home" position: top-right corner, with a top margin and an edge
 * margin. Clamped so it never leaves the work area.
 */
export function computeHomePos(
  area: ScreenArea,
  size: PetSize,
  topMargin = PET_TOP_MARGIN,
  edgeMargin = PET_EDGE_MARGIN
): PetPos {
  const x = Math.max(0, area.width - size.width - edgeMargin);
  const y = Math.max(0, topMargin);
  return { x, y };
}

/**
 * Eased interpolation between two positions (t in 0..1). Used for the glide from
 * center → home. `smoothstep` gives a gentle start/stop.
 */
export function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Linear interpolation of a single scalar. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolated position between `from` and `to` at eased fraction `t`. */
export function lerpPos(from: PetPos, to: PetPos, t: number): PetPos {
  const e = easeInOut(t);
  return { x: Math.round(lerp(from.x, to.x, e)), y: Math.round(lerp(from.y, to.y, e)) };
}
