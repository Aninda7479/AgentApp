export class EnvironmentSanitizer {
  private customSecrets: Set<string> = new Set();
  private defaultPatterns: RegExp[] = [
    // OpenAI API Key
    /sk-[a-zA-Z0-9_-]{20,}/g,
    // Anthropic API Key
    /sk-ant-[a-zA-Z0-9_-]{20,}/g,
    // Generic Bearer Token
    /Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi,
    // GitHub Token
    /gh[pousr]-[a-zA-Z0-9]{36,}/g,
    // AWS Access Key ID / Secret
    /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    // Generic API Key in assignment or string
    /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?([a-zA-Z0-9._~+/-]{8,})["']?/gi
  ];

  public registerSecret(secret: string): void {
    if (secret && secret.trim().length > 0) {
      this.customSecrets.add(secret);
    }
  }

  public sanitizeString(input: string): string {
    if (!input) return input;
    let sanitized = input;

    // Redact custom secrets first
    for (const secret of this.customSecrets) {
      if (secret.length > 0) {
        sanitized = sanitized.split(secret).join('[REDACTED]');
      }
    }

    // Redact regex patterns
    for (const pattern of this.defaultPatterns) {
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(pattern, (match, p1, p2) => {
        if (p1 && p2) {
          return `${p1}="[REDACTED]"`;
        }
        return '[REDACTED]';
      });
    }

    return sanitized;
  }

  public sanitizeEnv(env: Record<string, string | undefined>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveKeys = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'AUTH', 'CREDENTIAL'];

    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) continue;
      const isSensitiveKey = sensitiveKeys.some(s => key.toUpperCase().includes(s));
      if (isSensitiveKey) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitizeString(value);
      }
    }
    return sanitized;
  }
}
