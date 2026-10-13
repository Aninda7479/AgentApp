import { describe, it, expect } from 'vitest';
import { DiagnosticsService } from './diagnostics';

describe('DiagnosticsService - System Health & Doctor Checks', () => {
  it('builds base diagnostic checks correctly', () => {
    const checks = DiagnosticsService.buildChecks({ openai: 'sk-test' }, 5, false);

    const runtimeCheck = checks.find((c) => c.name === 'App Runtime Environment');
    expect(runtimeCheck).toBeDefined();
    expect(runtimeCheck?.status).toBe('pass');

    const providerCheck = checks.find((c) => c.name === 'Provider API Keys');
    expect(providerCheck?.status).toBe('pass');
    expect(providerCheck?.detail).toContain('1 provider key(s)');

    const modelCheck = checks.find((c) => c.name === 'Model Registry');
    expect(modelCheck?.status).toBe('pass');
    expect(modelCheck?.detail).toContain('5 model(s)');

    const sandboxCheck = checks.find((c) => c.name === 'App Execution Sandbox');
    expect(sandboxCheck?.status).toBe('pass');
    expect(sandboxCheck?.detail).toContain('Sandboxed mode active');
  });

  it('evaluates Core Engine Daemon status', () => {
    // Online with version
    const onlineChecks = DiagnosticsService.buildChecks({}, 0, false, {
      authStatus: { version: '0.44.0', isDaemonOnline: true },
    });
    const onlineDaemon = onlineChecks.find((c) => c.name === 'Core Engine Daemon');
    expect(onlineDaemon?.status).toBe('pass');
    expect(onlineDaemon?.detail).toContain('v0.44.0');

    // Offline daemon
    const offlineChecks = DiagnosticsService.buildChecks({}, 0, false, {
      authStatus: { isDaemonOnline: false, backendConnected: false },
    });
    const offlineDaemon = offlineChecks.find((c) => c.name === 'Core Engine Daemon');
    expect(offlineDaemon?.status).toBe('warn');
    expect(offlineDaemon?.detail).toContain('unreachable on port 1469');
  });

  it('evaluates Host Ownership & Branding status', () => {
    // Configured
    const setChecks = DiagnosticsService.buildChecks({}, 0, false, {
      ownerName: 'Aninda',
    });
    const setOwner = setChecks.find((c) => c.name === 'Host Ownership & Branding');
    expect(setOwner?.status).toBe('pass');
    expect(setOwner?.detail).toBe('Host Owner: Aninda');

    // Unconfigured
    const unsetChecks = DiagnosticsService.buildChecks({}, 0, false, {
      ownerName: '',
    });
    const unsetOwner = unsetChecks.find((c) => c.name === 'Host Ownership & Branding');
    expect(unsetOwner?.status).toBe('warn');
  });

  it('evaluates Web App Authentication status', () => {
    // Default password detected
    const defaultChecks = DiagnosticsService.buildChecks({}, 0, false, {
      authStatus: { isDefaultPassword: true },
    });
    const defaultAuth = defaultChecks.find((c) => c.name === 'Web App Authentication');
    expect(defaultAuth?.status).toBe('warn');
    expect(defaultAuth?.detail).toContain('Default admin password');

    // Custom password set
    const customChecks = DiagnosticsService.buildChecks({}, 0, false, {
      authStatus: { isDefaultPassword: false, passwordSet: true },
    });
    const customAuth = customChecks.find((c) => c.name === 'Web App Authentication');
    expect(customAuth?.status).toBe('pass');
    expect(customAuth?.detail).toContain('Custom access password');
  });

  it('treats Telegram Remote Control as strictly optional (never fail/warn)', () => {
    // When not configured: still status 'pass'
    const unconfiguredChecks = DiagnosticsService.buildChecks({}, 0, false, {
      telegramConfigured: false,
    });
    const unconfiguredTg = unconfiguredChecks.find((c) => c.name === 'Telegram Remote Control');
    expect(unconfiguredTg?.status).toBe('pass');
    expect(unconfiguredTg?.detail).toContain('optional remote control');

    // When configured: status 'pass'
    const configuredChecks = DiagnosticsService.buildChecks({}, 0, false, {
      telegramConfigured: true,
    });
    const configuredTg = configuredChecks.find((c) => c.name === 'Telegram Remote Control');
    expect(configuredTg?.status).toBe('pass');
    expect(configuredTg?.detail).toContain('Telegram bot active');
  });
});
