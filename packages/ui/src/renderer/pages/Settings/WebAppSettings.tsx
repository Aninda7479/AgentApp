import React, { useState, useEffect } from 'react';
import { Globe, Play, Square, KeyRound, CheckCircle2, AlertTriangle, ExternalLink, RotateCw, Copy, Check, ShieldCheck, User, Smartphone, Laptop, Clock } from 'lucide-react';
import { BrandLogo } from '../../BrandLogo';
import { getIpc } from '../../lib/ipc';

/** Status payload returned by the main-process `web-status` IPC. */
interface WebStatus {
  running: boolean;
  port: number;
  url: string;
  lanUrl: string;
  /** Which surface started the running server (null when stopped). */
  startedBy?: 'cli' | 'desktop' | 'standalone' | null;
}

/** Result of a password-change attempt. */
interface PasswordResult {
  ok: boolean;
  error?: string;
}

/**
 * Settings → Web App.
 *
 * Host the SuperAgent web server straight from the Desktop app (Start / Stop),
 * configure its port + auto-start, and manage the Web App admin owner & password.
 */
export const WebAppSettings: React.FC = () => {
  const ipc = getIpc();

  const [status, setStatus] = useState<WebStatus | null>(null);
  const [port, setPort] = useState<number>(1469);
  const [autoStart, setAutoStart] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<'local' | 'lan' | null>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwResult, setPwResult] = useState<PasswordResult | null>(null);

  const [ownerName, setOwnerName] = useState<string>('');
  const [saveResult, setSaveResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const refreshStatus = async () => {
    if (!ipc) return;
    try {
      const s = await ipc.invoke('web-status');
      setStatus(s);
      if (s?.port) {
        setPort(s.port);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 3000);

    if (!ipc) return () => clearInterval(interval);
    ipc
      .invoke('settings-read')
      .then((settings: any) => {
        if (settings?.webApp) {
          if (settings.webApp.port) setPort(settings.webApp.port);
          setAutoStart(Boolean(settings.webApp.autoStart));
        }
        if (settings?.general?.ownerName) {
          setOwnerName(settings.general.ownerName);
        }
      })
      .catch(() => {
        /* ignore */
      });

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveOwnerName = async () => {
    setSaveResult(null);
    if (!ipc) {
      setSaveResult({ ok: false, error: 'Settings unavailable outside the desktop app.' });
      return;
    }
    try {
      await ipc.invoke('settings-write', {
        general: {
          ownerName: ownerName.trim()
        }
      });
      setSaveResult({ ok: true });
    } catch (err: any) {
      setSaveResult({ ok: false, error: err?.message || 'Failed to save owner name.' });
    }
  };

  const doStart = async () => {
    if (!ipc) return;
    setBusy(true);
    try {
      await ipc.invoke('web-start', { port: Number(port) || 1469 });
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
        webApp: { ...settings?.webApp, autoStart: val, port: Number(port) || 1469 }
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

  const copyUrl = (text: string, type: 'local' | 'lan') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedUrl(type);
      setTimeout(() => setCopiedUrl(null), 2000);
    });
  };

  return (
    <div className="max-w-[680px] text-left">
      {/* Atmosphere hero */}
      <div className="relative mb-7 overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-xl">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(120% 90% at 82% -10%, var(--brand-atmo-glow), transparent 55%)' }}
          />
        </div>
        <div className="relative flex items-center gap-4 px-6 py-6">
          <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-brand-popover border border-brand-border shadow-inner">
            <BrandLogo size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">Web App & Remote Host</h1>
              <span className="rounded-full bg-[var(--brand-accent)]/15 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--brand-accent)] border border-[var(--brand-accent)]/30">
                Port {port}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-brand-textMuted">
              Host SuperAgent directly from your computer. Connect from your phone, tablet, or secondary devices on your local network.
            </p>
          </div>
        </div>
      </div>

      {/* Host controls */}
      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Server Status</h3>
        <div className="rounded-xl border border-brand-border bg-brand-card p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                  status?.running
                    ? 'bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] border border-[color:var(--neon-constructive)]/30'
                    : 'bg-brand-bg text-brand-textMuted border border-brand-border'
                }`}
              >
                <Globe size={20} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-textMain">
                    {status?.running ? 'Web App is running' : 'Web App is stopped'}
                  </span>
                  {status?.running && status.startedBy && (
                    <span className="rounded-full bg-brand-bg px-2 py-0.5 text-[10px] font-medium text-brand-textMuted border border-brand-border/60">
                      started from {status.startedBy}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-brand-textMuted">
                  {status?.running ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-1 font-mono text-[var(--brand-accent)] hover:underline font-medium"
                        onClick={() => openUrl(status.url || `http://localhost:${port}`)}
                      >
                        {status.url || `http://localhost:${port}`} <ExternalLink size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => copyUrl(status.url || `http://localhost:${port}`, 'local')}
                        className="p-1 rounded text-brand-textMuted hover:text-brand-textMain hover:bg-brand-popover transition-all cursor-pointer"
                        title="Copy Local URL"
                      >
                        {copiedUrl === 'local' ? <Check size={12} className="text-[color:var(--neon-constructive)]" /> : <Copy size={12} />}
                      </button>
                    </div>
                  ) : (
                    'Start the web server to open SuperAgent in any browser.'
                  )}
                </div>
              </div>
            </div>

            {status?.running ? (
              <button
                type="button"
                disabled={busy}
                onClick={doStop}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30 transition-all cursor-pointer flex items-center gap-2"
              >
                <Square size={14} /> Stop Server
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={doStart}
                className="ui-btn ui-btn-primary px-4 py-2 text-xs font-semibold flex items-center gap-2"
              >
                <Play size={14} /> Start Server
              </button>
            )}
          </div>

          {status?.running && status.lanUrl && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-border/60 bg-brand-bg/80 px-4 py-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-brand-textMain shrink-0">LAN Address:</span>
                <code className="font-mono text-brand-textMain truncate">{status.lanUrl}</code>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyUrl(status.lanUrl, 'lan')}
                  className="px-2.5 py-1 rounded-lg bg-brand-popover text-brand-textMain border border-brand-border hover:bg-brand-card transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-medium"
                >
                  {copiedUrl === 'lan' ? (
                    <>
                      <Check size={12} className="text-[color:var(--neon-constructive)]" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={12} /> Copy LAN Link
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Port + auto-start */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-brand-border bg-brand-card p-4">
            <label className="mb-1.5 block text-sm font-medium text-brand-textMain">Server Port</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={port}
              disabled={status?.running}
              onChange={(e) => changePort(Number(e.target.value) || 1469)}
              className="ui-input w-full font-mono text-sm"
            />
            <p className="mt-1.5 text-xs text-brand-textMuted leading-normal">
              {status?.running ? 'Stop the server to change the port.' : 'Applied the next time you start the server.'}
            </p>
          </div>

          <div className="rounded-xl border border-brand-border bg-brand-card p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-brand-textMain">Auto-start Server</label>
              <button
                type="button"
                role="switch"
                aria-checked={autoStart}
                onClick={() => toggleAutoStart(!autoStart)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  autoStart ? 'bg-[color:var(--neon-constructive)]' : 'bg-brand-bg border border-brand-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autoStart ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-brand-textMuted leading-normal">
              Automatically launch the Web App host when SuperAgent starts up.
            </p>
          </div>
        </div>
      </section>

      {/* Host Owner Name */}
      <section className="mb-8">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-brand-textMain">
          <User size={16} /> Host Ownership & Branding
        </h3>
        <div className="rounded-xl border border-brand-border bg-brand-card p-5 space-y-4">
          <p className="text-xs leading-relaxed text-brand-textMuted">
            Set the host owner's name shown on the login screen to indicate that this host is private.
          </p>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-brand-textMuted">Host Owner Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="ui-input flex-1"
                placeholder="e.g. John Doe"
              />
              <button
                type="button"
                onClick={saveOwnerName}
                className="ui-btn ui-btn-primary px-4 py-2 cursor-pointer font-medium text-xs"
              >
                Save Name
              </button>
            </div>
            {saveResult && (
              <div
                className={`mt-2.5 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                  saveResult.ok
                    ? 'border-[color:var(--neon-constructive)]/40 bg-[color:var(--neon-constructive)]/10 text-[color:var(--neon-constructive)]'
                    : 'border-[color:var(--neon-destructive)]/40 bg-[color:var(--neon-destructive)]/10 text-[color:var(--neon-destructive)]'
                }`}
              >
                {saveResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {saveResult.ok ? 'Host owner name saved successfully.' : saveResult.error}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Password */}
      <section className="mb-8">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-brand-textMain">
          <KeyRound size={16} /> Web App Authentication
        </h3>
        <div className="rounded-xl border border-brand-border bg-brand-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-brand-border/40">
            <div>
              <div className="text-xs font-semibold text-brand-textMain">Access Password</div>
              <p className="text-[11px] text-brand-textMuted mt-0.5">
                Protects remote web browser logins. Default admin password is <code className="rounded bg-brand-bg px-1.5 py-0.5 font-mono text-brand-textMain">admin</code>.
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[color:var(--neon-constructive)]/10 border border-[color:var(--neon-constructive)]/20 text-[color:var(--neon-constructive)] text-[11px] font-medium shrink-0">
              <ShieldCheck size={13} /> Active
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-brand-textMuted">Current Password</label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="ui-input w-full font-mono text-xs"
                placeholder="admin"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-textMuted">New Password</label>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="ui-input w-full font-mono text-xs"
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-textMuted">Confirm New Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="ui-input w-full font-mono text-xs"
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
          </div>

          {pwResult && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                pwResult.ok
                  ? 'border-[color:var(--neon-constructive)]/40 bg-[color:var(--neon-constructive)]/10 text-[color:var(--neon-constructive)]'
                  : 'border-[color:var(--neon-destructive)]/40 bg-[color:var(--neon-destructive)]/10 text-[color:var(--neon-destructive)]'
              }`}
            >
              {pwResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {pwResult.ok ? 'Web app password updated successfully.' : pwResult.error}
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              disabled={!next || next !== confirm}
              onClick={doChangePassword}
              className="ui-btn ui-btn-primary flex items-center gap-2 text-xs font-semibold px-4 py-2 cursor-pointer disabled:opacity-50"
            >
              <RotateCw size={14} /> Update Admin Password
            </button>
          </div>
        </div>
      </section>

      {/* Logged in Accounts & Active Devices */}
      <section className="mb-8">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-brand-textMain">
          <Globe size={16} /> Logged in Accounts &amp; Active Devices
        </h3>
        <div className="rounded-xl border border-brand-border bg-brand-card p-5 space-y-4">
          <DeviceAndHistoryManager />
        </div>
      </section>
    </div>
  );
};

/** Sub-component for managing active sessions and inspecting login history. */
interface ParsedUA {
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
}

function parseUserAgent(ua?: string): ParsedUA {
  if (!ua || ua === 'Unknown' || ua === 'Web Browser') {
    return { browser: 'Web Browser', os: 'Desktop', deviceType: 'desktop' };
  }

  // OS detection
  let os = 'Unknown OS';
  let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';

  if (/Windows NT 10\.0|Windows NT 11\.0|Windows 10|Windows 11/i.test(ua)) os = 'Windows';
  else if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone/i.test(ua)) {
    os = 'iOS';
    deviceType = 'mobile';
  } else if (/iPad/i.test(ua)) {
    os = 'iPadOS';
    deviceType = 'tablet';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    deviceType = /Mobile/i.test(ua) ? 'mobile' : 'tablet';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  // Browser detection
  let browser = 'Web Browser';
  if (/SuperAgent/i.test(ua)) browser = 'SuperAgent App';
  else if (/Edg\//i.test(ua) || /Edge\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Brave/i.test(ua)) browser = 'Brave';
  else if (/Arc\//i.test(ua)) browser = 'Arc';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) browser = 'Google Chrome';
  else if (/Firefox\//i.test(ua) || /FxiOS\//i.test(ua)) browser = 'Mozilla Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/Electron|Code\//i.test(ua)) browser = 'Desktop Client';

  return { browser, os, deviceType };
}

function getTimeMs(timeVal: any): number {
  if (!timeVal) return 0;
  const num = Number(timeVal);
  if (!isNaN(num) && num > 1000000000) return num;
  const d = new Date(timeVal).getTime();
  return isNaN(d) ? 0 : d;
}

function formatRelativeTime(timeVal: any): string {
  const ms = getTimeMs(timeVal);
  if (!ms) return 'Unknown';

  const diffMs = Date.now() - ms;
  if (diffMs < 60_000) {
    return 'Active just now';
  }
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFullDateTime(timeVal: any): string {
  const ms = getTimeMs(timeVal);
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Sub-component for managing active sessions and inspecting login history. */
function DeviceAndHistoryManager(): React.ReactElement {
  const [sessions, setSessions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAuthData = async () => {
    setLoading(true);
    try {
      const resDev = await fetch('/api/auth/devices', { credentials: 'same-origin' });
      if (resDev.ok) {
        const data = await resDev.json();
        const list = Array.isArray(data) ? data : (data?.sessions || []);
        setSessions(list);
      }
      const resHist = await fetch('/api/auth/history', { credentials: 'same-origin' });
      if (resHist.ok) {
        const data = await resHist.json();
        const list = Array.isArray(data) ? data : (data?.history || []);
        setHistory(list);
      }
    } catch {
      /* ignore fetch failures if offline or outside web surface */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuthData();
  }, []);

  const removeDevice = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/auth/devices/${sessionId}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      if (res.ok) {
        await loadAuthData();
      }
    } catch {
      /* ignore */
    }
  };

  // Sort sessions chronologically (most recent first, current device pinned to top)
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    const timeA = getTimeMs(a.lastSeenAt || a.last_used || a.issuedAt || a.created_at);
    const timeB = getTimeMs(b.lastSeenAt || b.last_used || b.issuedAt || b.created_at);
    return timeB - timeA;
  });

  // Sort history chronologically (newest login attempt first)
  const sortedHistory = [...history].sort((a, b) => {
    const timeA = getTimeMs(a.timestamp || a.issuedAt);
    const timeB = getTimeMs(b.timestamp || b.issuedAt);
    return timeB - timeA;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Active Sessions */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-brand-textMain">Active Sessions ({sessions.length})</span>
          <button
            type="button"
            onClick={loadAuthData}
            disabled={loading}
            className="text-[11px] text-[var(--brand-accent)] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RotateCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {sortedSessions.length === 0 ? (
          <p className="text-xs text-brand-textMuted italic">No active session records found or running standalone.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sortedSessions.map((s) => {
              const sid = s.id || s.token;
              const uaInfo = parseUserAgent(s.userAgent || s.user_agent);
              const lastActiveMs = getTimeMs(s.lastSeenAt || s.last_used || s.issuedAt || s.created_at);
              const isRecent = Date.now() - lastActiveMs < 120_000; // < 2 mins
              const DeviceIcon = uaInfo.deviceType === 'mobile' ? Smartphone : Laptop;

              return (
                <div
                  key={sid}
                  className={`flex items-center justify-between border rounded-xl p-3.5 text-xs transition-all ${
                    s.isCurrent
                      ? 'bg-brand-bg/60 border-[var(--brand-accent)]/30 shadow-sm'
                      : 'bg-brand-bg/40 border-brand-border/60 hover:border-brand-border'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-brand-popover border border-brand-border text-brand-textMuted shadow-inner">
                      <DeviceIcon size={19} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-brand-textMain text-sm truncate">{uaInfo.browser}</span>
                        <span className="rounded-md bg-brand-popover px-2 py-0.5 text-[10px] font-medium text-brand-textMuted border border-brand-border/60">
                          {uaInfo.os}
                        </span>
                        {s.isCurrent && (
                          <span className="rounded-full bg-[var(--brand-accent)]/15 border border-[var(--brand-accent)]/30 text-[var(--brand-accent)] px-2 py-0.5 text-[9px] font-bold tracking-wide">
                            THIS DEVICE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-brand-textMuted font-mono mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 font-sans">
                          <span className={`w-2 h-2 rounded-full ${s.isCurrent || isRecent ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                          <span className={s.isCurrent || isRecent ? 'text-emerald-400 font-medium' : 'text-brand-textMuted'}>
                            {s.isCurrent ? 'Online now' : `Last online: ${formatRelativeTime(s.lastSeenAt || s.last_used || s.issuedAt || s.created_at)}`}
                          </span>
                        </span>
                        <span>•</span>
                        <span>IP: {s.ip || '127.0.0.1'}</span>
                        <span>•</span>
                        <span title={formatFullDateTime(s.issuedAt || s.created_at)}>
                          Signed in: {formatFullDateTime(s.issuedAt || s.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <button
                      type="button"
                      onClick={() => removeDevice(sid)}
                      className="ml-3 shrink-0 px-3 py-1.5 text-[11px] font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Login History */}
      <div className="flex flex-col gap-2.5 pt-4 border-t border-brand-border/40">
        <span className="text-xs font-semibold text-brand-textMain">Login History Audit Log ({sortedHistory.length})</span>
        {sortedHistory.length === 0 ? (
          <p className="text-xs text-brand-textMuted italic">No recent login attempts logged.</p>
        ) : (
          <div className="max-h-[220px] overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-1">
            {sortedHistory.map((h, i) => {
              const uaInfo = parseUserAgent(h.userAgent);
              const isSuccess = h.status === 'success';

              return (
                <div
                  key={h.id || i}
                  className="flex items-center justify-between bg-brand-bg/30 border border-brand-border/40 rounded-xl px-3.5 py-2.5 text-xs transition-colors hover:bg-brand-bg/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSuccess ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-brand-textMain text-xs truncate">
                          {uaInfo.browser}
                        </span>
                        <span className="rounded bg-brand-popover px-1.5 py-0.2 text-[10px] text-brand-textMuted border border-brand-border/60">
                          {uaInfo.os}
                        </span>
                        <span className="text-[10px] font-mono text-brand-textMuted">({h.ip || '127.0.0.1'})</span>
                      </div>
                      {h.reason && <span className="text-[10px] text-red-400 font-mono mt-0.5">{h.reason}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-3 text-right font-mono">
                    <span className="text-[11px] font-medium text-brand-textMain">
                      {formatRelativeTime(h.timestamp)}
                    </span>
                    <span className="text-[10px] text-brand-textMuted mt-0.5">
                      {formatFullDateTime(h.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default WebAppSettings;
