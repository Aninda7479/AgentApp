import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import type { UiMessage } from './ui/MessageView.js';

/** Directory holding per-session conversation transcripts, keyed by session id. */
function sessionsDir(): string {
  const base = path.join(os.homedir(), '.superagent', 'sessions');
  try {
    fs.mkdirSync(base, { recursive: true });
  } catch {
    /* read-only fs or first-run race; ignore */
  }
  return base;
}

function sessionPath(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(sessionsDir(), `${safe}.json`);
}

/** Persists the conversation transcript for a session id. Only role + content
 *  are stored (tool calls / timings are transient and not needed to resume). */
export function saveSession(id: string, messages: UiMessage[]): void {
  if (!id) return;
  try {
    const payload = messages
      .filter((m) => m.role !== 'system' || !m.id.startsWith('sys-'))
      .map((m) => ({ role: m.role, content: m.content }));
    fs.writeFileSync(sessionPath(id), JSON.stringify({ id, messages: payload }, null, 2));
  } catch {
    /* best-effort persistence; never block the chat on a write failure */
  }
}

/** Loads a previously saved session transcript, or null if it doesn't exist. */
export function loadSession(id: string): UiMessage[] | null {
  if (!id) return null;
  try {
    const raw = fs.readFileSync(sessionPath(id), 'utf8');
    const parsed = JSON.parse(raw) as { id: string; messages: { role: UiMessage['role']; content: string }[] };
    if (!Array.isArray(parsed.messages)) return null;
    return parsed.messages.map((m, i) => ({
      id: `r-${i}-${m.role}`,
      role: m.role,
      content: m.content,
    }));
  } catch {
    return null;
  }
}
