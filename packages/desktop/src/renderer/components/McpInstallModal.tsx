import React, { useState } from 'react';
import { Button, Input } from './ui';
import { KeyRound, ExternalLink, Terminal, Globe, Sparkles, X, Plug, Boxes } from 'lucide-react';
import type { CatalogEntry } from './MCPDashboard';

const LOGO_ORG: Record<string, string> = {
  filesystem: 'modelcontextprotocol',
  memory: 'modelcontextprotocol',
  'sequential-thinking': 'modelcontextprotocol',
  fetch: 'modelcontextprotocol',
  github: 'github',
  'brave-search': 'brave',
  puppeteer: 'puppeteer',
  'google-drive': 'google',
  slack: 'slackhq',
  postgres: 'postgres',
  sqlite: 'sqlite',
  git: 'git',
  notion: 'makenotion'
};

/** Renders a server's real brand logo with an emoji fallback tile. */
const ServerLogo: React.FC<{ id?: string; icon?: string; size?: number }> = ({ id, icon, size = 40 }) => {
  const [error, setError] = useState(false);
  const org = id ? LOGO_ORG[id] : undefined;

  if (error || !org) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex flex-shrink-0 items-center justify-center rounded-xl bg-brand-bg text-xl"
      >
        {icon || '🔌'}
      </div>
    );
  }

  return (
    <img
      src={`https://github.com/${org}.png?size=80`}
      alt=""
      onError={() => setError(true)}
      style={{ width: size, height: size }}
      className="flex-shrink-0 rounded-xl bg-brand-bg object-cover"
    />
  );
};

/** Built-in capabilities a server typically supercharges. */
const CAPABILITY_HINTS: Record<string, string[]> = {
  filesystem: ['Document', 'PDF', 'Spreadsheets'],
  memory: ['Document', 'Presentations'],
  'sequential-thinking': ['Presentations', 'Visualize'],
  fetch: ['Browser Use', 'Visualize'],
  github: ['Computer Use', 'Browser Use'],
  'brave-search': ['Browser Use', 'Visualize'],
  puppeteer: ['Browser Use'],
  'google-drive': ['Document', 'PDF', 'Spreadsheets', 'Presentations'],
  slack: ['Document', 'Presentations'],
  postgres: ['Spreadsheets', 'Visualize'],
  sqlite: ['Spreadsheets', 'Visualize'],
  git: ['Computer Use', 'Browser Use'],
  notion: ['Document', 'Presentations']
};

/** Sample skill-style tasks the connected server enables (industry framing). */
const SKILL_HINTS: Record<string, string[]> = {
  filesystem: ['index-repo', 'read-file', 'organize-files'],
  memory: ['remember-context', 'recall-notes'],
  'sequential-thinking': ['plan-steps', 'reason-carefully'],
  fetch: ['summarize-webpage', 'extract-article'],
  github: ['create-pr', 'triage-issues', 'review-diff'],
  'brave-search': ['web-search', 'research-topic'],
  puppeteer: ['scrape-page', 'click-through-flow'],
  'google-drive': ['list-docs', 'export-pdf'],
  slack: ['post-update', 'search-messages'],
  postgres: ['query-db', 'inspect-schema'],
  sqlite: ['query-db', 'inspect-schema'],
  git: ['commit-changes', 'diff-branch'],
  notion: ['read-page', 'publish-doc']
};

/** Props for the MCP install/configure modal. */
export interface McpInstallModalProps {
  isOpen: boolean;
  entry?: CatalogEntry | null;
  onClose: () => void;
  onInstall: (entry: CatalogEntry, keys: Record<string, string>) => void;
}

/**
 * Modal that collects any required keys for a catalog MCP server and explains,
 * in industry terms, how the server connects (stdio/SSE), how its tools are
 * namespaced and permission-gated, and which built-in skills/capabilities it
 * unlocks for the agent.
 */
