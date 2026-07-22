import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ArtifactRuntimeState } from '@superagent/core';

// Safe IPC access for Electron context
const ipcRenderer = (window as any).require
  ? (window as any).require('electron').ipcRenderer
  : {
      invoke: async (channel: string, ...args: any[]) => {
        if (channel === 'artifact:list') {
          return [
            {
              id: 'quick-calc',
              manifest: {
                id: 'quick-calc',
                name: 'Quick Calculator',
                description: 'Glassmorphism dark scientific mini-calculator',
                version: '1.0.0',
                type: 'static',
                entry: 'index.html',
                port: 3080,
                createdAt: new Date().toISOString()
              },
              status: 'running',
              actualPort: 3080,
              url: 'http://127.0.0.1:3080'
            },
            {
              id: 'scratchpad',
              manifest: {
                id: 'scratchpad',
                name: 'Super Scratchpad',
                description: 'Persistent local markdown notepad artifact',
                version: '1.0.0',
                type: 'static',
                entry: 'index.html',
                port: 3081,
                createdAt: new Date().toISOString()
              },
              status: 'stopped'
            }
          ];
        }
        return [];
      },
      on: () => {},
      removeListener: () => {}
    };

export const TrayCardApp: React.FC = () => {
  const [artifacts, setArtifacts] = useState<ArtifactRuntimeState[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchArtifacts = async () => {
    setLoading(true);
    try {
      const list = await ipcRenderer.invoke('artifact:list');
      setArtifacts(list || []);
    } catch (err) {
      console.error('Failed to fetch artifacts', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtifacts();

    const handleStateChange = (_: any, updatedState: ArtifactRuntimeState) => {
      setArtifacts((prev) =>
        prev.map((item) => (item.id === updatedState.id ? updatedState : item))
      );
    };

    ipcRenderer.on('artifact:stateChanged', handleStateChange);
    return () => {
      ipcRenderer.removeListener('artifact:stateChanged', handleStateChange);
    };
  }, []);

  const handleToggleRun = async (art: ArtifactRuntimeState) => {
    try {
      if (art.status === 'running') {
        await ipcRenderer.invoke('artifact:stop', art.id);
      } else {
        await ipcRenderer.invoke('artifact:start', art.id);
      }
      await fetchArtifacts();
    } catch (err) {
      console.error('Failed to toggle artifact', err);
    }
  };

  const handleOpen = async (art: ArtifactRuntimeState) => {
    try {
      await ipcRenderer.invoke('artifact:open', art.id);
    } catch (err) {
      console.error('Failed to open artifact', err);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await ipcRenderer.invoke('artifact:openFolder');
    } catch (err) {
      console.error('Failed to open folder', err);
    }
  };

  const filtered = artifacts.filter(
    (a) =>
      a.manifest.name.toLowerCase().includes(search.toLowerCase()) ||
      a.manifest.description.toLowerCase().includes(search.toLowerCase())
  );

  const runningCount = artifacts.filter((a) => a.status === 'running').length;

  return (
    <div className="w-full h-full bg-slate-950/95 text-slate-100 flex flex-col border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl font-sans">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-md shadow-cyan-500/20">
            ⚡
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white leading-tight">SuperAgent Artifacts</h1>
            <p className="text-[10px] text-slate-400">
              {runningCount} {runningCount === 1 ? 'app' : 'apps'} running
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={fetchArtifacts}
            title="Refresh List"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            🔄
          </button>
          <button
            onClick={handleOpenFolder}
            title="Open Storage Directory"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            📁
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3 py-2 bg-slate-900/40 border-b border-slate-800/40">
        <input
          type="text"
          placeholder="Filter mini-apps..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
      </div>

      {/* Artifact List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading && artifacts.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500">
            Loading micro-apps...
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <span className="text-2xl mb-1 opacity-40">📦</span>
            <p className="text-xs text-slate-400 font-medium">No artifacts found</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Ask SuperAgent AI to create one in chat!
            </p>
          </div>
        ) : (
          filtered.map((art) => {
            const isRunning = art.status === 'running';
            const isStarting = art.status === 'starting';

            return (
              <div
                key={art.id}
                className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-3 hover:border-slate-700/80 transition-all flex flex-col gap-2 group"
              >
                {/* Top Row: Icon, Title, Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center text-base shrink-0">
                      {art.id === 'quick-calc' ? '🧮' : art.id === 'scratchpad' ? '📝' : '⚡'}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-400 transition-colors">
                        {art.manifest.name}
                      </h2>
                      <p className="text-[10px] text-slate-400 truncate leading-snug">
                        {art.manifest.description}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium shrink-0 ${
                      isRunning
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : isStarting
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700/50'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isRunning ? 'bg-emerald-400 animate-pulse' : isStarting ? 'bg-amber-400' : 'bg-slate-500'
                      }`}
                    />
                    {isRunning ? `:${art.actualPort}` : isStarting ? 'STARTING' : 'STOPPED'}
                  </span>
                </div>

                {/* Bottom Row: Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/50">
                  <span className="text-[9px] text-slate-500 uppercase font-semibold tracking-wider">
                    {art.manifest.type}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleRun(art)}
                      disabled={isStarting}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all ${
                        isRunning
                          ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30'
                      }`}
                    >
                      {isRunning ? '⏹ Stop' : '▶ Run'}
                    </button>

                    <button
                      onClick={() => handleOpen(art)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700/60 text-[11px] font-medium flex items-center gap-1 transition-all"
                    >
                      ↗ Open
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-slate-900/90 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
        <span>Global Store: ~/.superagent/artifact</span>
        <span className="text-cyan-400 font-medium hover:underline cursor-pointer">
          SuperAgent v0.1
        </span>
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<TrayCardApp />);
}
