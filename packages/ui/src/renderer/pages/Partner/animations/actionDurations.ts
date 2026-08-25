import type { CompanionAction } from './types';

/**
 * Standard durations (in seconds) for finite non-looping companion actions.
 */
export const ACTION_DURATIONS: Partial<Record<CompanionAction, number>> = {
  wave: 4.5,
  salute: 4.0,
  stretch: 6.0,
  heart: 5.0,
  peace: 4.5,
  neko: 5.0,
  bow: 3.2,
  cheer: 4.5,
  blush: 4.5,
  laugh: 4.0,
  listen: 5.0,
};
