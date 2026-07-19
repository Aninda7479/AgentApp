import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import type { UiMessage } from './ui/MessageView.js';

/** Directory holding per-session conversation transcripts under ~/.superagent/conversation/chats. */
function chatsDir(): string {
  const base = path.join(os.homedir(), '.superagent', 'conversation', 'chats');
  try {
    fs.mkdirSync(base, { recursive: true });
  } catch {
    /* read-only fs or first-run race; ignore */
  }
  return base;
}

function sessionDir(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = path.join(chatsDir(), safe);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return dir;
}

function sessionPath(id: string): string {
  return path.join(sessionDir(id), 'chat.json');
}

/** Persists the conversation transcript for a session id under ~/.superagent/conversation/chats/<id>/chat.json. */
export function saveSession(id: string, messages: UiMessage[]): void {
  if (!id) return;
  try {
    const validMessages = messages.filter((m) => m.role !== 'system' || !m.id.startsWith('sys-'));
    const payload = validMessages.map((m) => ({ role: m.role, content: m.content }));
    const steps = validMessages.map((m) => ({
      id: m.id,
      type: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: new Date().toISOString()
    }));

    const firstUserMsg = validMessages.find((m) => m.role === 'user')?.content;
    const title = firstUserMsg ? (firstUserMsg.length > 50 ? firstUserMsg.slice(0, 47) + '...' : firstUserMsg) : id;

    const chatData = {
      id,
      title,
      project: '',
      timestamp: new Date().toISOString(),
      steps,
      messages: payload
    };

    fs.writeFileSync(sessionPath(id), JSON.stringify(chatData, null, 2));
  } catch {
    /* best-effort persistence; never block the chat on a write failure */
  }
}

/** Loads a previously saved session transcript, or null if it doesn't exist. */
export function loadSession(id: string): UiMessage[] | null {
  if (!id) return null;
  try {
    const raw = fs.readFileSync(sessionPath(id), 'utf8');
    const parsed = JSON.parse(raw) as {
      id: string;
      messages?: { role: UiMessage['role']; content: string }[];
      steps?: { id?: string; type?: string; content?: string }[];
    };

    if (Array.isArray(parsed.messages)) {
      return parsed.messages.map((m, i) => ({
        id: `r-${i}-${m.role}`,
        role: m.role,
        content: m.content,
      }));
    }

    if (Array.isArray(parsed.steps)) {
      return parsed.steps.map((step, i) => ({
        id: step.id || `r-${i}-${step.type}`,
        role: step.type === 'user' ? 'user' : step.type === 'assistant' ? 'assistant' : 'system',
        content: step.content || '',
      }));
    }

    return null;
  } catch {
    return null;
  }
}

