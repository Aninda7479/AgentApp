/**
 * React Hook for Subscribing to Trajectory Steps of a Specific Chat
 * Returns a stable reference to avoid React #185 infinite re-render loops.
 */

import { useChatStore } from '../stores/chatStore';
import type { TrajectoryStep } from '../core/types';

const EMPTY_STEPS: TrajectoryStep[] = [];

export function useTrajectory(chatId: string): TrajectoryStep[] {
  return useChatStore((s) => (chatId ? s.residentSteps.get(chatId) || EMPTY_STEPS : EMPTY_STEPS));
}
