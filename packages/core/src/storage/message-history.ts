import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { getUserDataDirectory } from './locations.js';
import { getChatJsonPath } from './conversation-paths.js';
import type { ChatMessage } from '../types/agent.js';

function safeName(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'session';
}

function filePathFor(sessionId: string): string {
  return getChatJsonPath(getUserDataDirectory(), safeName(sessionId));
}

export class MessageHistoryStore {
  /** Per-session append buffer (not yet persisted). */
  private static buffers = new Map<string, ChatMessage[]>();
  /** Per-session flush timers. */
  private static timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Per-session in-flight flush promise (to serialize flushes). */
  private static inflight = new Map<string, Promise<void>>();

  /** Record a message. Non-blocking: buffers and schedules an async flush. */
  public static append(sessionId: string, message: ChatMessage): void {
    let buf = this.buffers.get(sessionId);
    if (!buf) {
      buf = [];
      this.buffers.set(sessionId, buf);
    }
    buf.push(message);
    this.scheduleFlush(sessionId);
  }

  private static scheduleFlush(sessionId: string): void {
    if (this.timers.has(sessionId)) return;
    const delay = Math.max(100, parseInt(process.env.SUPERAGENT_HISTORY_FLUSH_MS || '', 10) || 500);
    const t = setTimeout(() => {
      this.timers.delete(sessionId);
      void this.flush(sessionId);
    }, delay);
    (t as unknown as { unref?: () => void }).unref?.();
    this.timers.set(sessionId, t);
  }

  /** Append buffered messages to the JSON transcript in ~/.superagent/conversation/chats/<id>/chat.json. */
  public static async flush(sessionId: string): Promise<void> {
    const existing = this.inflight.get(sessionId);
    if (existing) return existing;

    const promise = (async () => {
      const buf = this.buffers.get(sessionId);
      if (!buf || buf.length === 0) return;
      this.buffers.set(sessionId, []);
      try {
        const file = filePathFor(sessionId);
        await fsp.mkdir(path.dirname(file), { recursive: true });

        let existingSteps: any[] = [];
        let existingMessages: any[] = [];
        let title = sessionId;
        let timestamp = new Date().toISOString();

        if (fs.existsSync(file)) {
          try {
            const raw = await fsp.readFile(file, 'utf-8');
            const parsed = JSON.parse(raw);
            existingSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
            existingMessages = Array.isArray(parsed.messages) ? parsed.messages : [];
            title = parsed.title || sessionId;
            timestamp = parsed.timestamp || timestamp;
          } catch {
            /* ignore parse failure */
          }
        }

        const newSteps = buf.map((m, i) => ({
          id: (m as any).id || `msg-${Date.now()}-${i}`,
          type: m.role as any,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          timestamp: new Date().toISOString()
        }));

        const newMessages = buf.map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        }));

        const allSteps = existingSteps.concat(newSteps);
        const allMessages = existingMessages.concat(newMessages);

        if (title === sessionId) {
          const firstUserMsg = allMessages.find((m: any) => m.role === 'user')?.content;
          if (firstUserMsg) {
            title = firstUserMsg.length > 50 ? firstUserMsg.slice(0, 47) + '...' : firstUserMsg;
          }
        }

        const chatData = {
          id: safeName(sessionId),
          title,
          project: '',
          timestamp,
          steps: allSteps,
          messages: allMessages
        };

        await fsp.writeFile(file, JSON.stringify(chatData, null, 2), 'utf-8');
      } catch (e) {
        console.error(`Failed to flush history for ${sessionId}:`, e);
        // Re-queue unsaved messages so they aren't silently lost.
        const cur = this.buffers.get(sessionId) ?? [];
        this.buffers.set(sessionId, buf.concat(cur));
      } finally {
        this.inflight.delete(sessionId);
      }
    })();

    this.inflight.set(sessionId, promise);
    return promise;
  }

  /** Flush every session's buffer (used on shutdown). */
  public static async flushAll(): Promise<void> {
    const ids = Array.from(this.buffers.keys());
    await Promise.all(ids.map((id) => this.flush(id)));
  }

  /** Total persisted + buffered message count for a session. */
  public static async count(sessionId: string): Promise<number> {
    const buffered = this.buffers.get(sessionId)?.length ?? 0;
    const file = filePathFor(sessionId);
    if (!fs.existsSync(file)) return buffered;
    try {
      const data = await fsp.readFile(file, 'utf-8');
      const parsed = JSON.parse(data);
      const count = Array.isArray(parsed.messages)
        ? parsed.messages.length
        : Array.isArray(parsed.steps)
        ? parsed.steps.length
        : 0;
      return count + buffered;
    } catch {
      return buffered;
    }
  }

  /**
   * Read a page of the transcript for UI scroll-up. `offset`/`limit` index into
   * the full (oldest-first) transcript; the UI requests older pages as the user
   * scrolls up.
   */
  public static async loadRange(
    sessionId: string,
    offset: number,
    limit: number
  ): Promise<ChatMessage[]> {
    const file = filePathFor(sessionId);
    const buffered = this.buffers.get(sessionId) ?? [];
    let persisted: ChatMessage[] = [];
    if (fs.existsSync(file)) {
      try {
        const data = await fsp.readFile(file, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed.messages)) {
          persisted = parsed.messages as ChatMessage[];
        } else if (Array.isArray(parsed.steps)) {
          persisted = parsed.steps.map((s: any) => ({
            role: s.type === 'user' ? 'user' : s.type === 'assistant' ? 'assistant' : 'system',
            content: s.content || ''
          })) as ChatMessage[];
        }
      } catch {
        persisted = [];
      }
    }
    const all = persisted.concat(buffered);
    const start = Math.max(0, offset);
    return all.slice(start, start + Math.max(0, limit));
  }

  /** Load the entire transcript (used to rehydrate an engine on resume). */
  public static async loadFull(sessionId: string): Promise<ChatMessage[]> {
    return this.loadRange(sessionId, 0, Number.MAX_SAFE_INTEGER);
  }

  /** Drop a session's transcript from disk and memory. */
  public static async clear(sessionId: string): Promise<void> {
    this.buffers.delete(sessionId);
    const t = this.timers.get(sessionId);
    if (t) {
      clearTimeout(t);
      this.timers.delete(sessionId);
    }
    const file = filePathFor(sessionId);
    try {
      await fsp.unlink(file);
      const dir = path.dirname(file);
      const remaining = await fsp.readdir(dir);
      if (remaining.length === 0) {
        await fsp.rmdir(dir);
      }
    } catch {
      // ignore missing file
    }
  }

  /** Best-effort flush of all buffered history on clean exit. */
  public static shutdown(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    void this.flushAll();
  }
}

if (typeof process !== 'undefined' && typeof process.once === 'function') {
  process.once('beforeExit', () => MessageHistoryStore.shutdown());
}

