import React, { useEffect, useState } from 'react';
import { MonitorSmartphone, Save, RefreshCw, AlertCircle, Eye, EyeOff, Play, Globe } from 'lucide-react';

interface BrowserUseSettingsProps {
  onSaveSettings: (patch: {
    browserUse: {
      headless: boolean;
      width: number;
      height: number;
      userAgent: string;
      timeout: number;
    }
  }) => void;
}

export const BrowserUseSettings: React.FC<BrowserUseSettingsProps> = ({
  onSaveSettings
}) => {
  const [headless, setHeadless] = useState(true);
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [userAgent, setUserAgent] = useState('');
  const [timeout, setTimeoutVal] = useState(30);

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
          timeout
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
      // 1. Navigate to target URL
      const navRes = await ipc.invoke('browser-navigate', { url: testUrl });
      
      // 2. Take a screenshot
      const shotRes = await ipc.invoke('browser-screenshot', { fullPage: false });
      
      // Extract screenshot path from result string (e.g. "Screenshot captured and saved to: ...")
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
        <RefreshCw className="w-5 h-5 animate-spin text-sky-400 mb-2" />
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
            Configure the Playwright Chromium environment used for autonomous web searching, data ingestion, and visual page interaction.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
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

      <div className="grid grid-cols-2 gap-6">
        {/* Left: configuration settings */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
            <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
              <MonitorSmartphone size={14} className="text-sky-400" />
              <span>Browser Configuration</span>
            </h3>

            {/* Headless Toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-xs font-semibold text-brand-textMain">Headless Mode</div>
                <div className="text-[10px] text-brand-textMuted mt-0.5">Run without opening a visible browser window.</div>
              </div>
              <button
                onClick={() => setHeadless(!headless)}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg border text-xs transition-all ${
                  headless 
                    ? 'border-sky-500/35 bg-sky-500/10 text-sky-400' 
                    : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-white/2'
                }`}
              >
                {headless ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{headless ? 'Headless' : 'Visible'}</span>
              </button>
            </div>

            {/* Viewport size */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Width (px)</label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(parseInt(e.target.value) || 1280)}
                  className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Height (px)</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(parseInt(e.target.value) || 720)}
                  className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
                />
              </div>
            </div>

            {/* Timeout */}
            <div className="space-y-1 pt-1">
              <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Navigation Timeout (seconds)</label>
              <input
                type="number"
                value={timeout}
                onChange={(e) => setTimeoutVal(parseInt(e.target.value) || 30)}
                className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
              />
            </div>

            {/* User Agent */}
            <div className="space-y-1 pt-1">
              <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">User Agent string override</label>
              <input
                type="text"
                placeholder="Default Playwright user agent..."
                value={userAgent}
                onChange={(e) => setUserAgent(e.target.value)}
                className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
              />
            </div>
          </div>
        </div>

        {/* Right: Live testing sandbox */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
            <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
              <Globe size={14} className="text-sky-400" />
              <span>Browser Live Playground</span>
            </h3>
            <p className="text-[11px] text-brand-textMuted">
              Verify Playwright connectivity by navigating to a URL and capturing the page output in real-time.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://example.com"
                className="flex-1 rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
              />
              <button
                onClick={handleTestNavigate}
                disabled={testing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
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
