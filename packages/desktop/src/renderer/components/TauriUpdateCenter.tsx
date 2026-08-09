import React, { useState, useEffect } from 'react';
import { isTauriEnv } from '../tauriBridge';

export const TauriUpdateCenter: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error'>('idle');
  const [updateVersion, setUpdateVersion] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [pendingUpdate, setPendingUpdate] = useState<any>(null);

  const checkForUpdates = async () => {
    if (!isTauriEnv()) {
      setStatus('up-to-date');
      return;
    }

    setStatus('checking');
    setErrorMsg('');
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      
      if (update) {
        setPendingUpdate(update);
        setUpdateVersion(update.version);
        setStatus('available');
      } else {
        setStatus('up-to-date');
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const lowerMsg = errMsg.toLowerCase();
      
      // Gracefully handle dev environments or unreleased endpoints
      if (
        lowerMsg.includes('platform') ||
        lowerMsg.includes('none of') ||
        lowerMsg.includes('404') ||
        lowerMsg.includes('not found') ||
        lowerMsg.includes('could not fetch')
      ) {
        console.log('[TauriUpdateCenter] Endpoints/Platform not ready, treating as up-to-date');
        setStatus('up-to-date');
      } else {
        setStatus('error');
        setErrorMsg(errMsg || 'Failed to check for updates.');
      }
    }
  };

  const startDownloadAndInstall = async () => {
    if (!pendingUpdate) return;
    setStatus('downloading');
    setProgress(0);

    try {
      let downloaded = 0;
      let totalLength = 0;

      await pendingUpdate.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            totalLength = event.data.contentLength || 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (totalLength > 0) {
              const pct = Math.round((downloaded / totalLength) * 100);
              setProgress(pct);
            }
            break;
          case 'Finished':
            setProgress(100);
            setStatus('ready');
            break;
        }
      });
      setStatus('ready');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.message || 'Download failed');
    }
  };

  const relaunchApp = async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err: any) {
      console.error('[TauriUpdateCenter] Relaunch error:', err);
    }
  };

  useEffect(() => {
    checkForUpdates();
  }, []);

  return (
    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 max-w-md shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-200">SuperAgent Auto-Updater</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
          Tauri v2
        </span>
      </div>

      {status === 'checking' && (
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Checking GitHub releases for updates...</span>
        </div>
      )}

      {status === 'up-to-date' && (
        <div className="text-xs text-emerald-400 flex items-center space-x-1.5">
          <span>✓ SuperAgent is up to date.</span>
        </div>
      )}

      {status === 'available' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-300">
            A new version <strong className="text-indigo-400">v{updateVersion}</strong> is available!
          </p>
          <button
            onClick={startDownloadAndInstall}
            className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Download & Install Update
          </button>
        </div>
      )}

      {status === 'downloading' && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Downloading update...</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {status === 'ready' && (
        <div className="space-y-2">
          <p className="text-xs text-emerald-400">Update downloaded and verified!</p>
          <button
            onClick={relaunchApp}
            className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Relaunch Application Now
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-2">
          <p className="text-xs text-red-400">Update check failed: {errorMsg}</p>
          <button
            onClick={checkForUpdates}
            className="py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
          >
            Retry Check
          </button>
        </div>
      )}
    </div>
  );
};
