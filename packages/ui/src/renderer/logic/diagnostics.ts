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

export interface DiagnosticExtraInputs {
  authStatus?: {
    authenticated?: boolean;
    authRequired?: boolean;
    passwordSet?: boolean;
    isDefaultPassword?: boolean;
    version?: string;
    isDaemonOnline?: boolean;
    backendConnected?: boolean;
  };
  ownerName?: string | null;
  telegramConfigured?: boolean;
}

/** Builds the Doctor diagnostic checklist from config inputs + runtime versions. */
export class DiagnosticsService {
  /**
   * Reads runtime environment info, falling back gracefully in web environments.
   */
  static environmentVersions(): { runtime: string; userAgent: string } {
    const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null;
    const isTauri = Boolean(win && (win.__TAURI_INTERNALS__ || win.__TAURI__));
    const runtime = isTauri ? 'Tauri v2 Desktop Host' : 'Web Browser SPA';
    const userAgent = typeof navigator !== 'undefined' ? (navigator.userAgent || 'unknown') : 'unknown';
    return { runtime, userAgent };
  }

  /**
   * Assembles diagnostic checks: runtime environment, core daemon, host branding,
   * authentication security, configured provider keys, registered models,
   * sandbox mode, and optional remote Telegram access.
   */
  static buildChecks(
    byokKeys: Record<string, string>,
    modelsCount: number,
    unsandboxedActions: boolean,
    extra?: DiagnosticExtraInputs
  ): DiagnosticCheck[] {
    const { runtime } = DiagnosticsService.environmentVersions();
    const results: DiagnosticCheck[] = [];

    results.push({
      name: 'App Runtime Environment',
      status: 'pass',
      detail: runtime
    });

    // Core Engine Daemon Check
    if (extra?.authStatus?.version) {
      results.push({
        name: 'Core Engine Daemon',
        status: 'pass',
        detail: `Core Engine Daemon v${extra.authStatus.version} active on port 1469`
      });
    } else if (extra?.authStatus?.isDaemonOnline === false || extra?.authStatus?.backendConnected === false) {
      results.push({
        name: 'Core Engine Daemon',
        status: 'warn',
        detail: 'Core Engine daemon unreachable on port 1469'
      });
    } else {
      results.push({
        name: 'Core Engine Daemon',
        status: 'pass',
        detail: 'Connected to local daemon on port 1469'
      });
    }

    // Host Ownership & Branding Check
    const effectiveOwner = (extra?.ownerName || '').trim();
    if (effectiveOwner && effectiveOwner !== 'SuperAgent User') {
      results.push({
        name: 'Host Ownership & Branding',
        status: 'pass',
        detail: `Host Owner: ${effectiveOwner}`
      });
    } else {
      results.push({
        name: 'Host Ownership & Branding',
        status: 'warn',
        detail: 'Host owner not configured — set in Host Ownership'
      });
    }

    // Web App Authentication & Access Security Check
    if (extra?.authStatus?.isDefaultPassword) {
      results.push({
        name: 'Web App Authentication',
        status: 'warn',
        detail: "Default admin password in use ('admin') — consider setting a new password"
      });
    } else if (extra?.authStatus?.passwordSet) {
      results.push({
        name: 'Web App Authentication',
        status: 'pass',
        detail: 'Custom access password configured'
      });
    } else {
      results.push({
        name: 'Web App Authentication',
        status: 'pass',
        detail: 'Local session authenticated'
      });
    }

    // Provider API Keys
    const count = Object.values(byokKeys).filter(Boolean).length;
    results.push({
      name: 'Provider API Keys',
      status: count > 0 ? 'pass' : 'warn',
      detail:
        count > 0
          ? `${count} provider key(s) configured`
          : 'No API keys configured — set one in the BYOK Provider Settings'
    });

    // Model Registry
    results.push({
      name: 'Model Registry',
      status: modelsCount > 0 ? 'pass' : 'warn',
      detail:
        modelsCount > 0
          ? `${modelsCount} model(s) registered in catalog`
          : 'No models found in catalog — enable providers under AI Config'
    });

    // App Execution Sandbox
    results.push({
      name: 'App Execution Sandbox',
      status: unsandboxedActions ? 'warn' : 'pass',
      detail: unsandboxedActions
        ? 'Full system access enabled (unsandboxed actions)'
        : 'Sandboxed mode active (secure execution environment)'
    });

    // Telegram Remote Control (strictly optional — never a failure)
    results.push({
      name: 'Telegram Remote Control',
      status: 'pass',
      detail: extra?.telegramConfigured
        ? 'Telegram bot active for remote agent tasks'
        : 'Not configured (optional remote control)'
    });

    return results;
  }
}
