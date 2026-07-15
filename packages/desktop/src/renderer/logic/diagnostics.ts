/**
 * Doctor diagnostics: pure derivation of the setup-check list from environment
 * and configuration inputs. The Doctor modal stays a thin renderer of whatever
 * `buildChecks` returns.
 */

/** A single diagnostic check row shown in the Doctor modal. */
export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

/** Builds the Doctor diagnostic checklist from config inputs + runtime versions. */
export class DiagnosticsService {
  /**
   * Reads the Electron / Node / Chrome versions from `process.versions`,
   * falling back to `'unknown'` in non-Electron (web) environments.
   */
  static environmentVersions(): { node: string; chrome: string; electron: string } {
    const node = (typeof process !== 'undefined' && process.versions?.node) || 'unknown';
    const chrome = (typeof process !== 'undefined' && process.versions?.chrome) || 'unknown';
    const electron = (typeof process !== 'undefined' && process.versions?.electron) || 'unknown';
    return { node, chrome, electron };
  }

  /**
   * Assembles the four diagnostic checks: runtime versions, configured provider
   * keys, registered models, and the execution-sandbox mode.
   */
  static buildChecks(
    byokKeys: Record<string, string>,
    modelsCount: number,
    unsandboxedActions: boolean
  ): DiagnosticCheck[] {
    const { node, chrome, electron } = DiagnosticsService.environmentVersions();
    const results: DiagnosticCheck[] = [];

    results.push({
      name: 'App Runtime Environments',
      status: 'pass',
      detail: `Electron v${electron} | Node v${node} | Chrome v${chrome}`
    });

    const count = Object.values(byokKeys).filter(Boolean).length;
    results.push({
      name: 'Provider API Keys',
      status: count > 0 ? 'pass' : 'warn',
      detail:
        count > 0
          ? `${count} provider key(s) configured`
          : 'No API keys configured — set one in the BYOK Provider Settings'
    });

    results.push({
      name: 'Model Registry',
      status: modelsCount > 0 ? 'pass' : 'warn',
      detail:
        modelsCount > 0
          ? `${modelsCount} model(s) registered in catalog`
          : 'No models found in catalog — enable providers under AI Config'
    });

    results.push({
      name: 'App Execution Sandbox',
      status: unsandboxedActions ? 'warn' : 'pass',
      detail: unsandboxedActions
        ? 'Full system access enabled (unsandboxed actions)'
        : 'Sandboxed mode active (secure execution environment)'
    });

    return results;
  }
}
