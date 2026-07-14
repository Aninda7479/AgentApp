import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { getConfigDirectory, loadSettings } from '@superagent/core';

/** A saved bug report (offline; no external submission in the CLI). */
export interface BugReport {
  id: string;
  createdAt: string;
  summary: string;
  details: string;
  environment: {
    node: string;
    platform: string;
    cliVersion: string;
  };
  settingsMasked: { hasProviders: boolean; theme: unknown };
  recentLogs?: string;
}

/**
 * Writes a structured bug report to disk for later triage. Mirrors the intent
 * of Claude Code's `/bug` (collect session/log context for a report) but, in
 * the offline CLI, persists a local report file rather than contacting a
 * remote service. No network calls are made.
 */
export class BugReporter {
  /** Directory where bug reports are stored. */
  public static getReportsDir(overrideDir?: string): string {
    return join(overrideDir ?? getConfigDirectory(), 'bug-reports');
  }

  /**
   * Builds and persists a bug report. `summary` is a short title; `details`
   * is the free-form description. Returns the saved report.
   */
  public static report(summary: string, details: string, overrideDir?: string): BugReport {
    const dir = this.getReportsDir(overrideDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const settings = loadSettings();
    const report: BugReport = {
      id: `bug-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      createdAt: new Date().toISOString(),
      summary: summary || '(no summary)',
      details: details || '',
      environment: {
        node: typeof process !== 'undefined' && process.version ? process.version : 'unknown',
        platform: typeof process !== 'undefined' && process.platform ? process.platform : 'unknown',
        cliVersion: (settings as { version?: string }).version ?? '0.1.0'
      },
      settingsMasked: {
        hasProviders: Array.isArray(settings.providers) && settings.providers.length > 0,
        theme: settings.theme ?? null
      }
    };

    const path = join(dir, `${report.id}.json`);
    writeFileSync(path, JSON.stringify(report, null, 2), 'utf8');
    return report;
  }
}

/** Registers the `/bug` slash command: file a local bug report. */
export function registerBugCommand(router: SlashCommandRouter): void {
  router.register(
    'bug',
    (ctx: SlashCommandContext): SlashCommandResult => {
      const text = ctx.rawArgs.trim();
      if (!text) {
        return {
          success: false,
          command: ctx.command,
          output: 'Usage: /bug <summary> — describe the issue. A local report is saved under Config/bug-reports.',
          error: 'Missing summary'
        };
      }
      const report = BugReporter.report(text, '', getConfigDirectory());
      return {
        success: true,
        command: ctx.command,
        output: `Bug report saved as ${report.id}. (No remote submission in the CLI — the report is stored locally for triage.)`,
        data: report
      };
    },
    {
      description: 'File a bug report (saved locally with environment context)',
      aliases: ['issue', 'report'],
      usage: '/bug <summary>'
    }
  );
}
