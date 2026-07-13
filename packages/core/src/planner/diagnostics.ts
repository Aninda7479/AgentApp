import { execSync } from 'child_process';
import { BYOKProviderManager } from '../providers/byok.js';

/** Result of a single diagnostic check. */
export interface DiagnosticResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: Record<string, unknown>;
}

/** Full system health report with aggregated diagnostics. */
export interface SystemHealthReport {
  timestamp: number;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  diagnostics: DiagnosticResult[];
}

/** Runs system checks: Node version, Git, terminal env, and provider config. */
export class SystemDiagnostics {
  public checkNodeVersion(): DiagnosticResult {
    const version = process.version;
    const majorVersion = parseInt(version.replace(/^v/, '').split('.')[0], 10);

    if (majorVersion >= 18) {
      return {
        name: 'Node.js Runtime',
        status: 'pass',
        message: `Node.js version ${version} satisfies minimum requirement (>= v18).`,
        details: { version, majorVersion }
      };
    } else {
      return {
        name: 'Node.js Runtime',
        status: 'fail',
        message: `Node.js version ${version} is below minimum requirement (>= v18).`,
        details: { version, majorVersion }
      };
    }
  }

  public checkGitBinary(): DiagnosticResult {
    try {
      const output = execSync('git --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      return {
        name: 'Git Binary',
        status: 'pass',
        message: `Git binary detected: ${output}`,
        details: { output }
      };
    } catch (err: unknown) {
      return {
        name: 'Git Binary',
        status: 'warn',
        message: 'Git binary not found or not accessible in PATH. Version control features may be limited.',
        details: { error: err instanceof Error ? err.message : String(err) }
      };
    }
  }

  public checkTerminalPermissions(): DiagnosticResult {
    const platform = process.platform;
    const cwd = process.cwd();
    return {
      name: 'Terminal & Process Environment',
      status: 'pass',
      message: `Running on platform '${platform}' with active directory '${cwd}'.`,
      details: { platform, cwd, env: process.env.SHELL || process.env.ComSpec || 'default' }
    };
  }

  public checkProviderConfig(providerManager?: BYOKProviderManager): DiagnosticResult {
    if (!providerManager) {
      return {
        name: 'BYOK Provider Configuration',
        status: 'warn',
        message: 'No BYOKProviderManager instance supplied to diagnostics.'
      };
    }

    try {
      const activeConfig = providerManager.getActiveConfig();
      return {
        name: 'BYOK Provider Configuration',
        status: 'pass',
        message: `Active provider '${activeConfig.provider}' configured successfully.`,
        details: { provider: activeConfig.provider }
      };
    } catch (err: unknown) {
      return {
        name: 'BYOK Provider Configuration',
        status: 'warn',
        message: 'No active provider key configured yet.',
        details: { info: err instanceof Error ? err.message : String(err) }
      };
    }
  }

  public async runDiagnostics(providerManager?: BYOKProviderManager): Promise<SystemHealthReport> {
    const results: DiagnosticResult[] = [
      this.checkNodeVersion(),
      this.checkGitBinary(),
      this.checkTerminalPermissions(),
      this.checkProviderConfig(providerManager)
    ];

    let hasFail = false;
    let hasWarn = false;

    for (const res of results) {
      if (res.status === 'fail') {
        hasFail = true;
      } else if (res.status === 'warn') {
        hasWarn = true;
      }
    }

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (hasFail) {
      overallStatus = 'unhealthy';
    } else if (hasWarn) {
      overallStatus = 'degraded';
    }

    return {
      timestamp: Date.now(),
      overallStatus,
      diagnostics: results
    };
  }
}
