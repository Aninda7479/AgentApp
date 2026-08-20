import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import {
  TrajectoryTokenCounter,
  isWebServerRunning,
  readWebServerLock,
  AuthStore,
  SettingsStorage,
  AutostartManager
} from '@superagent/core';
import { SessionContext, CLICommandResult } from '../types.js';

/** Snapshot of session statistics for display. */
export interface StatusReport {
  sessionDurationSeconds: number;
  activeProvider: string;
  activeModel: string;
  activeTheme: string;
  messageCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  contextWindowLimit: number;
  usagePercentage: number;
  estimatedCostUSD: number;
}

/** Comprehensive snapshot of CLI and server system status. */
export interface SystemStatusInfo {
  version: string;
  platform: string;
  arch: string;
  server: {
    running: boolean;
    port?: number;
    pid?: number;
    startedBy?: string;
    url?: string;
    startedAt?: string;
  };
  devices: {
    count: number;
    list: Array<{
      id: string;
      username: string;
      ip: string;
      userAgent: string;
      createdAt?: string;
      lastActive?: string;
    }>;
  };
  autostart: {
    enabled: boolean;
    command?: string;
    entryLocation?: string;
  };
  providers: {
    count: number;
    connected: string[];
    activeModel?: string;
  };
}

/** Resolves CLI version safely from package.json. */
export function getCliVersion(): string {
  try {
    const currentDir =
      typeof import.meta !== 'undefined' && import.meta.url
        ? path.dirname(fileURLToPath(import.meta.url))
        : typeof __dirname !== 'undefined'
        ? __dirname
        : process.cwd();
    const candidatePaths = [
      path.join(currentDir, '..', '..', 'package.json'),
      path.join(currentDir, '..', 'package.json'),
      path.join(currentDir, 'package.json'),
      path.join(process.cwd(), 'package.json')
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (pkg.version) return pkg.version;
      }
    }
  } catch {
    // Fallback
  }
  return '0.10.0';
}

/** Computes overall system, server, device, and autostart status. */
export async function getSystemStatus(): Promise<SystemStatusInfo> {
  const version = getCliVersion();
  const platform = os.platform();
  const arch = os.arch();

  // 1. Web server status
  const running = isWebServerRunning();
  const lock = running ? readWebServerLock() : null;
  const port = lock?.port ?? 1469;

  const serverInfo = {
    running,
    port: running ? port : undefined,
    pid: lock?.pid,
    startedBy: lock?.startedBy,
    url: running ? `http://localhost:${port}` : undefined,
    startedAt: lock?.startedAt ? new Date(lock.startedAt).toLocaleString() : undefined
  };

  // 2. Connected devices & active sessions
  let activeSessions: any[] = [];
  try {
    activeSessions = AuthStore.getActiveSessions();
  } catch {
    activeSessions = [];
  }

  const deviceList = activeSessions.map((s) => ({
    id: s.id,
    username: s.username,
    ip: s.ip || '127.0.0.1',
    userAgent: s.userAgent || 'Web Client',
    createdAt: s.createdAt,
    lastActive: s.lastActive
  }));

  // 3. Autostart status
  let autostartInfo = { enabled: false, command: undefined as string | undefined, entryLocation: undefined as string | undefined };
  try {
    const info = await AutostartManager.getInfo('cli');
    autostartInfo = {
      enabled: info.enabled,
      command: info.command,
      entryLocation: info.entryLocation
    };
  } catch {
    // ignore
  }

  // 4. Provider configuration
  let connectedProviders: string[] = [];
  let activeModel: string | undefined;
  try {
    const settings = SettingsStorage.loadSettings();
    connectedProviders = (settings.providers || []).map((p) => p.name || p.id);
    activeModel = settings.lastUsedModel?.model;
  } catch {
    // ignore
  }

  return {
    version,
    platform: `${platform} (${arch})`,
    arch,
    server: serverInfo,
    devices: {
      count: deviceList.length,
      list: deviceList
    },
    autostart: autostartInfo,
    providers: {
      count: connectedProviders.length,
      connected: connectedProviders,
      activeModel
    }
  };
}

/** Formats system status into a clean terminal report. */
export function formatSystemStatus(status: SystemStatusInfo): string {
  const lines: string[] = [
    '======================================================',
    '              SUPERAGENT SYSTEM STATUS',
    '======================================================',
    `CLI Version:         v${status.version}`,
    `OS Platform:         ${status.platform}`,
    ''
  ];

  // Web Server section
  lines.push('Web Server (--serve):');
  if (status.server.running) {
    lines.push(`  Status:            RUNNING`);
    lines.push(`  Port:              ${status.server.port}`);
    lines.push(`  Local URL:         ${status.server.url}`);
    lines.push(`  PID:               ${status.server.pid}`);
    if (status.server.startedBy) {
      lines.push(`  Started By:        ${status.server.startedBy}`);
    }
    if (status.server.startedAt) {
      lines.push(`  Started At:        ${status.server.startedAt}`);
    }
  } else {
    lines.push(`  Status:            STOPPED`);
    lines.push(`  Tip:               Start anytime with 'superagent --serve'`);
  }
  lines.push('');

  // Connected Devices section
  lines.push('Connected Devices:');
  if (status.devices.count > 0) {
    lines.push(`  Total Active:      ${status.devices.count} device${status.devices.count === 1 ? '' : 's'}`);
    status.devices.list.forEach((d, idx) => {
      const timeStr = d.lastActive ? new Date(d.lastActive).toLocaleTimeString() : 'Active';
      lines.push(`  ${idx + 1}. ${d.userAgent} (${d.ip}) — Last active: ${timeStr}`);
    });
  } else {
    lines.push(`  Total Active:      0 devices connected`);
    if (status.server.running) {
      lines.push(`  Tip:               Connect from browser at ${status.server.url}`);
    }
  }
  lines.push('');

  // Startup Service section
  lines.push('Run on Startup:');
  lines.push(`  Status:            ${status.autostart.enabled ? 'ENABLED (Runs --serve on boot)' : 'DISABLED'}`);
  if (status.autostart.entryLocation) {
    lines.push(`  Location:          ${status.autostart.entryLocation}`);
  }
  lines.push('');

  // AI Configuration section
  lines.push('AI Configuration:');
  lines.push(`  Connected:         ${status.providers.connected.length > 0 ? status.providers.connected.join(', ') : 'None (BYOK in settings)'}`);
  if (status.providers.activeModel) {
    lines.push(`  Active Model:      ${status.providers.activeModel}`);
  }
  lines.push('======================================================');

  return lines.join('\n');
}

