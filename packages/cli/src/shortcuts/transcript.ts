import { KeyInput } from '../types.js';

export interface TranscriptRecord {
  id: string;
  timestamp: number;
  type: 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
}

export class TranscriptManager {
  private records: TranscriptRecord[] = [];

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

  public getRecords(): TranscriptRecord[] {
    return [...this.records];
  }

  public formatVerboseTranscript(): string {
    return this.records
      .map((r) => {
        const timeStr = new Date(r.timestamp).toISOString();
        const metaStr = r.metadata ? ` | metadata: ${JSON.stringify(r.metadata)}` : '';
        return `[${timeStr}] [${r.type.toUpperCase()}] ${r.content}${metaStr}`;
      })
      .join('\n');
  }

  public clear(): void {
    this.records = [];
  }
}

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
