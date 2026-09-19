import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Trash2, FolderOpen, Image as ImageIcon, Film, FileText, Music, File, ChevronDown, ChevronRight, HardDrive } from 'lucide-react';
import { BrandLogo } from '../../BrandLogo';
import { getIpc } from '../../lib/ipc';

interface FolderInfo {
  path: string;
  label: string;
  size_bytes: number;
  file_count: number;
  last_modified: number;
}

interface ConversationFile {
  name: string;
  path: string;
  file_type: string;
  size_bytes: number;
  modified_at: number;
}

interface ConversationFileGroup {
  conversation_id: string;
  conversation_title: string;
  files: ConversationFile[];
}

interface MediaCounts {
  images: number;
  videos: number;
  audios: number;
  documents: number;
}

interface MemoryConversation {
  id: string;
  title: string;
  project: string | null;
  media_counts: MediaCounts;
  message_count: number;
  updated_at: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '—';
  const d = new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const CATEGORY_COLORS: Record<string, string> = {
  'Conversations': '#6366f1',
  'Artifacts': '#f59e0b',
  'Projects': '#10b981',
  'Memory': '#8b5cf6',
  'Models': '#ec4899',
  'Images': '#3b82f6',
  'Videos': '#ef4444',
  'Config': '#6b7280',
  'Binaries & Tools': '#14b8a6',
  'Other': '#94a3b8',
};

export const StorageSettings: React.FC = () => {
  const ipc = getIpc();
  
  const [loading, setLoading] = useState<boolean>(false);
  
  // Storage scan data
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [totalSize, setTotalSize] = useState<number>(0);
  
  // Projects expansion state
  const [projectsExpanded, setProjectsExpanded] = useState<boolean>(false);
  
  // Conv files data
  const [convFiles, setConvFiles] = useState<ConversationFileGroup[]>([]);
  const [fileSearch, setFileSearch] = useState<string>('');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('All');
  
  // Memory index data
  const [memoryConversations, setMemoryConversations] = useState<MemoryConversation[]>([]);
  const [totalMediaCount, setTotalMediaCount] = useState<number>(0);

  const fetchAllData = async () => {
    if (!ipc) return;
    setLoading(true);
    try {
      const scanResult: unknown = await ipc.invoke('storage:scan');
      const scanObj = (scanResult && typeof scanResult === 'object') ? (scanResult as Record<string, unknown>) : null;
      const scanData = (scanObj?.data && typeof scanObj.data === 'object' ? scanObj.data : scanObj) as {
        folders?: FolderInfo[];
        total_size_bytes?: number;
      } | null;

      if (scanData) {
        if (Array.isArray(scanData.folders)) {
          setFolders(scanData.folders);
        }
        if (typeof scanData.total_size_bytes === 'number') {
          setTotalSize(scanData.total_size_bytes);
        }
      }
      
      const cfResult: unknown = await ipc.invoke('storage:get-conversation-files');
      const cfObj = (cfResult && typeof cfResult === 'object') ? (cfResult as Record<string, unknown>) : null;
      const cfData = Array.isArray(cfResult) ? cfResult : (Array.isArray(cfObj?.data) ? cfObj.data : []);
      setConvFiles(cfData as ConversationFileGroup[]);
      
      const memResult: unknown = await ipc.invoke('storage:get-memory-index');
      const memObj = (memResult && typeof memResult === 'object') ? (memResult as Record<string, unknown>) : null;
      const memData = (memObj?.data && typeof memObj.data === 'object' ? memObj.data : memObj) as {
        conversations?: MemoryConversation[];
        total_media_count?: number;
      } | null;

      if (memData) {
        if (Array.isArray(memData.conversations)) {
          setMemoryConversations(memData.conversations);
        }
        if (typeof memData.total_media_count === 'number') {
          setTotalMediaCount(memData.total_media_count);
        }
      }
    } catch (err) {
      console.error('Failed to fetch storage data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleOpenFolder = async (path: string) => {
    if (!ipc) return;
    try {
      await ipc.invoke('storage:open-folder', { path });
    } catch (err) {
      console.error('Failed to open folder', err);
    }
  };

  const handleDeleteFile = async (path: string) => {
    if (!ipc) return;
    if (!window.confirm('Are you sure you want to delete this file?')) return;
    try {
      await ipc.invoke('storage:delete-file', { path });
      await fetchAllData();
    } catch (err) {
      console.error('Failed to delete file', err);
    }
  };

  // Process donut chart data
  const chartData = useMemo(() => {
    let totalMappedSize = 0;
    const segments = folders.map(f => {
      const color = CATEGORY_COLORS[f.label] || '#6b7280';
      return {
        label: f.label,
        size: f.size_bytes,
        color,
      };
    });
    
    const aggregated: Record<string, { size: number, color: string }> = {};
    for (const seg of segments) {
      if (!aggregated[seg.label]) {
        aggregated[seg.label] = { size: 0, color: seg.color };
      }
      aggregated[seg.label].size += seg.size;
    }
    
    const finalSegments = Object.entries(aggregated)
      .map(([label, { size, color }]) => ({ label, size, color }))
      .filter(s => s.size > 0)
      .sort((a, b) => b.size - a.size);
      
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    let currentOffset = 0;
    
    const svgSegments = finalSegments.map(seg => {
      const percentage = totalSize > 0 ? seg.size / totalSize : 0;
      const segmentLength = percentage * circumference;
      const remainingCircumference = circumference - segmentLength;
      
      const dasharray = `${segmentLength} ${remainingCircumference}`;
      const rotationDegrees = (currentOffset / circumference) * 360 - 90;
      
      currentOffset += segmentLength;
      
      return {
        ...seg,
        percentage: percentage * 100,
        dasharray,
        rotationDegrees
      };
    });
    
    return svgSegments;
  }, [folders, totalSize]);

  // Flatten and filter conversation files
  const filteredFiles = useMemo(() => {
    let all = [] as { file: ConversationFile, convId: string, convTitle: string }[];
    for (const group of convFiles) {
      for (const f of group.files) {
        all.push({ file: f, convId: group.conversation_id, convTitle: group.conversation_title });
      }
    }
    
    if (fileSearch) {
      const lowerQ = fileSearch.toLowerCase();
      all = all.filter(item => 
        item.file.name.toLowerCase().includes(lowerQ) || 
        item.convTitle.toLowerCase().includes(lowerQ)
      );
    }
    
    if (fileTypeFilter !== 'All') {
      const f = fileTypeFilter.toLowerCase();
      all = all.filter(item => {
        const type = item.file.file_type.toLowerCase();
        if (f === 'images') return type.includes('image');
        if (f === 'videos') return type.includes('video') || type.includes('mp4');
        if (f === 'pdfs') return type.includes('pdf');
        if (f === 'documents') return type.includes('doc') || type.includes('txt') || type.includes('text');
        if (f === 'audio') return type.includes('audio') || type.includes('mp3') || type.includes('wav');
        if (f === 'other') return !['image', 'video', 'pdf', 'doc', 'txt', 'audio'].some(k => type.includes(k));
        return true;
      });
    }
    
    return all;
  }, [convFiles, fileSearch, fileTypeFilter]);

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('image')) return <ImageIcon size={16} />;
    if (t.includes('video') || t.includes('mp4')) return <Film size={16} />;
    if (t.includes('audio') || t.includes('mp3')) return <Music size={16} />;
    if (t.includes('pdf') || t.includes('doc') || t.includes('txt')) return <FileText size={16} />;
    return <File size={16} />;
  };

  return (
    <div className="max-w-[680px] text-left">
      {/* Brand Hero */}
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
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">Storage Explorer</h1>
            <p className="mt-1 text-sm leading-6 text-brand-textMuted">
              Manage and analyze disk usage for conversations, artifacts, projects, and memory data.
            </p>
          </div>
        </div>
      </div>

      {/* Section A: Total Usage Overview */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-brand-textMain">Total Usage Overview</h3>
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-brand-textMuted hover:text-brand-textMain disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Rescan
          </button>
        </div>
        <div className="rounded-lg border border-brand-border bg-brand-card p-6 flex flex-col md:flex-row items-center gap-8">
          <div className="relative w-[200px] h-[200px] shrink-0">
            <svg viewBox="0 0 200 200" className="w-full h-full transform">
              {/* Background circle */}
              <circle
                cx="100" cy="100" r="80"
                fill="none"
                stroke="var(--color-brand-border)"
                strokeWidth="30"
              />
              {/* Chart segments */}
              {chartData.map((seg, i) => (
                <circle
                  key={i}
                  cx="100" cy="100" r="80"
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="30"
                  strokeDasharray={seg.dasharray}
                  strokeDashoffset="0"
                  transform={`rotate(${seg.rotationDegrees} 100 100)`}
                  className="transition-all duration-1000 ease-out"
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-semibold text-brand-textMain font-outfit">{formatBytes(totalSize)}</span>
              <span className="text-xs text-brand-textMuted">Total Used</span>
            </div>
          </div>
          
          <div className="flex-1 grid grid-cols-2 gap-4 w-full">
            {chartData.map((seg, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-brand-textMain truncate">{seg.label}</div>
                  <div className="text-xs text-brand-textMuted flex justify-between">
                    <span>{formatBytes(seg.size)}</span>
                    <span>{seg.percentage.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section B: Folder Breakdown Table */}
      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Folder Breakdown</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card overflow-hidden">
          {folders.length === 0 ? (
            <div className="p-8 text-center text-sm text-brand-textMuted">
              {loading ? 'Scanning storage...' : 'No folders discovered.'}
            </div>
          ) : (
            <div className="divide-y divide-brand-border">
              {folders.filter(f => !f.label.startsWith('Project: ')).map(folder => {
              const isProjects = folder.label === 'Projects';
              const subFolders = isProjects ? folders.filter(f => f.label.startsWith('Project: ')) : [];
              
              return (
                <React.Fragment key={folder.path}>
                  <div 
                    className={`flex items-center justify-between p-4 gap-4 ${isProjects ? 'cursor-pointer hover:bg-brand-hover' : ''}`}
                    onClick={() => isProjects && setProjectsExpanded(!projectsExpanded)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isProjects ? (
                        projectsExpanded ? <ChevronDown size={18} className="text-brand-textMuted" /> : <ChevronRight size={18} className="text-brand-textMuted" />
                      ) : (
                        <FolderOpen size={18} className="text-brand-textMuted" />
                      )}
                      <div className="text-sm font-semibold text-brand-textMain truncate">{folder.label}</div>
                      <span className="text-[10px] bg-brand-bg text-brand-textMuted px-2 py-0.5 rounded-full font-medium shrink-0">
                        {folder.file_count} files
                      </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-sm font-medium text-brand-textMain">{formatBytes(folder.size_bytes)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenFolder(folder.path); }}
                        className="p-1.5 text-brand-textMuted hover:text-brand-textMain hover:bg-brand-bg rounded transition-colors"
                        title="Open Folder"
                      >
                        <FolderOpen size={15} />
                      </button>
                    </div>
                  </div>
                  {isProjects && projectsExpanded && subFolders.map(sub => (
                    <div key={sub.path} className="flex items-center justify-between p-3 pl-10 gap-4 bg-brand-bg/30 border-t border-brand-border/50">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FolderOpen size={16} className="text-brand-textMuted" />
                        <div className="text-sm text-brand-textMain truncate">{sub.label.replace('Project: ', '')}</div>
                        <span className="text-[10px] bg-brand-bg text-brand-textMuted px-2 py-0.5 rounded-full font-medium shrink-0">
                          {sub.file_count} files
                        </span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="text-xs font-medium text-brand-textMuted">{formatBytes(sub.size_bytes)}</span>
                        <button
                          onClick={() => handleOpenFolder(sub.path)}
                          className="p-1.5 text-brand-textMuted hover:text-brand-textMain hover:bg-brand-bg rounded transition-colors"
                          title="Open Folder"
                        >
                          <FolderOpen size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </React.Fragment>
              );
            })}
            </div>
          )}
        </div>
      </section>

      {/* Section C: Conversation Files Browser */}
      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Conversation Files</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <select
              value={fileTypeFilter}
              onChange={(e) => setFileTypeFilter(e.target.value)}
              className="rounded border border-brand-border bg-brand-bg px-3 py-1.5 text-sm text-brand-textMain outline-none focus:border-brand-accent shrink-0"
            >
              <option value="All">All Types</option>
              <option value="Images">Images</option>
              <option value="Videos">Videos</option>
              <option value="PDFs">PDFs</option>
              <option value="Documents">Documents</option>
              <option value="Audio">Audio</option>
              <option value="Other">Other</option>
            </select>
            <input
              type="text"
              placeholder="Search files..."
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
              className="flex-1 rounded border border-brand-border bg-brand-bg px-3 py-1.5 text-sm text-brand-textMain outline-none focus:border-brand-accent"
            />
          </div>
          
          {filteredFiles.length === 0 ? (
            <div className="py-10 text-center text-sm text-brand-textMuted border border-dashed border-brand-border rounded-lg">
              No files found in conversations.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredFiles.map((item, i) => (
                <div key={i} className="flex flex-col gap-2 p-3 rounded-lg border border-brand-border bg-brand-bg relative group overflow-hidden">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 text-brand-accent shrink-0">
                      {getFileIcon(item.file.file_type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-brand-textMain truncate" title={item.file.name}>
                        {item.file.name}
                      </div>
                      <div className="text-xs text-brand-textMuted truncate mt-0.5" title={item.convTitle}>
                        {item.convTitle}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] bg-brand-card border border-brand-border text-brand-textMuted px-1.5 py-0.5 rounded font-medium truncate max-w-[60%]">
                      {item.file.file_type}
                    </span>
                    <span className="text-xs font-medium text-brand-textMain">{formatBytes(item.file.size_bytes)}</span>
                  </div>
                  
                  {/* Hover actions */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-brand-bg/90 backdrop-blur-sm rounded p-0.5 shadow-sm">
                    <button
                      onClick={() => handleOpenFolder(item.file.path)}
                      className="p-1.5 text-brand-textMuted hover:text-brand-textMain rounded transition-colors"
                      title="Open containing folder"
                    >
                      <FolderOpen size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteFile(item.file.path)}
                      className="p-1.5 text-brand-textMuted hover:text-destructive rounded transition-colors"
                      title="Delete file"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Section D: Memory Index */}
      <section className="mb-6">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Memory Index</h3>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="rounded-lg border border-brand-border bg-brand-card p-4 flex items-center gap-4">
            <div className="p-2.5 bg-brand-accent/10 text-brand-accent rounded-full">
              <HardDrive size={20} />
            </div>
            <div>
              <div className="text-xl font-semibold font-outfit text-brand-textMain">{memoryConversations.length}</div>
              <div className="text-xs text-brand-textMuted">Conversations with Media</div>
            </div>
          </div>
          <div className="rounded-lg border border-brand-border bg-brand-card p-4 flex items-center gap-4">
            <div className="p-2.5 bg-constructive/10 text-constructive rounded-full">
              <File size={20} />
            </div>
            <div>
              <div className="text-xl font-semibold font-outfit text-brand-textMain">{totalMediaCount}</div>
              <div className="text-xs text-brand-textMuted">Total Media Files Indexed</div>
            </div>
          </div>
        </div>

        {/* List of conversations */}
        <div className="rounded-lg border border-brand-border bg-brand-card overflow-hidden">
          {memoryConversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-brand-textMuted">
              No media found in memory index.
            </div>
          ) : (
            <div className="divide-y divide-brand-border max-h-[400px] overflow-y-auto">
              {memoryConversations.map(conv => (
                <div key={conv.id} className="flex items-center justify-between p-4 gap-4 hover:bg-brand-bg transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-brand-textMain truncate">{conv.title}</div>
                    <div className="text-xs text-brand-textMuted mt-0.5">
                      {conv.project ? `Project: ${conv.project}` : 'No Project'} • {formatDate(conv.updated_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {conv.media_counts.images > 0 && (
                      <div className="flex items-center gap-1 text-xs font-medium text-brand-textMuted" title="Images">
                        <ImageIcon size={13} /> {conv.media_counts.images}
                      </div>
                    )}
                    {conv.media_counts.videos > 0 && (
                      <div className="flex items-center gap-1 text-xs font-medium text-brand-textMuted" title="Videos">
                        <Film size={13} /> {conv.media_counts.videos}
                      </div>
                    )}
                    {conv.media_counts.documents > 0 && (
                      <div className="flex items-center gap-1 text-xs font-medium text-brand-textMuted" title="Documents">
                        <FileText size={13} /> {conv.media_counts.documents}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

    </div>
  );
};
