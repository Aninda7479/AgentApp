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
   * Reads runtime environment info, falling back gracefully in web environments.
   */
  static environmentVersions(): { runtime: string; userAgent: string } {
    const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
    const runtime = isTauri ? 'Tauri v2 Desktop Host' : 'Web Browser SPA';
    const userAgent = typeof navigator !== 'undefined' ? (navigator.userAgent || 'unknown') : 'unknown';
    return { runtime, userAgent };
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
    const { runtime } = DiagnosticsService.environmentVersions();
    const results: DiagnosticCheck[] = [];

    results.push({
      name: 'App Runtime Environment',
      status: 'pass',
      detail: runtime
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
