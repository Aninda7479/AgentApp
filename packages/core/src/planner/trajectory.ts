import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentMessage, ToolCall } from '../types/agent.js';

export interface TrajectoryLogEntry {
  sessionId: string;
  timestamp: number;
  type: 'message' | 'tool_call' | 'react_step' | 'system_event';
  payload: Record<string, unknown>;
}

export class TrajectoryLogger {
  private logDir: string;

  constructor(logDir?: string) {
    this.logDir = logDir || path.join(process.cwd(), 'logs', 'trajectories');
  }

  private sanitizePayload(data: unknown): unknown {
    if (typeof data === 'string') {
      return data.replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED_TOKEN]');
    }
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizePayload(item));
    }
    if (data !== null && typeof data === 'object') {
      const sanitizedObj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
          sanitizedObj[key] = '[REDACTED_SENSITIVE_DATA]';
        } else {
          sanitizedObj[key] = this.sanitizePayload(value);
        }
      }
      return sanitizedObj;
    }
    return data;
  }

  public async appendEntry(entry: Omit<TrajectoryLogEntry, 'timestamp'>): Promise<TrajectoryLogEntry> {
    await fs.mkdir(this.logDir, { recursive: true });

    const fullEntry: TrajectoryLogEntry = {
      ...entry,
      timestamp: Date.now(),
      payload: this.sanitizePayload(entry.payload) as Record<string, unknown>
    };

    const filePath = path.join(this.logDir, `${entry.sessionId}.jsonl`);
    const line = JSON.stringify(fullEntry) + '\n';
    await fs.appendFile(filePath, line, 'utf-8');

    return fullEntry;
  }

  public async logMessage(sessionId: string, message: AgentMessage): Promise<TrajectoryLogEntry> {
    return this.appendEntry({
      sessionId,
      type: 'message',
      payload: message as unknown as Record<string, unknown>
    });
  }

  public async logToolCall(sessionId: string, toolCall: ToolCall): Promise<TrajectoryLogEntry> {
    return this.appendEntry({
      sessionId,
      type: 'tool_call',
      payload: toolCall as unknown as Record<string, unknown>
    });
  }

  public async readTrajectoryLogs(sessionId: string): Promise<TrajectoryLogEntry[]> {
    const filePath = path.join(this.logDir, `${sessionId}.jsonl`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      return lines.map(line => JSON.parse(line) as TrajectoryLogEntry);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }
}
