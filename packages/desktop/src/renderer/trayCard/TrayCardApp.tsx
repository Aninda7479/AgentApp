import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ArtifactRuntimeState } from '@superagent/core';

// Safe IPC access for Electron context
const ipcRenderer = (window as any).require
  ? (window as any).require('electron').ipcRenderer
  : {
      invoke: async (channel: string) => {
        if (channel === 'artifact:list') {
          return [];
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

  const handleDelete = async (art: ArtifactRuntimeState) => {
    if (!window.confirm(`Delete artifact "${art.manifest.name}"?`)) return;
    try {
      await ipcRenderer.invoke('artifact:delete', art.id);
      await fetchArtifacts();
    } catch (err) {
      console.error('Failed to delete artifact', err);
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

  const renderArtifactIcon = (type: string) => {
    if (type === 'python') {
      return (
        <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      );
    }
    if (type === 'node') {
      return (
        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    );
  };

  return (
    <div className="w-full h-full bg-slate-950/95 text-slate-100 flex flex-col border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl font-sans">
      {/* Header */}
      <div className="px-4 py-3.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-8 h-8 rounded-lg shrink-0 shadow-md" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="sa-sky-header" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9ec7bd"/>
                <stop offset="48%" stopColor="#dce6cf"/>
                <stop offset="100%" stopColor="#f3cda4"/>
              </linearGradient>
              <radialGradient id="sa-glow-header" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff4dd" stopOpacity="0.85"/>
                <stop offset="100%" stopColor="#fff4dd" stopOpacity="0"/>
              </radialGradient>
              <clipPath id="sa-clip-header">
                <rect x="64" y="64" width="896" height="896" rx="224" ry="224"/>
              </clipPath>
            </defs>
            <rect x="64" y="64" width="896" height="896" rx="224" ry="224" fill="url(#sa-sky-header)"/>
            <g clipPath="url(#sa-clip-header)">
              <circle cx="512" cy="400" r="272" fill="url(#sa-glow-header)"/>
              <circle cx="512" cy="400" r="141" fill="#fff2d8"/>
              <path d="M620.8 294.4 q32 -32 64 0 q32 -32 64 0" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="29" strokeLinecap="round" fill="none"/>
              <path d="M755.2 352 q25.6 -25.6 51.2 0 q25.6 -25.6 51.2 0" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="25.6" strokeLinecap="round" fill="none"/>
              <path d="M64 672 C256 544 416 640 576 576 C736 512 864 608 960 576 L960 960 L64 960 Z" fill="#93b6ab"/>
              <path d="M64 768 C224 672 384 768 544 704 C704 640 864 736 960 704 L960 960 L64 960 Z" fill="#5f8a7e"/>
              <path d="M64 864 C192 800 352 864 512 832 C672 800 832 864 960 832 L960 960 L64 960 Z" fill="#2f5147"/>
            </g>
            <rect x="64" y="64" width="896" height="896" rx="224" ry="224" fill="none" stroke="#ffffff" strokeOpacity="0.13" strokeWidth="4"/>
          </svg>
          <div>
            <h1 className="text-xs font-bold text-slate-100 tracking-wide leading-tight">SuperAgent Artifacts</h1>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${runningCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {runningCount} {runningCount === 1 ? 'app' : 'apps'} active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={fetchArtifacts}
            title="Refresh List"
            className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800/80 hover:bg-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center active:scale-95"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleOpenFolder}
            title="Open Storage Directory"
            className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800/80 hover:bg-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center active:scale-95"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3.5 py-2.5 bg-slate-900/40 border-b border-slate-800/40 relative flex items-center">
        <svg className="w-3.5 h-3.5 text-slate-500 absolute left-6 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Filter mini-apps..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Artifact List */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {loading && artifacts.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500 font-medium">
            Loading micro-apps...
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-center mb-2.5 shadow-inner">
              <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-xs text-slate-300 font-medium">No artifacts found</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[220px] leading-normal">
              Ask SuperAgent AI in chat to generate a custom micro-app!
            </p>
          </div>
        ) : (
          filtered.map((art) => {
            const isRunning = art.status === 'running';
            const isStarting = art.status === 'starting';

            return (
              <div
                key={art.id}
                className="bg-slate-900/70 border border-slate-800/90 rounded-xl p-3.5 hover:border-slate-700/90 transition-all flex flex-col gap-3 group shadow-sm"
              >
                {/* Top Row: Icon, Title, Description, Status */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                      {renderArtifactIcon(art.manifest.type)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-400 transition-colors leading-tight">
                        {art.manifest.name}
                      </h2>
                      <p className="text-[11px] text-slate-400 truncate leading-normal mt-0.5">
                        {art.manifest.description}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-wide uppercase shrink-0 ${
                      isRunning
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : isStarting
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-slate-800/80 text-slate-400 border border-slate-700/50'
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

                {/* Bottom Row: Type Tag & Uniform Action Buttons */}
                <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/60">
                  <span className="text-[9px] font-mono font-semibold text-slate-500 uppercase px-2 py-0.5 rounded bg-slate-950/60 border border-slate-800/50 tracking-wider">
                    {art.manifest.type}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleRun(art)}
                      disabled={isStarting}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 ${
                        isRunning
                          ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30'
                      }`}
                    >
                      {isRunning ? (
                        <>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 6h12v12H6z" />
                          </svg>
                          Stop
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          Run
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleOpen(art)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800/90 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700/60 text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open
                    </button>

                    <button
                      onClick={() => handleDelete(art)}
                      title="Delete Artifact"
                      className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700/60 hover:border-rose-500/40 flex items-center justify-center transition-all active:scale-95"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-medium">
        <span>Store: ~/.superagent/artifact</span>
        <span className="text-cyan-400/90 font-semibold">
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