/** Tracks token usage and generates status reports for the session. */
export class SessionTracker {
  private tokenCounter: TrajectoryTokenCounter = new TrajectoryTokenCounter();

  /** Records prompt and completion token usage for the session. */
  public recordTokenUsage(context: SessionContext, prompt: number, completion: number, costUSD?: number): void {
    context.tokenUsage.promptTokens += prompt;
    context.tokenUsage.completionTokens += completion;
    context.tokenUsage.totalTokens += prompt + completion;
    if (costUSD) {
      context.tokenUsage.estimatedCost += costUSD;
    }
  }

  /** Computes the current session status report with token metrics. */
  public getStatusReport(context: SessionContext): StatusReport {
    const now = Date.now();
    const duration = Math.floor((now - context.startTime) / 1000);

    // Get active model capability for context window limit
    const capability = context.capabilityRegistry.getCapability(context.activeModel);
    const limit = capability ? capability.contextWindow : 128000;

    // Recalculate trajectory usage from messages for precision
    const trajectoryUsage = this.tokenCounter.calculateTrajectoryUsage(
      context.messages,
      [],
      '',
      limit
    );

    const promptTokens = context.tokenUsage.promptTokens || trajectoryUsage.messageTokens;
    const completionTokens = context.tokenUsage.completionTokens || 0;
    const totalTokens = context.tokenUsage.totalTokens > 0 ? context.tokenUsage.totalTokens : trajectoryUsage.totalTokens;
    const usagePercentage = limit > 0 ? Number(((totalTokens / limit) * 100).toFixed(2)) : 0;

    return {
      sessionDurationSeconds: duration,
      activeProvider: context.activeProvider,
      activeModel: context.activeModel,
      activeTheme: context.activeTheme.name,
      messageCount: context.messages.length,
      promptTokens,
      completionTokens,
      totalTokens,
      contextWindowLimit: limit,
      usagePercentage,
      estimatedCostUSD: Number(context.tokenUsage.estimatedCost.toFixed(5))
    };
  }

  /** Formats the status report as a human-readable multi-line string. */
  public formatStatusReport(context: SessionContext): string {
    const report = this.getStatusReport(context);
    const mins = Math.floor(report.sessionDurationSeconds / 60);
    const secs = report.sessionDurationSeconds % 60;
    const timeFormatted = `${mins}m ${secs}s`;

    const lines: string[] = [
      '=== Session Status & Token Meter ===',
      `Elapsed Time:      ${timeFormatted}`,
      `Active Provider:   ${report.activeProvider}`,
      `Active Model:      ${report.activeModel}`,
      `Visual Theme:      ${report.activeTheme}`,
      `Messages Tracked:  ${report.messageCount}`,
      '------------------------------------',
      `Prompt Tokens:     ${report.promptTokens.toLocaleString()}`,
      `Completion Tokens: ${report.completionTokens.toLocaleString()}`,
      `Total Tokens:      ${report.totalTokens.toLocaleString()} / ${report.contextWindowLimit.toLocaleString()} (${report.usagePercentage}%)`,
      `Estimated Cost:    $${report.estimatedCostUSD.toFixed(4)} USD`
    ];

    return lines.join('\n');
  }
}

/** Handles `/status` slash command in interactive chat. */
export async function handleStatusCommand(args: string[], context: SessionContext): Promise<CLICommandResult> {
  const sub = args[0]?.toLowerCase();

  if (sub === 'system' || sub === 'all' || sub === '--system') {
    const systemStatus = await getSystemStatus();
    return {
      success: true,
      message: formatSystemStatus(systemStatus),
      data: systemStatus
    };
  }

  const tracker = new SessionTracker();
  const sessionReport = tracker.formatStatusReport(context);

  // In interactive chat, also append a concise web server & device summary
  const running = isWebServerRunning();
  const lock = running ? readWebServerLock() : null;
  const sessions = AuthStore.getActiveSessions();

  const serverSnippet = [
    '',
    '--- System & Server Overview ---',
    `CLI Version:       v${getCliVersion()}`,
    `Server (--serve):  ${running ? `RUNNING on port ${lock?.port ?? 1469}` : 'STOPPED'}`,
    `Connected Devices: ${sessions.length} device(s)`
  ].join('\n');

  return {
    success: true,
    message: sessionReport + serverSnippet,
    data: {
      session: tracker.getStatusReport(context),
      system: { running, port: lock?.port, deviceCount: sessions.length }
    }
  };
}
