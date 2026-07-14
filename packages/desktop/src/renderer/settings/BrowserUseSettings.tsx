import React, { useEffect, useState } from 'react';
import { MonitorSmartphone, Save, RefreshCw, AlertCircle, Eye, EyeOff, Play, Globe, Network, ShieldAlert, Cpu } from 'lucide-react';

/** Props for the Browser Use settings panel. */
interface BrowserUseSettingsProps {
  onSaveSettings: (patch: {
    browserUse: {
      headless: boolean;
      width: number;
      height: number;
      userAgent: string;
      timeout: number;
      connectToActiveChrome: boolean;
      chromeDebugPort: number;
      useUserProfile: boolean;
      userProfilePath: string;
    }
  }) => void;
}

/** Settings panel for Playwright browser connection profiles and live navigation testing. */
export const BrowserUseSettings: React.FC<BrowserUseSettingsProps> = ({
  onSaveSettings
}) => {
  const [headless, setHeadless] = useState(true);
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [userAgent, setUserAgent] = useState('');
  const [timeout, setTimeoutVal] = useState(30);

  // Connection modes
  const [mode, setMode] = useState<'isolated' | 'cdp' | 'persistent'>('isolated');
  const [chromeDebugPort, setChromeDebugPort] = useState(9222);
  const [userProfilePath, setUserProfilePath] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Browser live sandbox state
  const [testUrl, setTestUrl] = useState('https://news.ycombinator.com');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ title: string; url: string; screenshotPath: string } | null>(null);

  const ipc = typeof window !== 'undefined' && (window as any).require
    ? (window as any).require('electron').ipcRenderer
    : null;

  const loadSettings = async () => {
    if (!ipc) return;
    setLoading(true);
    try {
      const settings = await ipc.invoke('settings-read') as any;
      const bConfig = settings.browserUse || {};
      setHeadless(bConfig.headless !== false);
      setWidth(bConfig.width || 1280);
      setHeight(bConfig.height || 720);
      setUserAgent(bConfig.userAgent || '');
      setTimeoutVal(bConfig.timeout || 30);
      setChromeDebugPort(bConfig.chromeDebugPort || 9222);
      setUserProfilePath(bConfig.userProfilePath || '');

      if (bConfig.connectToActiveChrome) {
        setMode('cdp');
      } else if (bConfig.useUserProfile) {
        setMode('persistent');
      } else {
        setMode('isolated');
      }
    } catch (e) {
      console.error('Failed to load Browser Use configurations:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      onSaveSettings({
        browserUse: {
          headless,
          width,
          height,
          userAgent,
          timeout,
          connectToActiveChrome: mode === 'cdp',
          chromeDebugPort,
          useUserProfile: mode === 'persistent',
          userProfilePath
        }
      });
      setMessage({ text: 'Browser Use configuration saved successfully!', type: 'success' });
    } catch (e: any) {
      setMessage({ text: `Failed to save settings: ${e.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestNavigate = async () => {
    if (!ipc) return;
    setTesting(true);
    setTestResult(null);
    setMessage(null);
    try {
      // 1. Force save current configuration parameters first so Playwright instantiates using the newly chosen mode
      onSaveSettings({
        browserUse: {
          headless,
          width,
          height,
          userAgent,
          timeout,
          connectToActiveChrome: mode === 'cdp',
          chromeDebugPort,
          useUserProfile: mode === 'persistent',
          userProfilePath
        }
      });

      // 2. Shut down any active session to force reload context settings
      await ipc.invoke('browser-close').catch(() => {});

      // 3. Navigate & Capture screenshot
      const navRes = await ipc.invoke('browser-navigate', { url: testUrl });
      const shotRes = await ipc.invoke('browser-screenshot', { fullPage: false });
      const shotPath = shotRes.replace('Screenshot captured and saved to: ', '').trim();

      setTestResult({
        title: navRes.replace(/Successfully navigated to .* Page Title: "/, '').replace(/"$/, '').trim(),
        url: testUrl,
        screenshotPath: shotPath
      });
    } catch (e: any) {
      setMessage({ text: `Navigation test failed: ${e.message}`, type: 'error' });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin text-[var(--brand-accent)] mb-2" />
        <span>Loading Browser Use configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-border/60 pb-4">
        <div>
          <h2 className="text-base font-bold text-brand-textMain">Browser Use</h2>
          <p className="text-xs text-brand-textMuted mt-1">
            Configure how the Playwright environment runs. Connect to your active Chrome browser to run agent commands on your behalf using your logged-in sessions.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="ui-btn-primary text-xs"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-lg flex items-start gap-2.5 text-xs ${
          message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          <AlertCircle size={15} className="mt-0.5" />
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: configuration settings */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
            <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
              <Network size={14} className="text-[var(--brand-accent)]" />
              <span>Browser Connection Profile</span>
            </h3>

            {/* Mode selection buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setMode('isolated')}
                className={`py-2 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  mode === 'isolated'
                    ? 'border-[var(--brand-accent-border)] bg-[var(--brand-accent-tint)] text-brand-textMain'
                    : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-brand-hover'
                }`}
              >
                <Cpu size={14} />
                <span>Isolated Clean</span>
              </button>

              <button
                onClick={() => setMode('cdp')}
                className={`py-2 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  mode === 'cdp'
                    ? 'border-[var(--brand-accent-border)] bg-[var(--brand-accent-tint)] text-brand-textMain'
                    : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-brand-hover'
                }`}
              >
                <Network size={14} />
                <span>Connect Chrome</span>
              </button>

              <button
                onClick={() => setMode('persistent')}
                className={`py-2 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  mode === 'persistent'
                    ? 'border-[var(--brand-accent-border)] bg-[var(--brand-accent-tint)] text-brand-textMain'
                    : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-brand-hover'
                }`}
              >
                <Eye size={14} />
                <span>Share Profile</span>
              </button>
            </div>

            {/* Mode conditional instructions */}
            {mode === 'isolated' && (
              <p className="text-[11px] text-brand-textMuted">
                Launches a separate, clean, isolated browser instance. Safe and sandboxed, but requires logging into accounts manually if needed.
              </p>
            )}

            {mode === 'cdp' && (
              <div className="space-y-3 pt-1">
                <div className="bg-[var(--neon-attention)]/10 border border-[var(--neon-attention)]/20 text-[var(--neon-attention)] p-2.5 rounded-lg flex items-start gap-2 text-[10px]">
                  <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
                  <span>
                    To connect, launch Chrome from terminal using:
                    <code className="block mt-1 font-mono bg-black/30 p-1 rounded">chrome.exe --remote-debugging-port=9222</code>
                  </span>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Remote Debugging Port</label>
                  <input
                    type="number"
                    value={chromeDebugPort}
                    onChange={(e) => setChromeDebugPort(parseInt(e.target.value) || 9222)}
                    className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
                  />
                </div>
              </div>
            )}

            {mode === 'persistent' && (
              <div className="space-y-3 pt-1">
                <p className="text-[11px] text-brand-textMuted">
                  Launches a browser utilizing your current Chrome profile directory. Grants access to your logins, cookies, and extensions.
                </p>
                <div className="space-y-1">
                  <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">User Data Directory Path</label>
                  <input
                    type="text"
                    placeholder="e.g. C:\Users\<Username>\AppData\Local\Google\Chrome\User Data"
                    value={userProfilePath}
                    onChange={(e) => setUserProfilePath(e.target.value)}
                    className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
                  />
                </div>
              </div>
            )}

            {/* Standard configs */}
            <div className="border-t border-brand-border/40 pt-4 space-y-3">
              {mode !== 'cdp' && (
                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-xs font-semibold text-brand-textMain">Headless Mode</div>
                    <div className="text-[10px] text-brand-textMuted mt-0.5">Run background browser actions silently.</div>
                  </div>
                  <button
                    onClick={() => setHeadless(!headless)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-lg border text-xs transition-all ${
                      headless 
                        ? 'border-[var(--brand-accent-border)] bg-[var(--brand-accent-tint)] text-[var(--brand-accent)]' 
                        : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-brand-hover'
                    }`}
                  >
                    {headless ? <EyeOff size={13} /> : <Eye size={13} />}
                    <span>{headless ? 'Headless' : 'Visible'}</span>
                  </button>
                </div>
              )}

              {/* Viewport size */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Width (px)</label>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(parseInt(e.target.value) || 1280)}
                    className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Height (px)</label>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(parseInt(e.target.value) || 720)}
                    className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
                  />
                </div>
              </div>

              {/* Timeout */}
              <div className="space-y-1">
                <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Navigation Timeout (seconds)</label>
                <input
                  type="number"
                  value={timeout}
                  onChange={(e) => setTimeoutVal(parseInt(e.target.value) || 30)}
                  className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
                />
              </div>

              {/* User Agent */}
              <div className="space-y-1">
                <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">User Agent string override</label>
                <input
                  type="text"
                  placeholder="Default Playwright user agent..."
                  value={userAgent}
                  onChange={(e) => setUserAgent(e.target.value)}
                  className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live testing sandbox */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
            <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
              <Globe size={14} className="text-[var(--brand-accent)]" />
              <span>Browser Live Playground</span>
            </h3>
            <p className="text-[11px] text-brand-textMuted">
              Verify connection profiles in real-time. (If using CDP, ensure Chrome debugger is running first).
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://example.com"
                className="flex-1 rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
              />
              <button
                onClick={handleTestNavigate}
                disabled={testing}
                className="ui-btn-accent text-xs"
              >
                {testing ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
                <span>{testing ? 'Loading...' : 'Go'}</span>
              </button>
            </div>

            {testResult && (
              <div className="space-y-2 mt-2 animate-fade-in">
                <div className="p-2.5 rounded-lg border border-brand-border bg-brand-bg space-y-1">
                  <div className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Page Title</div>
                  <div className="text-xs font-semibold text-brand-textMain">{testResult.title || '(No title)'}</div>
                </div>
                {testResult.screenshotPath && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Webpage Live Frame</label>
                    <div className="rounded-lg border border-brand-border overflow-hidden bg-brand-bg max-h-[220px]">
                      <img 
                        src={`file:///${testResult.screenshotPath.replace(/\\/g, '/')}`} 
                        alt="Test screenshot"
                        className="w-full object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
