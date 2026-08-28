import React, { useState, useEffect } from 'react';
import { Sparkles, Key, CheckCircle2, AlertTriangle, Camera, Play, RotateCcw } from 'lucide-react';
import { BrandLogo } from '../../BrandLogo';
import { getIpc } from '../../lib/ipc';
import { getPlatform, getKeySymbols, formatShortcut, toAccelerator, toDisplayShortcut } from '../../lib/platform';

export const CircleSearchSettings: React.FC = () => {
  const ipc = getIpc();
  const platform = getPlatform();
  const keys = getKeySymbols();

  const [enabled, setEnabled] = useState<boolean>(true);
  const [shortcut, setShortcut] = useState<string>('CommandOrControl+Shift+S');
  const [displayShortcut, setDisplayShortcut] = useState<string>('');
  const [spotlightEnabled, setSpotlightEnabled] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  useEffect(() => {
    if (!ipc) return;
    ipc
      .invoke('settings-read')
      .then((settings: any) => {
        let initialShortcut = 'CommandOrControl+Shift+S';
        if (settings?.circleSearch) {
          if (settings.circleSearch.enabled !== undefined) {
            setEnabled(Boolean(settings.circleSearch.enabled));
          }
          if (settings.circleSearch.shortcut) {
            initialShortcut = settings.circleSearch.shortcut;
          }
        }
        setShortcut(initialShortcut);
        setDisplayShortcut(toDisplayShortcut(initialShortcut));

        if (settings?.general && settings.general.hotkeyOverlayEnabled !== undefined) {
          setSpotlightEnabled(Boolean(settings.general.hotkeyOverlayEnabled));
        }
      })
      .catch(() => {
        setDisplayShortcut(toDisplayShortcut('CommandOrControl+Shift+S'));
      });
  }, []);

  const saveSettings = async (newEnabled: boolean, rawShortcutInput: string, newSpotlightEnabled: boolean) => {
    if (!ipc) return;
    setSaveStatus(null);
    try {
      const canonicalAccelerator = toAccelerator(rawShortcutInput);
      const currentSettings = await ipc.invoke('settings-read');
      await ipc.invoke('settings-write', {
        ...currentSettings,
        general: {
          ...(currentSettings?.general || {}),
          hotkeyOverlayEnabled: newSpotlightEnabled,
        },
        circleSearch: {
          enabled: newEnabled,
          shortcut: canonicalAccelerator,
        },
      });

      setShortcut(canonicalAccelerator);
      setDisplayShortcut(toDisplayShortcut(canonicalAccelerator));
      setSaveStatus({
        ok: true,
        message: `Saved shortcut: ${toDisplayShortcut(canonicalAccelerator)} (${platform === 'macos' ? 'macOS' : 'Windows'})`,
      });
    } catch (err: any) {
      console.error(err);
      setSaveStatus({ ok: false, message: err.message || 'Failed to save settings.' });
    }
  };

  const handleToggle = (val: boolean) => {
    setEnabled(val);
    saveSettings(val, shortcut, spotlightEnabled);
  };

  const handleSpotlightToggle = (val: boolean) => {
    setSpotlightEnabled(val);
    saveSettings(enabled, shortcut, val);
  };

  const handleShortcutKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ignore lone modifier presses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return;
    }
    e.preventDefault();

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) {
      parts.push(platform === 'macos' ? '⌘' : 'Ctrl');
    }
    if (e.altKey) {
      parts.push(platform === 'macos' ? '⌥' : 'Alt');
    }
    if (e.shiftKey) {
      parts.push(platform === 'macos' ? '⇧' : 'Shift');
    }

    let keyName = e.key.toUpperCase();
    if (e.code === 'Space' || e.key === ' ') {
      keyName = 'Space';
    } else if (e.key === 'Escape') {
      keyName = 'Esc';
    }

    parts.push(keyName);
    const newFormatted = parts.join(' + ');
    setDisplayShortcut(newFormatted);
    setIsRecording(false);
  };

  const handleShortcutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayShortcut(e.target.value);
  };

  const handleShortcutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettings(enabled, displayShortcut || shortcut, spotlightEnabled);
  };

  const handleResetDefaultShortcut = () => {
    const defaultAcc = 'CommandOrControl+Shift+S';
    setShortcut(defaultAcc);
    setDisplayShortcut(toDisplayShortcut(defaultAcc));
    saveSettings(enabled, defaultAcc, spotlightEnabled);
  };

  const handleTestOverlay = async () => {
    if (ipc?.invoke) {
      try {
        await ipc.invoke('circle-search-show');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const spotlightShortcutFormatted = formatShortcut('CommandOrControl+Alt+Space');
  const directCaptureFormatted = toDisplayShortcut(shortcut || 'CommandOrControl+Shift+S');

  return (
    <div
      className="max-w-[680px] text-left"
      style={{
        fontFamily: platform === 'macos' ? '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' : 'inherit',
      }}
    >
      {/* Atmosphere hero */}
      <div className="relative mb-7 overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(120% 90% at 82% -10%, var(--brand-atmo-glow), transparent 55%)' }}
          />
        </div>
        <div className="relative flex items-center justify-between gap-4 px-6 py-6 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="animate-float shrink-0">
              <BrandLogo size={48} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">
                  Circle to Search & Spotlight
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-indigo-500/20 to-pink-500/20 text-indigo-300 border border-indigo-500/30">
                  {platform === 'macos' ? 'macOS Native' : platform === 'windows' ? 'Windows' : 'Linux'}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-brand-textMuted">
                Instant Google Gemini-style visual search merged with Spotlight Quick Launcher across all screens.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestOverlay}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md cursor-pointer hover:shadow-indigo-500/20"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch Overlay</span>
          </button>
        </div>
      </div>

      {/* Spotlight Quick Launcher Toggle */}
      <section className="mb-6">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Spotlight Quick Launcher</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  spotlightEnabled
                    ? 'bg-[color:var(--brand-accent-tint)] text-[color:var(--brand-accent)]'
                    : 'bg-brand-bg text-brand-textMuted'
                }`}
              >
                <Sparkles size={18} />
              </span>
              <div>
                <div className="text-sm font-medium text-brand-textMain">Enable Spotlight Quick Launcher</div>
                <div className="text-xs text-brand-textMuted">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-brand-bg border border-brand-border font-mono text-[10px] text-brand-textMain">{spotlightShortcutFormatted}</kbd> anywhere on your system to launch instant omnibox.
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={spotlightEnabled}
              onClick={() => handleSpotlightToggle(!spotlightEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                spotlightEnabled ? 'bg-[color:var(--brand-accent)]' : 'bg-brand-bg border border-brand-border'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  spotlightEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Circle to Search Toggle */}
      <section className="mb-6">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Circle to Search & Screen Snippet</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  enabled
                    ? 'bg-[color:var(--brand-accent-tint)] text-[color:var(--brand-accent)]'
                    : 'bg-brand-bg text-brand-textMuted'
                }`}
              >
                <Camera size={18} />
              </span>
              <div>
                <div className="text-sm font-medium text-brand-textMain">Enable Google Gemini Circle to Search</div>
                <div className="text-xs text-brand-textMuted">
                  Freeze screen and circle any element with <kbd className="px-1.5 py-0.5 rounded bg-brand-bg border border-brand-border font-mono text-[10px] text-brand-textMain">{directCaptureFormatted}</kbd> for instant AI analysis.
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => handleToggle(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                enabled ? 'bg-[color:var(--brand-accent)]' : 'bg-brand-bg border border-brand-border'
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

      {/* Shortcut Accelerator Config */}
      <section className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-brand-textMain">
          <Key size={16} /> Global Keypress Accelerator
        </h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <form onSubmit={handleShortcutSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-brand-textMuted uppercase tracking-wider">
                  Direct Circle to Search Keypress ({platform === 'macos' ? 'macOS' : 'Windows'})
                </label>
                <button
                  type="button"
                  onClick={handleResetDefaultShortcut}
                  className="text-[11px] text-brand-textMuted hover:text-brand-textMain flex items-center gap-1 transition-colors cursor-pointer"
                  title="Reset to default shortcut"
                >
                  <RotateCcw size={12} />
                  <span>Reset Default</span>
                </button>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={displayShortcut}
                    onFocus={() => setIsRecording(true)}
                    onBlur={() => setIsRecording(false)}
                    onKeyDown={handleShortcutKeyDown}
                    onChange={handleShortcutChange}
                    className="ui-input w-full font-mono text-sm tracking-wide"
                    placeholder={platform === 'macos' ? '⌘ + Shift + S' : 'Ctrl + Shift + S'}
                  />
                  {isRecording && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-indigo-400 animate-pulse">
                      Press keys now...
                    </span>
                  )}
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-brand-highlight hover:bg-brand-highlight-hover text-brand-highlight-text text-xs font-semibold transition-colors cursor-pointer"
                >
                  Save Shortcut
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-brand-textMuted">
                Click the input box and press your desired key combination (e.g.{' '}
                <span className="font-mono text-zinc-300">
                  {platform === 'macos' ? '⌘ + Shift + S' : 'Ctrl + Shift + S'}
                </span>
                ).
              </p>
            </div>

            <div className="rounded-lg bg-brand-bg border border-brand-border/40 p-3.5 text-xs text-brand-textMuted space-y-2 leading-relaxed">
              <span className="font-semibold text-brand-textMain block mb-1">
                Active {platform === 'macos' ? 'macOS' : platform === 'windows' ? 'Windows' : 'Linux'} Accelerators:
              </span>
              <ul className="list-disc pl-4 space-y-1.5">
                <li>
                  <kbd className="px-1.5 py-0.5 rounded bg-brand-card border border-brand-border font-mono text-[11px] text-indigo-300">
                    {directCaptureFormatted}
                  </kbd>
                  <span className="ml-2">Freeze screen and circle/drag any area (Google Gemini Circle to Search).</span>
                </li>
                <li>
                  <kbd className="px-1.5 py-0.5 rounded bg-brand-card border border-brand-border font-mono text-[11px] text-purple-300">
                    {spotlightShortcutFormatted}
                  </kbd>
                  <span className="ml-2">Open Spotlight Quick Launcher bar.</span>
                </li>
                <li>
                  <kbd className="px-1.5 py-0.5 rounded bg-brand-card border border-brand-border font-mono text-[11px] text-zinc-300">
                    Esc
                  </kbd>
                  <span className="ml-2">Instantly dismiss / close the overlay anywhere.</span>
                </li>
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
