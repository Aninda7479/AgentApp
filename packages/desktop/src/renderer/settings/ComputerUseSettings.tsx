import React, { useEffect, useState } from 'react';
import { MousePointer2, Save, RefreshCw, AlertCircle, Play, Camera } from 'lucide-react';

/** Props for the Computer Use settings panel. */
interface ComputerUseSettingsProps {
  onSaveSettings: (patch: {
    computerUse: {
      enableMouse: boolean;
      enableKeyboard: boolean;
      actionDelay: number;
    }
  }) => void;
}

/** Settings panel for desktop mouse/keyboard automation permissions and screen capture. */
export const ComputerUseSettings: React.FC<ComputerUseSettingsProps> = ({
  onSaveSettings
}) => {
  const [enableMouse, setEnableMouse] = useState(true);
  const [enableKeyboard, setEnableKeyboard] = useState(true);
  const [actionDelay, setActionDelay] = useState(250);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Screenshot capture sandbox state
  const [capturing, setCapturing] = useState(false);
  const [capturedPath, setCapturedPath] = useState<string | null>(null);

  const ipc = typeof window !== 'undefined' && (window as any).require
    ? (window as any).require('electron').ipcRenderer
    : null;

  const loadSettings = async () => {
    if (!ipc) return;
    setLoading(true);
    try {
      const settings = await ipc.invoke('settings-read') as any;
      const cConfig = settings.computerUse || {};
      setEnableMouse(cConfig.enableMouse !== false);
      setEnableKeyboard(cConfig.enableKeyboard !== false);
      setActionDelay(cConfig.actionDelay || 250);
    } catch (e) {
      console.error('Failed to load Computer Use configurations:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      onSaveSettings({
        computerUse: {
          enableMouse,
          enableKeyboard,
          actionDelay
        }
      });
      setMessage({ text: 'Computer Use configuration saved successfully!', type: 'success' });
    } catch (e: any) {
      setMessage({ text: `Failed to save settings: ${e.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCaptureScreen = async () => {
    if (!ipc) return;
    setCapturing(true);
    setCapturedPath(null);
    setMessage(null);
    try {
      const res = await ipc.invoke('screenshot_screen');
      // Extract screenshot path from result string (e.g. "Screenshot captured successfully and saved to: ...")
      const shotPath = res.replace('Screenshot captured successfully and saved to: ', '').trim();
      setCapturedPath(shotPath);
    } catch (e: any) {
      setMessage({ text: `Screen capture failed: ${e.message}`, type: 'error' });
    } finally {
      setCapturing(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin text-sky-400 mb-2" />
        <span>Loading Computer Use configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-border/60 pb-4">
        <div>
          <h2 className="text-base font-bold text-brand-textMain">Computer Use</h2>
          <p className="text-xs text-brand-textMuted mt-1">
            Configure desktop control permissions, safety settings, and delay options for Windows OS cursor and keystroke automation.
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: configuration settings */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
            <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
              <MousePointer2 size={14} className="text-sky-400" />
              <span>Permission Safety Controls</span>
            </h3>

            {/* Mouse Toggle */}
            <div className="flex items-center justify-between py-1 border-b border-brand-border/30 pb-3">
              <div>
                <div className="text-xs font-semibold text-brand-textMain">Mouse Control Permission</div>
                <div className="text-[10px] text-brand-textMuted mt-0.5">Allows agent to move cursor and simulate clicks.</div>
              </div>
              <button
                onClick={() => setEnableMouse(!enableMouse)}
                className={`px-3 py-1 rounded-lg border text-xs transition-all ${
                  enableMouse 
                    ? 'border-sky-500/35 bg-sky-500/10 text-sky-400' 
                    : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-white/2'
                }`}
              >
                <span>{enableMouse ? 'Granted' : 'Blocked'}</span>
              </button>
            </div>

            {/* Keyboard Toggle */}
            <div className="flex items-center justify-between py-1 border-b border-brand-border/30 pb-3">
              <div>
                <div className="text-xs font-semibold text-brand-textMain">Keyboard Input Permission</div>
                <div className="text-[10px] text-brand-textMuted mt-0.5">Allows agent to type text and key combinations.</div>
              </div>
              <button
                onClick={() => setEnableKeyboard(!enableKeyboard)}
                className={`px-3 py-1 rounded-lg border text-xs transition-all ${
                  enableKeyboard 
                    ? 'border-sky-500/35 bg-sky-500/10 text-sky-400' 
                    : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-white/2'
                }`}
              >
                <span>{enableKeyboard ? 'Granted' : 'Blocked'}</span>
              </button>
            </div>

            {/* Action Delay */}
            <div className="space-y-1 pt-1">
              <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Safety Delay between Actions (ms)</label>
              <input
                type="number"
                value={actionDelay}
                onChange={(e) => setActionDelay(parseInt(e.target.value) || 250)}
                className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
              />
            </div>
          </div>
        </div>

        {/* Right: Live testing sandbox */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
            <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
              <Camera size={14} className="text-sky-400" />
              <span>Desktop Capture Preview</span>
            </h3>
            <p className="text-[11px] text-brand-textMuted">
              Test GDI+ screen capture mechanisms to ensure coordinates are matching.
            </p>

            <button
              onClick={handleCaptureScreen}
              disabled={capturing}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
            >
              {capturing ? <RefreshCw size={13} className="animate-spin" /> : <Camera size={13} />}
              <span>{capturing ? 'Capturing screen...' : 'Capture Screen Frame'}</span>
            </button>

            {capturedPath && (
              <div className="space-y-1 mt-2 animate-fade-in">
                <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Desktop Capture Frame</label>
                <div className="rounded-lg border border-brand-border overflow-hidden bg-brand-bg max-h-[220px]">
                  <img 
                    src={`file:///${capturedPath.replace(/\\/g, '/')}`} 
                    alt="Test screen capture"
                    className="w-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
