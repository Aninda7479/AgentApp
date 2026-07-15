/**
 * `FormatService` — pure, side-effect-free formatting helpers.
 *
 * These functions never touch React state or IPC; they only transform strings
 * and trajectory steps. Keeping them here means the design layer can call them
 * without owning any logic.
 */
import type { TrajectoryStep } from '../components/TrajectoryCanvas';

export class FormatService {
  /**
   * Converts a chat title into a safe, URL-friendly folder name.
   * Lowercases, strips non `[a-z0-9-_]` characters, collapses whitespace to
   * dashes, and truncates to 30 chars. Falls back to `chat-<timestamp>` if the
   * result is empty. (Timestamp is supplied by the caller so this stays pure.)
   */
  static sanitizeFolderName(name: string, now: number = Date.now()): string {
    let sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-_]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    if (sanitized.length > 30) {
      sanitized = sanitized.substring(0, 30).replace(/-$/, '');
    }
    return sanitized || `chat-${now}`;
  }

  /**
   * Formats a millisecond duration into a human-readable string like
   * "2m 15s" or, for sub-second runs, "1s". Always reports at least 1 second so
   * a 0 ms result shows "1s" rather than "0s".
   */
  static formatWorkedDuration(elapsedMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${Math.max(1, seconds)}s`;
  }

  /**
   * Stamps the worked-duration label onto every agent step that comes AFTER the
   * last user message (the actual "work" portion of the trajectory). Steps at
   * or before the last user message, plus the user message itself, are left
   * untouched. Returns a new array — the input is not mutated.
   */
  static stampWorkedDuration(
    steps: TrajectoryStep[],
    workedDuration: string
  ): TrajectoryStep[] {
    let lastUserIndex = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].type === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    return steps.map((step, index) => {
      if (index <= lastUserIndex || step.type === 'user') {
        return step;
      }
      return {
        ...step,
        metadata: {
          ...(step.metadata || {}),
          workedDuration
        }
      };
    });
  }

  /**
   * Auto-detects whether a toast message represents an error. If `explicit` is
   * provided it wins; otherwise we treat any message containing "error",
   * "failed", or "unsupported" as an error toast. Lets callers pass a message
   * and get the correct styling without re-implementing the heuristic.
   */
  static detectToastType(
    message: string,
    explicit?: 'info' | 'error'
  ): 'info' | 'error' {
    if (explicit) return explicit;
    const lowered = message.toLowerCase();
    if (
      lowered.includes('error') ||
      lowered.includes('failed') ||
      lowered.includes('unsupported')
    ) {
      return 'error';
    }
    return 'info';
  }
}
