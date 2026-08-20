import { describe, it, expect } from 'vitest';
import { getSystemStatus, formatSystemStatus, getCliVersion } from '../src/commands/status.js';
import { handleStartupCommand } from '../src/commands/startup.js';

describe('CLI status & startup commands', () => {
  it('should return a valid CLI version string', () => {
    const version = getCliVersion();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });

  it('should generate a comprehensive system status report', async () => {
    const status = await getSystemStatus();
    expect(status.version).toBeDefined();
    expect(status.server).toBeDefined();
    expect(typeof status.server.running).toBe('boolean');
    expect(status.devices).toBeDefined();
    expect(typeof status.devices.count).toBe('number');
    expect(Array.isArray(status.devices.list)).toBe(true);

    const formatted = formatSystemStatus(status);
    expect(formatted).toContain('SUPERAGENT SYSTEM STATUS');
    expect(formatted).toContain('CLI Version:');
    expect(formatted).toContain('Web Server (--serve):');
    expect(formatted).toContain('Connected Devices:');
  });

  it('should handle startup status check', async () => {
    const result = await handleStartupCommand(['status']);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Startup Configuration');
  });
});
