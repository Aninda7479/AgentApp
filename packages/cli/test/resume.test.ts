import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import React from 'react';
import { render } from 'ink';
import { App } from '../src/ui/App.js';
import { saveSession, loadSession } from '../src/session_store.js';

const id = 'test-resume-verify-1234';
const file = path.join(os.homedir(), '.superagent', 'sessions', `${id}.json`);

afterAll(() => {
  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
});

function fakeStdout() {
  let buf = '';
  const listeners: Record<string, Array<() => void>> = {};
  return {
    isTTY: true,
    columns: 80,
    rows: 30,
    write: (s: string) => {
      buf += s;
      return true;
    },
    on: (e: string, cb: () => void) => {
      (listeners[e] ||= []).push(cb);
    },
    off: () => {},
    get buffer() {
      return buf;
    },
  };
}

describe('session resume', () => {
  it('persists a conversation and reloads it into the TUI', async () => {
    const history = [
      { id: 'u1', role: 'user' as const, content: 'Remember the magic word is zebra' },
      { id: 'a1', role: 'assistant' as const, content: 'Got it — the magic word is zebra.' },
    ];
    saveSession(id, history);

    const loaded = loadSession(id);
    expect(loaded?.map((m) => m.content)).toEqual([
      'Remember the magic word is zebra',
      'Got it — the magic word is zebra.',
    ]);

    const stdout = fakeStdout();
    const stdin: any = {
      isTTY: true,
      setRawMode: () => {},
      setEncoding: () => {},
      on: () => {},
      off: () => {},
      pause: () => {},
      resume: () => {},
    };
    const instance = render(React.createElement(App, { sessionId: id, initialMessages: loaded ?? undefined }), {
      stdout: stdout as any,
      stdin,
      exitOnCtrlC: false,
      patchConsole: false,
    });

    await new Promise((r) => setTimeout(r, 50));
    const out = stdout.buffer;
    expect(out).toContain('Remember the magic word is zebra');
    expect(out).toContain('Got it — the magic word is zebra.');
    expect(out).toContain('Resumed session');
    instance.unmount();
  });
});
