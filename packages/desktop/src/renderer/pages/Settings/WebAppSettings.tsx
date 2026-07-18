import React, { useState, useEffect } from 'react';
import { Globe, Play, Square, KeyRound, CheckCircle2, AlertTriangle, ExternalLink, RotateCw } from 'lucide-react';
import { BrandLogo } from '../../BrandLogo';

/** Status payload returned by the main-process `web-status` IPC. */
interface WebStatus {
  running: boolean;
  port: number;
  url: string;
  lanUrl: string;
}

/** Result of a password-change attempt. */
interface PasswordResult {
  ok: boolean;
  error?: string;
}

/**
 * Settings → Web App.
 *
 * Lets the user host the SuperAgent web server straight from the Desktop app
 * (Start / Stop), configure its port + auto-start, and change the Web App admin
 * password. The server itself is launched as a child process by the main process
 * (the same `@superagent/web` host the CLI starts with `superagent --start-web`);
 * the password is shared with the web login via core's AuthStore.
 */
export const WebAppSettings: React.FC = () => {
  const ipc =
    typeof window !== 'undefined' && (window as any).require
      ? (window as any).require('electron').ipcRenderer
      : null;

  const [status, setStatus] = useState<WebStatus | null>(null);
  const [port, setPort] = useState<number>(3000);
  const [autoStart, setAutoStart] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwResult, setPwResult] = useState<PasswordResult | null>(null);

  const refreshStatus = async () => {
    if (!ipc) return;
    try {
      const s = await ipc.invoke('web-status');
      setStatus(s);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refreshStatus();
    if (!ipc) return;
    ipc
      .invoke('settings-read')
      .then((settings: any) => {
        if (settings?.webApp) {
          if (settings.webApp.port) setPort(settings.webApp.port);
          setAutoStart(Boolean(settings.webApp.autoStart));
        }
      })
      .catch(() => {
        /* ignore */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doStart = async () => {
    if (!ipc) return;
    setBusy(true);
    try {
      await ipc.invoke('web-start', { port: Number(port) || 3000 });
    } finally {
      setBusy(false);
      await refreshStatus();
    }
  };

  const doStop = async () => {
    if (!ipc) return;
    setBusy(true);
    try {
      await ipc.invoke('web-stop');
    } finally {
      setBusy(false);
      await refreshStatus();
    }
  };

  const toggleAutoStart = async (val: boolean) => {
    setAutoStart(val);
    if (!ipc) return;
    try {
      const settings = await ipc.invoke('settings-read');
      await ipc.invoke('settings-write', {
        ...settings,
        webApp: { ...settings?.webApp, autoStart: val, port: Number(port) || 3000 }
      });
    } catch {
      /* ignore */
    }
  };

  const changePort = async (value: number) => {
    setPort(value);
    if (!ipc) return;
    try {
      const settings = await ipc.invoke('settings-read');
      await ipc.invoke('settings-write', {
        ...settings,
        webApp: { ...settings?.webApp, autoStart, port: value }
      });
    } catch {
      /* ignore */
    }
  };

  const doChangePassword = async () => {
    setPwResult(null);
    if (next !== confirm) {
      setPwResult({ ok: false, error: 'New passwords do not match.' });
      return;
    }
    if (!ipc) {
      setPwResult({ ok: false, error: 'Settings unavailable outside the desktop app.' });
      return;
    }
    try {
      const res = await ipc.invoke('web-change-password', { current, next });
      if (res?.ok) {
        setPwResult({ ok: true });
        setCurrent('');
        setNext('');
        setConfirm('');
      } else {
        setPwResult({ ok: false, error: res?.error || 'Failed to change password.' });
      }
    } catch (err: any) {
      setPwResult({ ok: false, error: err?.message || 'Failed to change password.' });
    }
  };

  const openUrl = (url: string) => {
    if (ipc) {
      ipc.invoke('open-external', url).catch(() => {});
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  };

  return (
    <div className="max-w-[680px] text-left">
      {/* Atmosphere hero */}
      <div className="relative mb-7 overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(120% 90% at 82% -10%, var(--brand-atmo-glow), transparent 55%)' }}
          />
        </div>
        <div className="relative flex items-center gap-4 px-6 py-6">
          <div className="animate-float shrink-0">
            <BrandLogo size={48} />
          </div>
          <div>
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">Web App</h1>
            <p className="mt-1 text-sm leading-6 text-brand-textMuted">
              Host SuperAgent in your browser. Other devices on your network can open it too — great for
              sharing your agent from a phone or tablet.
            </p>
          </div>
        </div>
      </div>

      {/* Host controls */}
      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Hosting</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  status?.running
                    ? 'bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)]'
                    : 'bg-brand-bg text-brand-textMuted'
                }`}
              >
                <Globe size={18} />
              </span>
              <div>
                <div className="text-sm font-medium text-brand-textMain">
                  {status?.running ? 'Web App is running' : 'Web App is stopped'}
                </div>
                <div className="text-xs leading-5 text-brand-textMuted">
                  {status?.running ? (
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 text-[var(--brand-accent)] hover:underline"
                      onClick={() => openUrl(status.url)}
                    >
                      {status.url} <ExternalLink size={12} />
                    </button>
                  ) : (
                    'Start the server to open SuperAgent in a browser.'
                  )}
                </div>
              </div>
            </div>

            {status?.running ? (
              <button type="button" disabled={busy} onClick={doStop} className="ui-btn">
                <Square size={15} /> Stop
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={doStart} className="ui-btn ui-btn-primary">
                <Play size={15} /> Start
              </button>
            )}
          </div>

          {status?.running && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs text-brand-textMuted">
              <span className="font-medium text-brand-textMain">LAN:</span>
              <code className="text-brand-textMain">{status.lanUrl}</code>
              <span>— reachable from other devices on your network.</span>
            </div>
          )}
        </div>

        {/* Port + auto-start */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-brand-border bg-brand-card p-4">
            <label className="mb-2 block text-sm font-medium text-brand-textMain">Port</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={port}
              disabled={status?.running}
              onChange={(e) => changePort(Number(e.target.value) || 3000)}
              className="ui-input w-full"
            />
            <p className="mt-1 text-xs text-brand-textMuted">
              {status?.running ? 'Stop the server to change the port.' : 'Applied the next time you start.'}
            </p>
          </div>

          <div className="rounded-lg border border-brand-border bg-brand-card p-4">
            <label className="mb-2 block text-sm font-medium text-brand-textMain">Auto-start</label>
            <button
              type="button"
              role="switch"
              aria-checked={autoStart}
              onClick={() => toggleAutoStart(!autoStart)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoStart ? 'bg-[color:var(--neon-constructive)]' : 'bg-brand-bg border border-brand-border'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoStart ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <p className="mt-1 text-xs text-brand-textMuted">Launch the Web App automatically when SuperAgent starts.</p>
          </div>
        </div>
      </section>

      {/* Password */}
      <section className="mb-8">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-brand-textMain">
          <KeyRound size={16} /> Change Web App Password
        </h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <p className="mb-4 text-sm text-brand-textMuted">
            This is the password used to log in to the hosted Web App (and the same admin account the Desktop
            app shares). The default is <code className="rounded bg-brand-bg px-1 py-0.5">admin</code>.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-brand-textMuted">Current password</label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="ui-input w-full"
                placeholder="admin"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-textMuted">New password</label>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="ui-input w-full"
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-textMuted">Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="ui-input w-full"
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
          </div>

          {pwResult && (
            <div
              className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                pwResult.ok
                  ? 'border-[color:var(--neon-constructive)]/40 bg-[color:var(--neon-constructive)]/10 text-[color:var(--neon-constructive)]'
                  : 'border-[color:var(--neon-destructive)]/40 bg-[color:var(--neon-destructive)]/10 text-[color:var(--neon-destructive)]'
              }`}
            >
              {pwResult.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {pwResult.ok ? 'Password updated.' : pwResult.error}
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              disabled={!next || next !== confirm}
              onClick={doChangePassword}
              className="ui-btn ui-btn-primary"
            >
              <RotateCw size={15} /> Update Password
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default WebAppSettings;
