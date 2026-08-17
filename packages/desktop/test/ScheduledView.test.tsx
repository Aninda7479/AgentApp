import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScheduledView, formatCronNaturalLanguage } from '../src/renderer/pages/Workspace/ScheduledView';

describe('ScheduledView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders ScheduledView with tasks and templates subtabs', () => {
    const html = renderToString(
      <ScheduledView
        onCreateTask={vi.fn()}
        onUseTemplate={vi.fn()}
      />
    );
    expect(html).toContain('Active Routines');
    expect(html).toContain('Templates');
    expect(html).toContain('New Schedule');
    expect(html).toContain('Automated Schedules &amp; Routines');
    expect(html).toContain('No active scheduled routines');
    expect(html).toContain('Create Schedule Manually');
  });

  it('renders quick presets in empty state', () => {
    const html = renderToString(
      <ScheduledView
        onCreateTask={vi.fn()}
        onUseTemplate={vi.fn()}
      />
    );
    expect(html).toContain('Daily Standup Brief');
    expect(html).toContain('Weekly Code Review');
    expect(html).toContain('Nightly Bug &amp; Security Scan');
    expect(html).toContain('Source File Watcher');
  });

  describe('formatCronNaturalLanguage helper', () => {
    it('formats known standard cron expressions correctly', () => {
      expect(formatCronNaturalLanguage('*/15 * * * *')).toBe('Every 15 minutes');
      expect(formatCronNaturalLanguage('0 9 * * *')).toBe('Every day at 09:00');
      expect(formatCronNaturalLanguage('0 9 * * 1-5')).toBe('Every weekday (Mon–Fri) at 09:00');
      expect(formatCronNaturalLanguage('0 17 * * 5')).toBe('Every Friday at 17:00');
      expect(formatCronNaturalLanguage('0 18 * * 0')).toBe('Every Sunday at 18:00 (6 PM)');
    });

    it('formats watcher and webhook trigger types', () => {
      expect(formatCronNaturalLanguage(undefined, undefined, 'watcher', './src')).toBe('Watches changes in "./src"');
      expect(formatCronNaturalLanguage(undefined, undefined, 'webhook')).toBe('Triggered via incoming Webhook / API request');
    });

    it('formats intervalMs correctly', () => {
      expect(formatCronNaturalLanguage(undefined, 30 * 60 * 1000)).toBe('Every 30 minutes');
      expect(formatCronNaturalLanguage(undefined, 2 * 60 * 60 * 1000)).toBe('Every 2 hours');
    });
  });
});
