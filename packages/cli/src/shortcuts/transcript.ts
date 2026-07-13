import { KeyInput } from '../types.js';

/** A single transcript entry recording an event in the session. */
export interface TranscriptRecord {
  id: string;
  timestamp: number;
  type: 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
}

/** Maintains a chronological log of session events for verbose display. */
export class TranscriptManager {
  private records: TranscriptRecord[] = [];

  /** Appends a new transcript record with auto-generated ID and timestamp. */
  public addRecord(type: TranscriptRecord['type'], content: string, metadata?: Record<string, unknown>): TranscriptRecord {
    const record: TranscriptRecord = {
      id: `tr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      type,
      content,
      metadata,
    };
    this.records.push(record);
    return record;
  }

  /** Returns a shallow copy of all transcript records. */
  public getRecords(): TranscriptRecord[] {
    return [...this.records];
  }

  /** Formats all records as a verbose timestamped string. */
  public formatVerboseTranscript(): string {
    return this.records
      .map((r) => {
        const timeStr = new Date(r.timestamp).toISOString();
        const metaStr = r.metadata ? ` | metadata: ${JSON.stringify(r.metadata)}` : '';
        return `[${timeStr}] [${r.type.toUpperCase()}] ${r.content}${metaStr}`;
      })
      .join('\n');
  }

  /** Clears all transcript records. */
  public clear(): void {
    this.records = [];
  }
}

/**
 * Handles Ctrl+O shortcut to toggle verbose transcript mode.
 * @param key - Keyboard input event
 * @param currentVerboseState - Current verbose state
 * @param onToggle - Callback with new boolean state
 * @returns true if the shortcut was matched and handled
 */
export function handleTranscriptToggleShortcut(
  key: KeyInput,
  currentVerboseState: boolean,
  onToggle: (newState: boolean) => void
): boolean {
  if (key.ctrl && (key.name === 'o' || key.name === 'O')) {
    onToggle(!currentVerboseState);
    return true;
  }
  return false;
}
