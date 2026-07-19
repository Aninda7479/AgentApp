import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import { PassThrough } from 'node:stream';
import React from 'react';
import { render } from 'ink';
import { App } from '../src/ui/App.js';
import { loadSession } from '../src/session_store.js';

const id = 'test-resume-e2e-5678';
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

describe('session resume e2e', () => {
  it('saves a typed message to disk so it can be resumed', async () => {
    const stdout = fakeStdout();
    const stdin = new PassThrough() as any;
    stdin.isTTY = true;
    stdin.setRawMode = () => {};
    stdin.setEncoding = () => {};
    stdin.ref = () => {};
    stdin.unref = () => {};

    const instance = render(React.createElement(App, { sessionId: id }), {
      stdout: stdout as any,
      stdin,
      exitOnCtrlC: false,
      patchConsole: false,
    });

    // Give Ink a tick to attach the readable listener, then "type" a message
    // one character at a time (a real terminal sends each key separately;
    // writing the whole string + \r as one chunk makes Ink treat \r as part
    // of the text instead of a Return keypress).
    await new Promise((r) => setTimeout(r, 30));
    for (const ch of 'hello world') {
      stdin.write(Buffer.from(ch));
      await new Promise((r) => setTimeout(r, 5));
    }
    stdin.write(Buffer.from('\r')); // Enter
    await new Promise((r) => setTimeout(r, 200));

    instance.unmount();

    // The user message must have been persisted to disk.
    const saved = loadSession(id);
    expect(saved).not.toBeNull();
    expect(saved!.some((m) => m.role === 'user' && m.content === 'hello world')).toBe(true);
  });
});
