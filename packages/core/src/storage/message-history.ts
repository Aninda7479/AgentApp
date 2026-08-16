import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { getUserDataDirectory } from './locations.js';
import { getChatJsonPath, getConversationRoots } from './conversation-paths.js';
import type { ChatMessage } from '../types/agent.js';
import type { TrajectoryStep, TrajectoryAttachment, TrajectoryCodeBlock } from './conversation-types.js';

function safeName(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'session';
}

async function resolveSessionFilePath(sessionId: string): Promise<string> {
  const userDataDir = getUserDataDirectory();
  const safeId = safeName(sessionId);
  const standalone = getChatJsonPath(userDataDir, safeId);
  if (fs.existsSync(standalone)) return standalone;

  const roots = getConversationRoots(userDataDir);
  try {
    if (fs.existsSync(roots.projectsDir)) {
      const projectFolders = await fsp.readdir(roots.projectsDir);
      for (const p of projectFolders) {
        const candidate = getChatJsonPath(userDataDir, safeId, p);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch {
    /* ignore search error */
  }

  return standalone;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' && typeof part.text === 'string') return part.text;
        if (part?.type === 'image_url') return `[Image attachment: ${part.image_url?.url ? 'image' : ''}]`;
        return JSON.stringify(part);
      })
      .join('\n');
  }
  return content ? JSON.stringify(content) : '';
}

function extractCodeBlocks(text: string): TrajectoryCodeBlock[] {
  const blocks: TrajectoryCodeBlock[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      code: match[2].trimEnd()
    });
  }
  return blocks;
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

  /** Append buffered messages to the JSON transcript in ~/.superagent/conversation/chats/<id>/chat.json or projects. */
  public static async flush(sessionId: string): Promise<void> {
    const existing = this.inflight.get(sessionId);
    if (existing) return existing;

    const promise = (async () => {
      const buf = this.buffers.get(sessionId);
      if (!buf || buf.length === 0) return;
      this.buffers.set(sessionId, []);
      try {
        const file = await resolveSessionFilePath(sessionId);
        await fsp.mkdir(path.dirname(file), { recursive: true });

        let existingSteps: TrajectoryStep[] = [];
        let existingMessages: any[] = [];
        let title = sessionId;
        let project = '';
        let timestamp = new Date().toISOString();

        if (fs.existsSync(file)) {
          try {
            const raw = await fsp.readFile(file, 'utf-8');
            const parsed = JSON.parse(raw);
            existingSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
            existingMessages = Array.isArray(parsed.messages) ? parsed.messages : [];
            title = parsed.title || sessionId;
            project = parsed.project || '';
            timestamp = parsed.timestamp || timestamp;
          } catch {
            /* ignore parse failure */
          }
        }

        const newSteps: TrajectoryStep[] = [];
        for (let i = 0; i < buf.length; i++) {
          const m = buf[i];
          const text = extractText(m.content);
          const modelName = (m as any).model;
          const ts = (m as any).timestamp || new Date().toISOString();

          if (m.role === 'user') {
            const rawAttachments = (m as any).attachments || [];
            const attachments: TrajectoryAttachment[] = Array.isArray(rawAttachments)
              ? rawAttachments.map((a: any) => ({
                  name: a.name || a.filename || 'attachment',
                  path: a.path || a.fullPath || '',
                  mediaType: a.mediaType || (a.filename?.endsWith('.pdf') ? 'pdf' : 'file'),
                  size: a.size,
                  url: a.url
                }))
              : [];
            newSteps.push({
              id: (m as any).id || `msg-${Date.now()}-${i}`,
              type: 'user',
              content: text,
              timestamp: ts,
              model: modelName,
              metadata: {
                model: modelName,
                attachments: attachments.length > 0 ? attachments : undefined,
                sandboxMode: (m as any).sandboxMode
              }
            });
          } else if (m.role === 'assistant') {
            const codeBlocks = extractCodeBlocks(text);
            newSteps.push({
              id: (m as any).id || `msg-${Date.now()}-${i}`,
              type: 'assistant',
              content: text,
              timestamp: ts,
              model: modelName,
              metadata: {
                model: modelName,
                codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
                workedDuration: (m as any).workedDuration,
                sandboxMode: (m as any).sandboxMode
              }
            });

            if (m.toolCalls && Array.isArray(m.toolCalls)) {
              for (const tc of m.toolCalls) {
                const toolArgs = tc.args || {};
                const cmd = toolArgs.CommandLine || toolArgs.command;
                const cwd = toolArgs.Cwd || toolArgs.cwd;
                newSteps.push({
                  id: tc.id || `tool-${tc.toolName}-${Date.now()}`,
                  type: 'tool_call',
                  toolName: tc.toolName,
                  content: `${tc.toolName}(${JSON.stringify(toolArgs)})`,
                  status: tc.status === 'failed' ? 'error' : tc.status === 'completed' ? 'success' : 'running',
                  timestamp: ts,
                  model: modelName,
                  metadata: {
                    model: modelName,
                    toolArgs,
                    command: cmd,
                    cwd,
                    toolResult: tc.result
                  }
                });
              }
            }
          } else if (m.role === 'tool') {
            const toolName = (m as any).name || (m as any).toolName || 'tool';
            const toolArgs = (m as any).toolArgs || {};
            const cmd = toolArgs.CommandLine || toolArgs.command;
            const cwd = toolArgs.Cwd || toolArgs.cwd;
            newSteps.push({
              id: (m as any).id || `tool-result-${Date.now()}-${i}`,
              type: 'tool_result',
              toolName,
              content: text,
              status: (m as any).isError ? 'error' : 'success',
              timestamp: ts,
              model: modelName,
              metadata: {
                model: modelName,
                toolArgs: Object.keys(toolArgs).length > 0 ? toolArgs : undefined,
                command: cmd,
                cwd,
                toolResult: text,
                exitCode: (m as any).exitCode
              }
            });
          }
        }

        const newMessages = buf.map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          model: (m as any).model
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
          project,
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
    const file = await resolveSessionFilePath(sessionId);
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
    const file = await resolveSessionFilePath(sessionId);
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
    const file = await resolveSessionFilePath(sessionId);
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

