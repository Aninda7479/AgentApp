export type CommandRiskLevel = 'safe' | 'potentially_dangerous' | 'blocked';

export interface CommandCheckResult {
  allowed: boolean;
  riskLevel: CommandRiskLevel;
  reason?: string;
}

export class TerminalAccessControl {
  private blockedPatterns: RegExp[] = [
    /\brm\s+-[rRfF]*\s+[\/\*]/i,
    /\b(mkfs|format|fdisk|parted)\b/i,
    /\bshutdown\b|\breboot\b|\binit\s+0\b/i,
    />\s*\/dev\/sd[a-z]/i,
    /:\(\)\{\s*:\|:&\s*\};:/i
  ];

  private potentiallyDangerousPatterns: RegExp[] = [
    /\brm\b/i,
    /\bdel\b|\brmdir\b/i,
    /\bchmod\b|\bchown\b/i,
    /\bkill\b|\bpkill\b/i,
    />\s*[^>]/
  ];

  private whitelist: Set<string> = new Set();

  public addWhitelistedCommand(command: string): void {
    this.whitelist.add(command.trim());
  }

  public inspectCommand(command: string): CommandCheckResult {
    const trimmed = command.trim();

    if (this.whitelist.has(trimmed)) {
      return { allowed: true, riskLevel: 'safe' };
    }

    for (const pattern of this.blockedPatterns) {
      if (pattern.test(trimmed)) {
        return {
          allowed: false,
          riskLevel: 'blocked',
          reason: 'Command matches blocked dangerous system operations pattern.'
        };
      }
    }

    for (const pattern of this.potentiallyDangerousPatterns) {
      if (pattern.test(trimmed)) {
        return {
          allowed: true,
          riskLevel: 'potentially_dangerous',
          reason: 'Command performs file deletion or system modification.'
        };
      }
    }

    return { allowed: true, riskLevel: 'safe' };
  }
}