export const McpInstallModal: React.FC<McpInstallModalProps> = ({ isOpen, entry, onClose, onInstall }) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState(false);

  if (!isOpen || !entry) return null;

  const requiredKeys = entry.envKeys.filter((k) => k.required);
  const hasRequired = requiredKeys.length > 0;
  const missingRequired = requiredKeys.some((k) => !values[k.key]?.trim());

  const capabilities = CAPABILITY_HINTS[entry.id] || [];
  const skills = SKILL_HINTS[entry.id] || [];

  const TransportIcon = entry.transport === 'stdio' ? Terminal : Globe;

  const handleInstall = async () => {
    if (missingRequired) return;
    setInstalling(true);
    try {
      await onInstall(entry, values);
      onClose();
    } finally {
      setInstalling(false);
      setValues({});
    }
  };

  return (
    <div
      data-testid="mcp-install-modal-overlay"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="mcp-install-modal-content"
        className="glass-panel flex max-h-[88vh] w-[560px] max-w-full flex-col overflow-hidden rounded-2xl border border-brand-border shadow-[0_24px_60px_rgba(0,0,0,0.8)] text-brand-textMain"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-brand-border/60 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <ServerLogo id={entry.id} icon={entry.icon} size={40} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold text-brand-textMain">{entry.name}</h2>
                <span className="flex items-center gap-1 rounded-md bg-brand-bg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-textMuted">
                  <TransportIcon size={10} /> {entry.transport}
                </span>
              </div>
              <p className="truncate text-[11px] text-brand-textMuted">{entry.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-brand-textMuted transition-colors hover:bg-brand-hover hover:text-brand-textMain"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* How MCP works (industry framing) */}
          <section className="rounded-xl border border-brand-border/50 bg-brand-bg/40 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-accent)]">
              <Plug size={12} /> How this works
            </div>
            <p className="text-[12px] leading-5 text-brand-textMuted">
              SuperAgent launches the server over <strong className="text-brand-textMain">{entry.transport.toUpperCase()}</strong> and
              discovers its tools at runtime. Each tool is registered namespaced as{' '}
              <code className="rounded bg-brand-bg px-1 py-0.5 font-mono text-[10px] text-[var(--brand-accent)]">
                {entry.id}_toolName
              </code>
              , invoked from chat via <code className="rounded bg-brand-bg px-1 py-0.5 font-mono text-[10px] text-[var(--brand-accent)]">/mcp {entry.name} …</code>,
              and run behind the permission guard.
            </p>
          </section>

          {/* Required keys */}
          {hasRequired && (
            <section className="space-y-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-textMain">
                <KeyRound size={12} className="text-[var(--brand-accent)]" /> Required keys
              </div>
              {entry.envKeys.map((envKey) => (
                <div key={envKey.key} className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-brand-textMain">
                    {envKey.label}
                    <code className="rounded bg-brand-bg px-1 py-0.5 font-mono text-[10px] text-brand-textMuted">
                      {envKey.key}
                    </code>
                    {envKey.required && <span className="text-red-400">*</span>}
                    {envKey.url && (
                      <a
                        href={envKey.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-[var(--brand-accent)] hover:underline"
                      >
                        <ExternalLink size={9} /> Get key
                      </a>
                    )}
                  </label>
                  <Input
                    type={envKey.secret ? 'password' : 'text'}
                    value={values[envKey.key] || ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [envKey.key]: e.target.value }))}
                    placeholder={envKey.description || envKey.label}
                  />
                </div>
              ))}
            </section>
          )}

          {/* Command preview */}
          <section>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-textMuted">Launch command</div>
            <div className="rounded-lg border border-brand-border/40 bg-brand-bg/80 p-2.5 font-mono text-[11px] leading-5 text-brand-textMuted">
              <span className="font-bold text-[var(--brand-accent)]">[{entry.transport.toUpperCase()}]</span>{' '}
              {entry.command} {entry.args.join(' ')}
            </div>
          </section>

          {/* Skills + capabilities it unlocks */}
          {(capabilities.length > 0 || skills.length > 0) && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-textMain">
                <Boxes size={12} className="text-[var(--brand-accent)]" /> Unlocks
              </div>
              {skills.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-[10px] text-brand-textMuted">
                    <Sparkles size={10} /> Skills
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <span key={s} className="rounded-md bg-brand-bg px-2 py-0.5 font-mono text-[10px] text-brand-textMuted">
                        /{s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {capabilities.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] text-brand-textMuted">Capabilities</div>
                  <div className="flex flex-wrap gap-1.5">
                    {capabilities.map((c) => (
                      <span
                        key={c}
                        className="rounded-full border border-[var(--brand-accent-border)] bg-[var(--brand-accent-tint)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-accent)]"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {entry.homepage && (
            <a
              href={entry.homepage}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-brand-textMuted hover:text-[var(--brand-accent)]"
            >
              <ExternalLink size={10} /> Read the documentation
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-brand-border/60 px-5 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-testid={`mcp-install-submit-${entry.id}`}
            variant="primary"
            size="sm"
            onClick={handleInstall}
            disabled={installing || missingRequired}
          >
            {installing ? 'Connecting…' : hasRequired ? 'Connect & Install' : 'Install'}
          </Button>
        </div>
      </div>
    </div>
  );
};
