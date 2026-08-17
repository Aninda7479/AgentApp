import { describe, it, expect } from 'vitest';
import { stripAnsi, truncatePreview, summarizeToolContent } from './trajectory.js';
import { formatRelativeTime, formatDuration, parseDuration } from './formatTime.js';

describe('Trajectory Utils', () => {
  it('strips ANSI sequences from raw output', () => {
    const raw = '\x1b[32mSuccess\x1b[0m: file created';
    expect(stripAnsi(raw)).toBe('Success: file created');
  });

  it('truncates preview lines accurately', () => {
    const long = 'This is a very long command execution output that needs to be truncated for the summary line preview';
    const preview = truncatePreview(long, 30);
    expect(preview.length).toBeLessThanOrEqual(30);
    expect(preview.endsWith('...')).toBe(true);
  });

  it('summarizes read_file and run_command tools', () => {
    const readFileStep = {
      toolName: 'read_file',
      content: 'import React from "react";\nimport { useState } from "react";',
    };
    expect(summarizeToolContent(readFileStep)).toBe('import React from "react";');

    const cmdStep = {
      toolName: 'run_command',
      content: 'cargo test\nrunning 4 tests',
    };
    expect(summarizeToolContent(cmdStep)).toBe('cargo test');
  });
});

describe('Format Time Utils', () => {
  it('formats durations correctly', () => {
    const start = new Date(1000000000000).toISOString();
    const end = new Date(1000000012500).toISOString();
    expect(formatDuration(start, end)).toBe('12s');
  });

  it('parses duration strings', () => {
    expect(parseDuration('12s')).toBe(12000);
    expect(parseDuration('1m 30s')).toBe(90000);
  });
});
