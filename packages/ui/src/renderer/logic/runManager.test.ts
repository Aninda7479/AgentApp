import { describe, it, expect, beforeEach } from 'vitest';
import { RunManager } from './runManager';
import type { ComposerOptions, ComposerAttachment } from './types';

const OPTS: ComposerOptions = { model: 'm' };
const NO_ATTACH: ComposerAttachment[] = [];

describe('RunManager', () => {
  let rm: RunManager;
  beforeEach(() => {
    rm = new RunManager();
  });

  it('returns a stable, per-session streaming-ref bundle', () => {
    const a = rm.getStreamRefs('c1');
    expect(rm.getStreamRefs('c1')).toBe(a);
    expect(rm.getStreamRefs('c2')).not.toBe(a);
  });

  it('drains queued prompts in FIFO order and toggles the running set', () => {
    const started: string[] = [];
    // Starter mimics sendPrompt: it records the run and re-marks the chat
    // running (the next in-flight run).
    rm.setStarter((item) => {
      started.push(item.prompt);
      rm.markRunning('c1');
    });

    expect(rm.isAnyGenerating()).toBe(false);

    rm.markRunning('c1');
    rm.enqueue('c1', { prompt: 'second', options: OPTS, attachments: NO_ATTACH });
    rm.enqueue('c1', { prompt: 'third', options: OPTS, attachments: NO_ATTACH });
    expect(rm.queueDepth('c1')).toBe(2);
    expect(rm.isAnyGenerating()).toBe(true);

    // First response ends -> 'second' runs, 'third' still queued.
    rm.onTerminal('c1');
    expect(started).toEqual(['second']);
    expect(rm.queueDepth('c1')).toBe(1);
    expect(rm.isRunning('c1')).toBe(true);

    // Second response ends -> 'third' runs, queue empty.
    rm.onTerminal('c1');
    expect(started).toEqual(['second', 'third']);
    expect(rm.queueDepth('c1')).toBe(0);
    expect(rm.isRunning('c1')).toBe(true);

    // Third response ends -> nothing queued, chat goes idle.
    rm.onTerminal('c1');
    expect(started).toEqual(['second', 'third']);
    expect(rm.isRunning('c1')).toBe(false);
    expect(rm.isAnyGenerating()).toBe(false);
  });

  it('does nothing on terminal when the queue is empty', () => {
    const started: string[] = [];
    rm.setStarter((item) => started.push(item.prompt));
    rm.markRunning('c1');
    rm.onTerminal('c1');
    expect(started).toEqual([]);
    expect(rm.isAnyGenerating()).toBe(false);
  });

  it('tracks per-chat running independently for multi-chat concurrency', () => {
    rm.markRunning('a');
    rm.markRunning('b');
    expect(rm.isRunning('a')).toBe(true);
    expect(rm.isRunning('b')).toBe(true);
    expect(rm.isAnyGenerating()).toBe(true);
    rm.markIdle('a');
    expect(rm.isRunning('a')).toBe(false);
    expect(rm.isRunning('b')).toBe(true);
    expect(rm.isAnyGenerating()).toBe(true);
  });
});
