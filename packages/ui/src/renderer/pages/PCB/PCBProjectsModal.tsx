import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Plus,
  Trash2,
  Copy,
  Cpu,
  Layers,
  MessageSquare,
  Clock,
  Search,
  X,
  ExternalLink,
  RefreshCw,
  FileCode2,
} from 'lucide-react';
import { PcbProjectMetadata, listPcbProjects, deletePcbProject } from '../../services/pcbService';

interface PCBProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId?: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onDuplicateProject?: (id: string) => void;
  triggerToast?: (message: string, type?: 'info' | 'error') => void;
}

export const PCBProjectsModal: React.FC<PCBProjectsModalProps> = ({
  isOpen,
  onClose,
  currentProjectId,
  onSelectProject,
  onNewProject,
  onDuplicateProject,
  triggerToast,
}) => {
  const [projects, setProjects] = useState<PcbProjectMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const list = await listPcbProjects();
      setProjects(list);
    } catch (err) {
      console.error('Failed to load PCB projects:', err);
      triggerToast?.('Failed to load past PCB projects', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      p.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  const handleDelete = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      await deletePcbProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      triggerToast?.(`Deleted project "${name}"`);
    } catch (err) {
      console.error('Delete failed:', err);
      triggerToast?.('Failed to delete project', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const formatTimestamp = (ts: number) => {
    if (!ts) return 'Unknown';
    const d = new Date(ts);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150 font-sans select-none">
      <div className="w-full max-w-2xl bg-[#161b22]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_16px_48px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                PCB Projects & Past Designs
              </h2>
              <p className="text-[11px] text-brand-textMuted font-mono">
                Saved in .superagent/pcb/ • {projects.length} designs available
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchProjects}
              disabled={loading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer"
              title="Refresh project list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar: Search + New Project Button */}
        <div className="px-6 py-3 border-b border-white/[0.07] bg-[#161b22]/50 flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-brand-textMuted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search designs by title, tags or chips..."
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-brand-textMuted/60 focus:outline-none focus:border-emerald-500/60"
            />
          </div>

          <button
            onClick={() => {
              onNewProject();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-950 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Design</span>
          </button>
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading && projects.length === 0 ? (
            <div className="py-16 text-center text-xs text-brand-textMuted flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400 opacity-60" />
              <span>Loading saved PCB designs from .superagent/pcb/...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-xs text-brand-textMuted space-y-2">
              <FileCode2 className="w-10 h-10 mx-auto opacity-30 text-emerald-400" />
              <p className="font-semibold text-white">No PCB designs found</p>
              <p className="text-[11px] max-w-sm mx-auto">
                {searchQuery ? `No designs match "${searchQuery}".` : 'Create a new design or prompt the AI Hardware Co-Pilot to synthesize your first circuit!'}
              </p>
              <button
                onClick={() => {
                  onNewProject();
                  onClose();
                }}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Start New Blank Design</span>
              </button>
            </div>
          ) : (
            filtered.map((proj) => {
              const isCurrent = proj.id === currentProjectId;
              return (
                <div
                  key={proj.id}
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 group ${
                    isCurrent
                      ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-950/20'
                      : 'bg-[#161b22]/70 hover:bg-[#161b22] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white tracking-wide truncate">
                        {proj.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-semibold border border-emerald-500/30">
                        {proj.revision || 'v0.1'}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono font-bold border border-blue-500/30">
                          Active Workspace
                        </span>
                      )}
                    </div>

                    {proj.description && (
                      <p className="text-[11px] text-brand-textMuted line-clamp-1">
                        {proj.description}
                      </p>
                    )}

                    {/* Meta stats pills */}
                    <div className="flex items-center gap-3 text-[10px] font-mono text-brand-textMuted pt-0.5">
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-emerald-400" />
                        {proj.components_count} parts
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3 text-blue-400" />
                        {proj.nets_count} nets
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3 text-purple-400" />
                        {proj.message_count} chats
                      </span>
                      <span className="flex items-center gap-1 text-brand-textMuted/70">
                        <Clock className="w-3 h-3 text-amber-400/70" />
                        {formatTimestamp(proj.updated_at)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onDuplicateProject && (
                      <button
                        onClick={() => onDuplicateProject(proj.id)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-white transition-colors cursor-pointer"
                        title="Duplicate Design"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(proj.id, proj.name)}
                      disabled={deletingId === proj.id}
                      className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-brand-textMuted hover:text-rose-300 transition-colors cursor-pointer"
                      title="Delete Project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        onSelectProject(proj.id);
                        onClose();
                      }}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-white/10 text-white hover:bg-white/20'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950'
                      }`}
                    >
                      <span>{isCurrent ? 'Current' : 'Open'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-white/10 bg-black/40 flex items-center justify-between text-[11px] text-brand-textMuted font-mono">
          <span>Storage engine: SuperAgent Core v2 Rust backend</span>
          <span>Directory: .superagent/pcb/</span>
        </div>

      </div>
    </div>
  );
};
