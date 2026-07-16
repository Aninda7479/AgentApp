import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseIntervalToMs,
  loadLoopPrompt,
  SessionLoopManager
} from '../src/automation/loop.js';

describe('Loop Parsing and Loaders', () => {
  it('correctly parses duration intervals to milliseconds', () => {
    expect(parseIntervalToMs('10s')).toBe(10 * 1000);
    expect(parseIntervalToMs('5m')).toBe(5 * 60 * 1000);
    expect(parseIntervalToMs('3h')).toBe(3 * 60 * 60 * 1000);
    expect(parseIntervalToMs('2d')).toBe(2 * 24 * 60 * 60 * 1000);
    expect(parseIntervalToMs('invalid')).toBe(10 * 60 * 1000); // fallback 10m
  });

  it('loads loop prompt from workspace or returns fallback', () => {
    const fallback = loadLoopPrompt();
    expect(fallback).toContain('Run a proactive session maintenance check');
  });
});

describe('SessionLoopManager', () => {
  it('can start and stop recurring tasks, and triggers callback', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const manager = new SessionLoopManager(callback);

    const task = manager.start('5s', 'Hello world');
    expect(task.id).toBeDefined();
    expect(task.interval).toBe('5s');
    expect(task.prompt).toBe('Hello world');
    expect(task.isActive).toBe(true);

    const tasksList = manager.getTasks();
    expect(tasksList.length).toBe(1);
    expect(tasksList[0].id).toBe(task.id);

    // Fast-forward time
    vi.advanceTimersByTime(5000);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(task);

    vi.advanceTimersByTime(5000);
    expect(callback).toHaveBeenCalledTimes(2);

    const stopped = manager.stop(task.id);
    expect(stopped).toBe(true);
    expect(manager.getTasks().length).toBe(0);

    vi.useRealTimers();
  });
});
