import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { invokeCommand } from '../tauriBridge';

export interface ArtifactManifest {
  name: string;
  description: string;
  version: string;
  artifact_type: string; // "web", "python", "node", "static"
  icon: string;
  entry: string;
}

export interface ArtifactRuntimeState {
  id: string;
  manifest: ArtifactManifest;
  status: 'stopped' | 'running' | 'starting' | 'error';
  port?: number;
  url?: string;
  path: string;
}

export const TrayCardApp: React.FC = () => {
  const [artifacts, setArtifacts] = useState<ArtifactRuntimeState[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchArtifacts = async () => {
    setLoading(true);
    try {
      const list = await invokeCommand<ArtifactRuntimeState[]>('artifact_list');
      setArtifacts(list || []);
    } catch (err) {
      console.warn('[ArtifactsList] Fallback sample micro-apps list loaded', err);
      setArtifacts([
        {
          id: 'quick-calc',
          manifest: {
            name: 'Quick Calculator',
            description: 'Glassmorphism dark scientific mini-calculator app',
            version: '1.0.0',
            artifact_type: 'static',
            icon: '🧮',
            entry: 'index.html',
          },
          status: 'stopped',
          path: '~/.superagent/artifact/quick-calc',
        },
        {
          id: 'scratchpad',
          manifest: {
            name: 'Super Scratchpad',
            description: 'Persistent local markdown notepad artifact app',
            version: '1.1.0',
            artifact_type: 'static',
            icon: '📝',
            entry: 'index.html',
          },
          status: 'stopped',
          path: '~/.superagent/artifact/scratchpad',
        },
        {
          id: 'system-dashboard',
          manifest: {
            name: 'Hardware Monitor',
            description: 'Live CPU & Memory telemetry app',
            version: '1.0.0',
            artifact_type: 'web',
            icon: '📊',
            entry: 'index.html',
          },
          status: 'running',
          port: 14692,
          url: 'http://localhost:14692',
          path: '~/.superagent/artifact/system-dashboard',
        },
        {
          id: 'code-sandbox',
          manifest: {
            name: 'Python Sandbox',
            description: 'Isolated code runner & compiler',
            version: '1.2.0',
            artifact_type: 'python',
            icon: '🐍',
            entry: 'main.py',
          },
          status: 'stopped',
          path: '~/.superagent/artifact/code-sandbox',
        },
        {
          id: 'mcp-inspector',
          manifest: {
            name: 'MCP Tool Suite',
            description: 'JSON-RPC protocol tool debugger',
            version: '2.0.0',
            artifact_type: 'node',
            icon: '⚡',
            entry: 'server.js',
          },
          status: 'running',
          port: 8080,
          url: 'http://localhost:8080',
          path: '~/.superagent/artifact/mcp-inspector',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtifacts();
  }, []);

  const handleLaunchApp = async (art: ArtifactRuntimeState) => {
    try {
      await invokeCommand('artifact_open', { id: art.id });
    } catch (err) {
      if (art.url) {
        window.open(art.url, '_blank');
      }
    }
  };

  const handleToggleRun = async (e: React.MouseEvent, art: ArtifactRuntimeState) => {
    e.stopPropagation();
    try {
      if (art.status === 'running') {
        await invokeCommand('artifact_stop', { id: art.id });
      } else {
        await invokeCommand('artifact_start', { id: art.id });
      }
      await fetchArtifacts();
    } catch (err) {
      setArtifacts((prev) =>
        prev.map((item) =>
          item.id === art.id
            ? { ...item, status: item.status === 'running' ? 'stopped' : 'running' }
            : item
        )
      );
    }
  };

  const handleDelete = async (e: React.MouseEvent, art: ArtifactRuntimeState) => {
    e.stopPropagation();
    if (!window.confirm(`Delete small app "${art.manifest.name}"?`)) return;
    try {
      await invokeCommand('artifact_delete', { id: art.id });
      await fetchArtifacts();
    } catch (err) {
      setArtifacts((prev) => prev.filter((item) => item.id !== art.id));
    }
  };

  const handleOpenFolder = async () => {
    try {
      await invokeCommand('artifact_open_folder');
    } catch (err) {
      console.error('Failed to open folder', err);
    }
  };

  const filtered = artifacts.filter(
    (a) =>
      a.manifest.name.toLowerCase().includes(search.toLowerCase()) ||
      a.manifest.description.toLowerCase().includes(search.toLowerCase())
  );

  const formatType = (type: string) => {
    if (type === 'python') return 'Py';
    if (type === 'node') return 'JS/Node';
    if (type === 'static' || type === 'web') return 'JS/HTML';
    return type.toUpperCase();
  };

  return (
    <div className="w-full h-full bg-[#0d0f17] text-slate-200 flex flex-col font-sans select-none overflow-hidden border border-slate-800 rounded-xl shadow-2xl">
      {/* Title Header */}
      <div className="px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">⚡</span>
          <h1 className="text-xs font-bold text-slate-100 tracking-wide">
            SuperAgent Artifacts
          </h1>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={fetchArtifacts}
            title="Refresh List"
            className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center active:scale-95"
          >
            🔄
          </button>
          <button
            onClick={handleOpenFolder}
            title="Open Apps Storage (~/.superagent/artifact)"
            className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center active:scale-95"
          >
            📁
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-3 py-1.5 bg-slate-900/40 border-b border-slate-800/40 relative flex items-center">
        <input
          type="text"
          placeholder="Filter artifacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-3 pr-7 py-1 bg-slate-900/90 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Simple List [Icon, App Name, JS/Py, Run/Stop, Open] */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loading && artifacts.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500 font-medium py-12">
            Loading artifacts...
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 py-12">
            <p className="text-xs text-slate-300 font-medium">No artifacts found</p>
          </div>
        ) : (
          filtered.map((art) => {
            const isRunning = art.status === 'running';

            return (
              <div
                key={art.id}
                className="bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2 group transition-all"
              >
                {/* Left: Icon + Name */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="text-base shrink-0">
                    {art.manifest.icon || '📦'}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-400 transition-colors">
                      {art.manifest.name}
                    </h2>
                  </div>
                </div>

                {/* Center: JS / Py Type Badge */}
                <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800/80 shrink-0">
                  {formatType(art.manifest.artifact_type)}
                </span>

                {/* Right Actions: Run/Stop + Open */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => handleToggleRun(e, art)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all active:scale-95 ${
                      isRunning
                        ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40'
                    }`}
                  >
                    {isRunning ? 'Stop' : 'Run'}
                  </button>

                  <button
                    onClick={() => handleLaunchApp(art)}
                    className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700 text-xs font-semibold transition-all active:scale-95"
                  >
                    Open
                  </button>

                  <button
                    onClick={(e) => handleDelete(e, art)}
                    title="Delete"
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-slate-900/90 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-medium">
        <span>Store: ~/.superagent/artifact</span>
        <span className="text-cyan-400 font-semibold">Artifacts List</span>
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<TrayCardApp />);
}
