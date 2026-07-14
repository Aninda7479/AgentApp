import { existsSync } from 'fs';
import { SettingsStorage, getSettingsFilePath } from '@superagent/core';
import { SessionContext, CLICommandResult } from '../types.js';

/** Outcome state for a single diagnostic check. */
export type DiagnosticStatus = 'pass' | 'warn' | 'fail';

/** A single configuration/setup check result. */
export interface DiagnosticCheck {
  name: string;
  status: DiagnosticStatus;
  detail: string;
}

/** Aggregated result of a full diagnostic run. */
export interface DiagnosticReport {
  healthy: boolean;
  checks: DiagnosticCheck[];
  generatedAt: string;
}

/** Minimum supported Node.js major version. */
export const MIN_NODE_MAJOR = 18;

/**
 * Runs setup diagnostics to troubleshoot local configuration, matching the
 * `/doctor` command described in the project docs (Claude Code reference).
 */
export class SystemDoctor {
  /** Parses the major Node.js version from `process.version` (e.g. v20.4.0 -> 20). */
  public static getNodeMajorVersion(): number {
    const raw = (typeof process !== 'undefined' && process.version) || 'v0.0.0';
    const match = raw.match(/^v(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /** Verifies the Node.js runtime meets the minimum required major version. */
  public static checkNodeVersion(minMajor: number = MIN_NODE_MAJOR): DiagnosticCheck {
    const major = this.getNodeMajorVersion();
    return {
      name: 'Node.js Runtime',
      status: major >= minMajor ? 'pass' : 'fail',
      detail: `Node.js v${major} detected (required >= v${minMajor})`
    };
  }

  /** Verifies that a settings file has been created on disk. */
  public static checkSettingsFile(): DiagnosticCheck {
    const settingsPath = getSettingsFilePath();
    const exists = existsSync(settingsPath);
    return {
      name: 'Configuration File',
      status: exists ? 'pass' : 'warn',
      detail: exists
        ? `Settings loaded from ${settingsPath}`
        : `No settings file yet at ${settingsPath} (run /model or /theme to create one)`
    };
  }

  /** Verifies at least one provider API key is configured. */
  public static checkProviderKeys(context: SessionContext): DiagnosticCheck {
    const count = context.byokManager.getAllConfigs().length;
    return {
      name: 'Provider API Keys',
      status: count > 0 ? 'pass' : 'warn',
      detail:
        count > 0
          ? `${count} provider key(s) configured`
          : 'No provider API key configured — set one in Settings or via env (e.g. OPENAI_API_KEY)'
    };
  }

  /** Verifies the model capability registry is populated. */
  public static checkModelRegistry(context: SessionContext): DiagnosticCheck {
    const count = context.capabilityRegistry.getAllCapabilities().length;
    return {
      name: 'Model Registry',
      status: count > 0 ? 'pass' : 'warn',
      detail: count > 0 ? `${count} model capabilities registered` : 'No model capabilities registered'
    };
  }

  /** Runs the full diagnostic suite against the session context. */
  public static run(context: SessionContext, minNodeMajor: number = MIN_NODE_MAJOR): DiagnosticReport {
    const checks: DiagnosticCheck[] = [
      this.checkNodeVersion(minNodeMajor),
      this.checkSettingsFile(),
      this.checkProviderKeys(context),
      this.checkModelRegistry(context)
    ];
    const healthy = checks.every((c) => c.status !== 'fail');
    return {
      healthy,
      checks,
      generatedAt: new Date().toISOString()
    };
  }

  /** Renders a diagnostic report as a human-readable multi-line string. */
  public static formatReport(report: DiagnosticReport): string {
    const icon: Record<DiagnosticStatus, string> = {
      pass: '[PASS]',
      warn: '[WARN]',
      fail: '[FAIL]'
    };
    const lines: string[] = ['=== SuperAgent Doctor (Setup Diagnostics) ==='];
    for (const c of report.checks) {
      lines.push(`${icon[c.status]} ${c.name}: ${c.detail}`);
    }
    lines.push('');
    lines.push(
      report.healthy
        ? 'Overall: OK — no blocking issues found.'
        : 'Overall: Issues detected — see [FAIL] items above.'
    );
    return lines.join('\n');
  }
}

/** Handles `/doctor` slash command: runs setup diagnostics and returns a report. */
export function handleDoctorCommand(_args: string[], context: SessionContext): CLICommandResult {
  const report = SystemDoctor.run(context);
  return {
    success: report.healthy,
    message: SystemDoctor.formatReport(report),
    data: report
  };
}
