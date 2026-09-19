import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  RefreshCw,
  Trash2,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Monitor,
  ExternalLink,
} from 'lucide-react';
import { BrandLogo } from '../../BrandLogo';
import { getIpc } from '../../lib/ipc';
import { isDesktop } from '../../lib/platform';
import type { ArtifactRuntimeState } from '../Artifacts/ArtifactsPage';

export const ArtifactSettings: React.FC = () => {
  const ipc = getIpc();

  const [defaultPortStart, setDefaultPortStart] = useState<number>(3080);
  const [autoStartOnLaunch, setAutoStartOnLaunch] = useState<boolean>(false);
  const [trayIconWhenStopped, setTrayIconWhenStopped] = useState<boolean>(true);
  const [trayNotificationBadge, setTrayNotificationBadge] = useState<boolean>(true);
  const [defaultVisibility, setDefaultVisibility] = useState<'floating' | 'tray' | 'background'>('floating');
  const [sandboxMode, setSandboxMode] = useState<boolean>(false);
  const [updateBehavior, setUpdateBehavior] = useState<'replace' | 'duplicate' | 'ask'>('replace');

  const [artifacts, setArtifacts] = useState<ArtifactRuntimeState[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchSettings = async () => {
    if (!ipc) return;
    try {
      const settings = (await ipc.invoke('settings-read')) as Record<string, unknown> | null;
      if (settings?.artifact && typeof settings.artifact === 'object') {
        const art = settings.artifact as Record<string, unknown>;
        if (art.defaultPortStart !== undefined) {
          setDefaultPortStart(Number(art.defaultPortStart));
        }
        if (art.autoStartOnLaunch !== undefined) {
          setAutoStartOnLaunch(Boolean(art.autoStartOnLaunch));
        }
        if (art.trayIconWhenStopped !== undefined) {
          setTrayIconWhenStopped(Boolean(art.trayIconWhenStopped));
        }
        if (art.trayNotificationBadge !== undefined) {
          setTrayNotificationBadge(Boolean(art.trayNotificationBadge));
        }
        if (art.defaultVisibility === 'floating' || art.defaultVisibility === 'tray' || art.defaultVisibility === 'background') {
          setDefaultVisibility(art.defaultVisibility);
        }
        if (art.sandboxMode !== undefined) {
          setSandboxMode(Boolean(art.sandboxMode));
        }
        if (art.updateBehavior === 'replace' || art.updateBehavior === 'duplicate' || art.updateBehavior === 'ask') {
          setUpdateBehavior(art.updateBehavior);
        }
      }
    } catch (err) {
      console.error('Failed to read settings', err);
    }
  };

  const fetchArtifacts = async () => {
    if (!ipc) return;
    setLoading(true);
    try {
      const list = await ipc.invoke<ArtifactRuntimeState[]>('artifact:list');
      setArtifacts(list || []);
    } catch (err) {
      console.error('Failed to fetch artifacts', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchArtifacts();
  }, []);

  const saveAllSettings = async (overrides: Record<string, unknown> = {}) => {
    if (!ipc) return;
    setSaveStatus(null);
    try {
      const currentSettings = ((await ipc.invoke('settings-read')) as Record<string, unknown>) || {};
      const currentArtifact = (currentSettings.artifact as Record<string, unknown>) || {};

      await ipc.invoke('settings-write', {
        ...currentSettings,
        artifact: {
          ...currentArtifact,
          defaultPortStart,
          autoStartOnLaunch,
          trayIconWhenStopped,
          trayNotificationBadge,
          defaultVisibility,
          sandboxMode,
          updateBehavior,
          ...overrides,
        },
      });
      setSaveStatus({ ok: true, message: 'Artifact settings saved successfully.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save settings.';
      setSaveStatus({ ok: false, message });
    }
  };

  const handleToggleAutoStart = (val: boolean) => {
    setAutoStartOnLaunch(val);
    saveAllSettings({ autoStartOnLaunch: val });
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      setDefaultPortStart(val);
    }
  };

  const handlePortSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveAllSettings({ defaultPortStart });
  };

  const handleOpenFolder = async () => {
    if (!ipc) return;
    try {
      await ipc.invoke('artifact:openFolder');
    } catch (err) {
      console.error('Failed to open folder', err);
    }
  };

  const handleDelete = async (artId: string, name: string) => {
    if (!ipc) return;
    if (!window.confirm(`Are you sure you want to delete the artifact "${name}"?`)) return;
    try {
      await ipc.invoke('artifact:delete', artId);
      await fetchArtifacts();
    } catch (err) {
      console.error('Failed to delete artifact', err);
    }
  };

  const handleClearAll = async () => {
    if (!ipc) return;
    if (!window.confirm('Are you sure you want to delete ALL installed artifacts? This cannot be undone.')) return;
    try {
      for (const art of artifacts) {
        await ipc.invoke('artifact:delete', art.id);
      }
      await fetchArtifacts();
    } catch (err) {
      console.error('Failed to clear artifacts', err);
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
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">Artifacts</h1>
            <p className="mt-1 text-sm leading-6 text-brand-textMuted">
              Manage custom local micro-apps (artifacts) generated by the agent. Configure execution, visibility, and system tray behavior.
            </p>
          </div>
        </div>
      </div>

      {/* Save status notification */}
      {saveStatus && (
        <div
          className={`mb-6 flex items-center gap-3 rounded-lg border p-4 text-sm ${
            saveStatus.ok
              ? 'border-constructive/30 bg-constructive/10 text-constructive'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {saveStatus.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{saveStatus.message}</span>
        </div>
      )}

      {/* Directory & Configuration */}
      <section className="mb-6">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Artifact Directory</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-brand-textMain">Default Storage Path</div>
              <div className="text-xs text-brand-textMuted mt-0.5">
                Micro-app manifests and source files are stored here.
              </div>
              <div className="mt-2 text-xs font-mono bg-brand-bg px-3 py-2 rounded border border-brand-border text-brand-textMain select-all">
                ~/.superagent/artifacts
              </div>
            </div>
            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-2 rounded-lg border border-brand-border px-3 py-2 text-xs font-semibold text-brand-textMain hover:bg-brand-hover transition-colors shrink-0"
            >
              <FolderOpen size={14} />
              Open Folder
            </button>
          </div>
        </div>
      </section>

      {/* Execution Settings */}
      <section className="mb-6">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Execution Settings</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4 flex flex-col gap-4">
          {/* AutoStart toggle (Desktop vs Web) */}
          {isDesktop() ? (
            <div className="flex items-center justify-between gap-4 border-b border-brand-border/70 pb-4">
              <div>
                <div className="text-sm font-medium text-brand-textMain">Auto-start on Launch</div>
                <div className="text-xs text-brand-textMuted mt-0.5">
                  Automatically run static and background artifacts when SuperAgent starts.
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggleAutoStart(!autoStartOnLaunch)}
                className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                  autoStartOnLaunch ? 'bg-(--brand-accent)' : 'bg-brand-border'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-brand-card shadow-sm transition-transform ${
                    autoStartOnLaunch ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 border-b border-brand-border/70 pb-4 opacity-50">
              <div>
                <div className="text-sm font-medium text-brand-textMain">Auto-start on Launch</div>
                <div className="text-xs text-brand-textMuted mt-0.5">
                  Available in the desktop app only.
                </div>
              </div>
              <Monitor size={16} className="text-brand-textMuted" />
            </div>
          )}

          {/* Port configuration */}
          <div>
            <form onSubmit={handlePortSubmit} className="flex items-end justify-between gap-4">
              <div className="flex-1">
                <div className="text-sm font-medium text-brand-textMain">Default Port Start Range</div>
                <div className="text-xs text-brand-textMuted mt-0.5">
                  The initial TCP port number for static web app servers (e.g. 3080).
                </div>
                <input
                  type="number"
                  value={defaultPortStart}
                  onChange={handlePortChange}
                  className="mt-2 w-full max-w-[120px] rounded border border-brand-border bg-brand-bg px-3 py-1.5 text-sm text-brand-textMain outline-none focus:border-brand-accent"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-brand-accent px-4 py-2 text-xs font-semibold text-white hover:bg-brand-accent/80 transition-colors shrink-0"
              >
                Save Port
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* System Tray (Desktop-only) */}
      {isDesktop() && (
        <section className="mb-6">
          <h3 className="mb-3 text-base font-semibold text-brand-textMain">System Tray</h3>
          <div className="rounded-lg border border-brand-border bg-brand-card p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 border-b border-brand-border/70 pb-4">
              <div>
                <div className="text-sm font-medium text-brand-textMain">Show Tray Icon When Stopped</div>
                <div className="text-xs text-brand-textMuted mt-0.5">
                  Keep the system tray icon visible even when all artifacts are stopped.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const val = !trayIconWhenStopped;
                  setTrayIconWhenStopped(val);
                  saveAllSettings({ trayIconWhenStopped: val });
                }}
                className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                  trayIconWhenStopped ? 'bg-(--brand-accent)' : 'bg-brand-border'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-brand-card shadow-sm transition-transform ${
                    trayIconWhenStopped ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-brand-textMain">Notification Badge</div>
                <div className="text-xs text-brand-textMuted mt-0.5">
                  Show active artifact count as a badge on the tray icon.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const val = !trayNotificationBadge;
                  setTrayNotificationBadge(val);
                  saveAllSettings({ trayNotificationBadge: val });
                }}
                className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                  trayNotificationBadge ? 'bg-(--brand-accent)' : 'bg-brand-border'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-brand-card shadow-sm transition-transform ${
                    trayNotificationBadge ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Default Visibility */}
      <section className="mb-6">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Default Visibility</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <div className="text-xs text-brand-textMuted mb-3">How newly created artifacts appear by default.</div>
          <div className="flex flex-col gap-2">
            {(
              [
                ['floating', 'Floating Window', 'Opens in a draggable overlay window.'],
                ['tray', 'Tray Only', 'Runs in background, accessible from system tray.'],
                ['background', 'Background', 'Runs silently with no visible UI.'],
              ] as const
            ).map(([val, label, desc]) => (
              <label
                key={val}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  defaultVisibility === val
                    ? 'border-brand-accent bg-brand-accent/5'
                    : 'border-brand-border hover:bg-brand-hover'
                }`}
              >
                <input
                  type="radio"
                  name="defaultVisibility"
                  value={val}
                  checked={defaultVisibility === val}
                  onChange={() => {
                    setDefaultVisibility(val);
                    saveAllSettings({ defaultVisibility: val });
                  }}
                  className="accent-[var(--brand-accent)]"
                />
                <div>
                  <div className="text-sm font-medium text-brand-textMain">{label}</div>
                  <div className="text-xs text-brand-textMuted">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Security: Sandbox Mode */}
      <section className="mb-6">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Security</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-brand-textMain flex items-center gap-2">
                <Shield size={14} />
                Sandbox Mode
              </div>
              <div className="text-xs text-brand-textMuted mt-0.5">
                Run artifacts in an isolated sandbox for extra security. May reduce performance.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const val = !sandboxMode;
                setSandboxMode(val);
                saveAllSettings({ sandboxMode: val });
              }}
              className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                sandboxMode ? 'bg-(--brand-accent)' : 'bg-brand-border'
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-brand-card shadow-sm transition-transform ${
                  sandboxMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Update Behavior */}
      <section className="mb-6">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Update Behavior</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <div className="text-xs text-brand-textMuted mb-3">
            What happens when the agent regenerates an existing artifact.
          </div>
          <div className="flex flex-col gap-2">
            {(
              [
                ['replace', 'Replace Existing', 'Overwrite the current artifact with the new version.'],
                ['duplicate', 'Keep Both Versions', 'Create a new copy alongside the existing one.'],
                ['ask', 'Ask Me Each Time', 'Prompt for confirmation before replacing.'],
              ] as const
            ).map(([val, label, desc]) => (
              <label
                key={val}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  updateBehavior === val
                    ? 'border-brand-accent bg-brand-accent/5'
                    : 'border-brand-border hover:bg-brand-hover'
                }`}
              >
                <input
                  type="radio"
                  name="updateBehavior"
                  value={val}
                  checked={updateBehavior === val}
                  onChange={() => {
                    setUpdateBehavior(val);
                    saveAllSettings({ updateBehavior: val });
                  }}
                  className="accent-[var(--brand-accent)]"
                />
                <div>
                  <div className="text-sm font-medium text-brand-textMain">{label}</div>
                  <div className="text-xs text-brand-textMuted">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Installed Artifacts list */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-brand-textMain">Installed Artifacts</h3>
          <button
            onClick={fetchArtifacts}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-brand-textMuted hover:text-brand-textMain disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Scan
          </button>
        </div>

        <div className="rounded-lg border border-brand-border bg-brand-card overflow-hidden">
          {artifacts.length === 0 ? (
            <div className="p-8 text-center text-sm text-brand-textMuted">
              No custom artifacts installed. Ask the agent to build an artifact (like a calculator or dashboard).
            </div>
          ) : (
            <div className="divide-y divide-brand-border">
              {artifacts.map((art) => (
                <div key={art.id} className="flex items-center justify-between p-4 gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-brand-textMain truncate">
                        {art.manifest.name}
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          art.status === 'running'
                            ? 'bg-constructive/15 text-constructive'
                            : 'bg-brand-bg text-brand-textMuted'
                        }`}
                      >
                        {art.status}
                      </span>
                      <span className="text-[10px] bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full font-medium">
                        {art.manifest.type}
                      </span>
                      {art.status === 'running' && art.url && (
                        <a
                          href={art.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full font-medium hover:bg-brand-accent/25 transition-colors"
                        >
                          <ExternalLink size={10} />
                          :{art.port}
                        </a>
                      )}
                    </div>
                    <div className="text-xs text-brand-textMuted mt-1 line-clamp-1">
                      {art.manifest.description}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(art.id, art.manifest.name)}
                    className="p-2 text-brand-textMuted hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
                    title="Delete artifact"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Danger zone */}
      {artifacts.length > 0 && (
        <section className="mt-8 pt-6 border-t border-brand-border">
          <h3 className="mb-3 text-base font-semibold text-destructive">Danger Zone</h3>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-brand-textMain">Delete All Artifacts</div>
              <div className="text-xs text-brand-textMuted mt-0.5">
                Permanently deletes the entire folder structure for all custom local micro-apps.
              </div>
            </div>
            <button
              onClick={handleClearAll}
              className="rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-white hover:bg-destructive/80 transition-colors shrink-0"
            >
              Clear All
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
