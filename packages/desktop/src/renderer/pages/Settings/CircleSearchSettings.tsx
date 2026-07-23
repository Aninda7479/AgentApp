import React, { useState, useEffect } from 'react';
import { Search, Sparkles, Key, CheckCircle2, AlertTriangle, Camera } from 'lucide-react';
import { BrandLogo } from '../../BrandLogo';
import { getIpc } from '../../lib/electron';

export const CircleSearchSettings: React.FC = () => {
  const ipc = getIpc();

  const [enabled, setEnabled] = useState<boolean>(true);
  const [shortcut, setShortcut] = useState<string>('CommandOrControl+Shift+S');
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!ipc) return;
    ipc.invoke('settings-read').then((settings: any) => {
      if (settings?.circleSearch) {
        if (settings.circleSearch.enabled !== undefined) {
          setEnabled(Boolean(settings.circleSearch.enabled));
        }
        if (settings.circleSearch.shortcut) {
          setShortcut(settings.circleSearch.shortcut);
        }
      }
    }).catch(() => {});
  }, []);

  const saveSettings = async (newEnabled: boolean, newShortcut: string) => {
    if (!ipc) return;
    setSaveStatus(null);
    try {
      const currentSettings = await ipc.invoke('settings-read');
      await ipc.invoke('settings-write', {
        ...currentSettings,
        circleSearch: {
          enabled: newEnabled,
          shortcut: newShortcut.trim(),
        }
      });
      setSaveStatus({ ok: true, message: 'Unified Spotlight & Circle Search settings saved.' });
    } catch (err: any) {
      console.error(err);
      setSaveStatus({ ok: false, message: err.message || 'Failed to save settings.' });
    }
  };

  const handleToggle = (val: boolean) => {
    setEnabled(val);
    saveSettings(val, shortcut);
  };

  const handleShortcutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShortcut(e.target.value);
  };

  const handleShortcutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettings(enabled, shortcut);
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
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">Spotlight & Circle Search</h1>
            <p className="mt-1 text-sm leading-6 text-brand-textMuted">
              Circle Search is now merged with Spotlight Quick Launcher! Capture any screen snippet directly into your Spotlight bar or launch instant vision queries.
            </p>
          </div>
        </div>
      </div>

      {/* Main toggle */}
      <section className="mb-6">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Screen Snippet & Vision Search</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                enabled
                  ? 'bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)]'
                  : 'bg-brand-bg text-brand-textMuted'
              }`}>
                <Camera size={18} />
              </span>
              <div>
                <div className="text-sm font-medium text-brand-textMain">
                  Enable Screen Capture in Spotlight
                </div>
                <div className="text-xs text-brand-textMuted">
                  Allows capturing screen snippets directly inside the Spotlight overlay bar.
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => handleToggle(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-[color:var(--neon-constructive)]' : 'bg-brand-bg border border-brand-border'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Shortcut Config */}
      <section className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-brand-textMain">
          <Key size={16} /> Direct Screen Capture Shortcut
        </h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <form onSubmit={handleShortcutSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-brand-textMuted uppercase tracking-wider">
                Direct Capture Accelerator
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shortcut}
                  onChange={handleShortcutChange}
                  className="ui-input flex-1"
                  placeholder="CommandOrControl+Shift+S"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-brand-highlight hover:bg-brand-highlight-hover text-brand-highlight-text text-xs font-semibold transition-colors cursor-pointer"
                >
                  Save Shortcut
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-brand-bg border border-brand-border/40 p-3.5 text-xs text-brand-textMuted space-y-2 leading-relaxed">
              <span className="font-semibold text-brand-textMain block mb-1">Unified Quick Overlay Shortcuts:</span>
              <ul className="list-disc pl-4 space-y-1">
                <li><code className="text-purple-300 font-mono">Ctrl+Alt+Space</code>: Open Spotlight Quick Launcher bar.</li>
                <li><code className="text-purple-300 font-mono">{shortcut}</code>: Open Spotlight and attach instant Screen Snippet (Circle Search).</li>
                <li>Inside Spotlight overlay: Click <strong className="text-zinc-200">"Screen"</strong> camera button to attach/detach screen capture anytime.</li>
              </ul>
            </div>

            {saveStatus && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  saveStatus.ok
                    ? 'border-[color:var(--neon-constructive)]/40 bg-[color:var(--neon-constructive)]/10 text-[color:var(--neon-constructive)]'
                    : 'border-[color:var(--neon-destructive)]/40 bg-[color:var(--neon-destructive)]/10 text-[color:var(--neon-destructive)]'
                }`}
              >
                {saveStatus.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                <span>{saveStatus.message}</span>
              </div>
            )}
          </form>
        </div>
      </section>
    </div>
  );
};
