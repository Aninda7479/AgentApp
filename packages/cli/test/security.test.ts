import { describe, it, expect } from 'vitest';
import { SecurityScanner, registerSecurityReviewCommand, SlashCommandRouter, ReviewFile } from '../src/index.js';

describe('SecurityScanner (/security-review)', () => {
  it('detects command injection, SQL injection, and eval', () => {
    const src = [
      'const out = exec(`ls ${userInput}`);', // command injection
      'db.query("SELECT * FROM u WHERE id=" + id);', // SQL injection
      'eval(payload);' // eval
    ].join('\n');
    const report = SecurityScanner.scan([{ path: 'app.ts', content: src }]);
    const titles = report.findings.map((f) => f.family);
    expect(titles).toContain('injection');
    expect(report.summary.critical).toBeGreaterThanOrEqual(1); // eval + exec => 2 critical
    expect(report.findings.some((f) => f.cwe === 'CWE-78')).toBe(true);
    expect(report.findings.some((f) => f.cwe === 'CWE-89')).toBe(true);
  });

  it('detects XSS via innerHTML and dangerouslySetInnerHTML', () => {
    const src = [
      'el.innerHTML = userContent;',
      'return <div dangerouslySetInnerHTML={{ __html: data }} />;'
    ].join('\n');
    const report = SecurityScanner.scan([{ path: 'ui.tsx', content: src }]);
    expect(report.findings.some((f) => f.family === 'xss' && f.cwe === 'CWE-79')).toBe(true);
  });

  it('flags weak crypto, TLS disable, and insecure CORS', () => {
    const src = [
      "const h = crypto.createHash('md5').update(x);",
      'httpsAgent = new https.Agent({ rejectUnauthorized: false });',
      "res.setHeader('Access-Control-Allow-Origin', '*');"
    ].join('\n');
    const report = SecurityScanner.scan([{ path: 'cfg.ts', content: src }]);
    const fams = report.findings.map((f) => `${f.family}:${f.cwe}`);
    expect(fams).toContain('crypto:CWE-327');
    expect(fams).toContain('insecure-data:CWE-295');
    expect(fams).toContain('insecure-data:CWE-942');
  });

  it('does not flag placeholder secrets', () => {
    const src = "const apiKey = process.env.API_KEY; const t = 'your-token-here';";
    const report = SecurityScanner.scan([{ path: 'cfg.ts', content: src }]);
    expect(report.findings.filter((f) => f.family === 'auth').some((f) => f.cwe === 'CWE-798')).toBe(false);
  });

  it('flags hardcoded real-looking secrets', () => {
    const src = "const apiKey = 'sk_live_1A2b3C4d5E6f7G8h';";
    const report = SecurityScanner.scan([{ path: 'cfg.ts', content: src }]);
    expect(report.findings.some((f) => f.cwe === 'CWE-798' && f.severity === 'critical')).toBe(true);
  });

  it('scans package.json for unpinned/risky dependencies', () => {
    const pkg = JSON.stringify({ dependencies: { request: '*', lodash: '^4.17.0' } });
    const report = SecurityScanner.scan([{ path: 'package.json', content: pkg }]);
    expect(report.findings.some((f) => f.family === 'dependencies' && f.title.includes('request'))).toBe(true);
    expect(report.findings.some((f) => f.family === 'dependencies' && f.title.includes('Unpinned'))).toBe(true);
  });

  it('formats a concise report and orders by severity', () => {
    const report = SecurityScanner.scan([{ path: 'a.ts', content: 'eval(x);' }]);
    const text = SecurityScanner.formatReport(report);
    expect(text).toContain('=== SuperAgent Security Review ===');
    expect(text).toContain('[CRITICAL]');
    expect(text).toContain('CWE-94');
  });

  it('exposes /security-review through the router', async () => {
    const router = new SlashCommandRouter();
    registerSecurityReviewCommand(router);
    const res = await router.execute('/security-review /no/such/file.ts');
    expect(res.success).toBe(true);
    expect(res.output).toContain('No changed files to scan');
  });
});
