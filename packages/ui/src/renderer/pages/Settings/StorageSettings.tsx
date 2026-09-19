import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw,
  Trash2,
  FolderOpen,
  Image as ImageIcon,
  Film,
  FileText,
  Music,
  File,
  ChevronRight,
  HardDrive,
  Blocks,
  Terminal,
  Settings as SettingsIcon,
  MessageSquare,
  Cpu,
  Box,
  Layers,
  Search,
  Download,
  Eye,
  X,
  ArrowLeft,
  Grid,
  List,
  Folder,
  Copy,
  Check,
  Code,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react';
import { BrandLogo } from '../../BrandLogo';
import { getIpc, getCoreApiBaseUrl } from '../../lib/ipc';

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface DomainInfo {
  id: string;
  label: string;
  path: string;
  size_bytes: number;
  file_count: number;
  last_modified: number;
  description: string;
  color: string;
  icon: string;
}

interface FileEntry {
  name: string;
  path: string;
  relative_path: string;
  domain?: string;
  file_type: string;
  extension: string;
  size_bytes: number;
  modified_at: number;
  is_dir: boolean;
}

function getDomainBadgeColor(domain?: string): { bg: string; text: string } {
  switch (domain?.toLowerCase()) {
    case 'images':
      return { bg: 'bg-blue-500/15', text: 'text-blue-500' };
    case 'videos':
      return { bg: 'bg-rose-500/15', text: 'text-rose-500' };
    case 'conversation':
      return { bg: 'bg-indigo-500/15', text: 'text-indigo-400' };
    case 'artifacts':
      return { bg: 'bg-amber-500/15', text: 'text-amber-500' };
    case 'config':
      return { bg: 'bg-gray-500/15', text: 'text-gray-400' };
    case 'bin':
      return { bg: 'bg-teal-500/15', text: 'text-teal-400' };
    case 'engines':
      return { bg: 'bg-violet-500/15', text: 'text-violet-400' };
    case 'models':
      return { bg: 'bg-pink-500/15', text: 'text-pink-500' };
    case 'pcb':
      return { bg: 'bg-emerald-500/15', text: 'text-emerald-500' };
    default:
      return { bg: 'bg-brand-border/40', text: 'text-brand-textMuted' };
  }
}

interface MediaCounts {
  images: number;
  videos: number;
  audios: number;
  documents: number;
}

interface ConversationMeta {
  id: string;
  title: string;
  project: string | null;
  media_counts: MediaCounts;
  message_count: number;
  updated_at: number;
}

interface PcbProjectMeta {
  id: string;
  name: string;
  revision: string;
  description?: string;
  created_at: number;
  updated_at: number;
  components_count: number;
  nets_count: number;
  message_count: number;
  tags: string[];
}

// ─── Utility Functions ───────────────────────────────────────────────────────

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
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDomainIcon(iconName: string, size = 20) {
  switch (iconName) {
    case 'Blocks':
      return <Blocks size={size} />;
    case 'Terminal':
      return <Terminal size={size} />;
    case 'Settings':
      return <SettingsIcon size={size} />;
    case 'MessageSquare':
      return <MessageSquare size={size} />;
    case 'Cpu':
      return <Cpu size={size} />;
    case 'Image':
      return <ImageIcon size={size} />;
    case 'Box':
      return <Box size={size} />;
    case 'Layers':
      return <Layers size={size} />;
    case 'Film':
      return <Film size={size} />;
    default:
      return <HardDrive size={size} />;
  }
}

function getFileTypeIcon(type: string, size = 16) {
  switch (type.toLowerCase()) {
    case 'folder':
      return <Folder size={size} className="text-amber-500" />;
    case 'image':
      return <ImageIcon size={size} className="text-blue-500" />;
    case 'video':
      return <Film size={size} className="text-rose-500" />;
    case 'audio':
      return <Music size={size} className="text-violet-500" />;
    case 'code':
      return <Code size={size} className="text-emerald-500" />;
    case 'config':
      return <SettingsIcon size={size} className="text-amber-400" />;
    case 'model':
      return <Box size={size} className="text-pink-500" />;
    case 'pcb':
      return <Layers size={size} className="text-teal-500" />;
    case 'document':
      return <FileText size={size} className="text-indigo-400" />;
    case 'binary':
      return <Terminal size={size} className="text-cyan-500" />;
    default:
      return <File size={size} className="text-brand-textMuted" />;
  }
}

export const StorageSettings: React.FC = () => {
  const ipc = getIpc();

  // Overview State
  const [loading, setLoading] = useState<boolean>(false);
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [totalSizeBytes, setTotalSizeBytes] = useState<number>(0);
  const [totalFilesCount, setTotalFilesCount] = useState<number>(0);

  // Deep-Dive Navigation State
  const [activeDomain, setActiveDomain] = useState<DomainInfo | null>(null);
  const [currentBrowsePath, setCurrentBrowsePath] = useState<string>('');
  const [parentBrowsePath, setParentBrowsePath] = useState<string | null>(null);
  const [domainFiles, setDomainFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [recursiveDomainView, setRecursiveDomainView] = useState<boolean>(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');
  const [sizeFilter, setSizeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Media & Files Gallery (Main Page) State
  const [mediaFiles, setMediaFiles] = useState<FileEntry[]>([]);
  const [mediaLoading, setMediaLoading] = useState<boolean>(false);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>('media');
  const [mediaDomainFilter, setMediaDomainFilter] = useState<string>('all');
  const [mediaSizeFilter, setMediaSizeFilter] = useState<string>('all');
  const [mediaSearchQuery, setMediaSearchQuery] = useState<string>('');
  const [mediaSortBy, setMediaSortBy] = useState<'date' | 'size' | 'name'>('date');
  const [mediaSortOrder, setMediaSortOrder] = useState<'asc' | 'desc'>('desc');
  const [mediaViewMode, setMediaViewMode] = useState<'grid' | 'table'>('grid');

  // Conversations & Projects Modal
  const [showConvModal, setShowConvModal] = useState<boolean>(false);
  const [convModalTab, setConvModalTab] = useState<'chats' | 'pcb'>('chats');
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [pcbProjects, setPcbProjects] = useState<PcbProjectMeta[]>([]);
  const [convSearch, setConvSearch] = useState<string>('');

  // Preview Modal
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<boolean>(false);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchMediaFiles = useCallback(async () => {
    if (!ipc) return;
    setMediaLoading(true);
    try {
      const payload: Record<string, unknown> = {
        recursive: true,
        limit: 10000,
        sort_by: mediaSortBy,
        sort_order: mediaSortOrder,
      };

      if (mediaTypeFilter !== 'all_types') {
        payload.file_type = mediaTypeFilter;
      }
      if (mediaDomainFilter !== 'all') {
        payload.domain = mediaDomainFilter;
      }
      if (mediaSearchQuery.trim()) {
        payload.search = mediaSearchQuery.trim();
      }

      const res: unknown = await ipc.invoke('storage:list-files', payload);
      const resObj =
        res && typeof res === 'object'
          ? (res as Record<string, unknown>)
          : null;
      const listData = (
        resObj?.data && typeof resObj.data === 'object'
          ? resObj.data
          : resObj
      ) as {
        files?: FileEntry[];
      } | null;

      if (listData?.files) {
        setMediaFiles(listData.files);
      }
    } catch (err) {
      console.error('Failed to fetch media files', err);
    } finally {
      setMediaLoading(false);
    }
  }, [
    ipc,
    mediaTypeFilter,
    mediaDomainFilter,
    mediaSearchQuery,
    mediaSortBy,
    mediaSortOrder,
  ]);

  const fetchOverviewData = useCallback(async () => {
    if (!ipc) return;
    setLoading(true);
    try {
      const scanRes: unknown = await ipc.invoke('storage:scan');
      const scanObj =
        scanRes && typeof scanRes === 'object'
          ? (scanRes as Record<string, unknown>)
          : null;
      const data = (
        scanObj?.data && typeof scanObj.data === 'object'
          ? scanObj.data
          : scanObj
      ) as {
        domains?: DomainInfo[];
        total_size_bytes?: number;
        total_files?: number;
      } | null;

      if (data) {
        if (Array.isArray(data.domains)) {
          setDomains(data.domains);
        }
        if (typeof data.total_size_bytes === 'number') {
          setTotalSizeBytes(data.total_size_bytes);
        }
        if (typeof data.total_files === 'number') {
          setTotalFilesCount(data.total_files);
        }
      }

      // Pre-fetch conversations and projects index
      const memRes: unknown = await ipc.invoke('storage:get-memory-index');
      const memObj =
        memRes && typeof memRes === 'object'
          ? (memRes as Record<string, unknown>)
          : null;
      const memData = (
        memObj?.data && typeof memObj.data === 'object' ? memObj.data : memObj
      ) as {
        conversations?: ConversationMeta[];
        pcb_projects?: PcbProjectMeta[];
      } | null;

      if (memData) {
        if (Array.isArray(memData.conversations)) {
          setConversations(memData.conversations);
        }
        if (Array.isArray(memData.pcb_projects)) {
          setPcbProjects(memData.pcb_projects);
        }
      }

      // Also refresh media
      fetchMediaFiles();
    } catch (err) {
      console.error('Failed to load storage overview', err);
    } finally {
      setLoading(false);
    }
  }, [ipc, fetchMediaFiles]);

  const fetchDomainFiles = useCallback(
    async (domainId: string, pathOverride?: string) => {
      if (!ipc) return;
      setFilesLoading(true);
      try {
        const payload: Record<string, unknown> = {
          domain: domainId,
          sort_by: sortBy,
          sort_order: sortOrder,
          limit: 10000,
        };
        if (searchQuery.trim()) {
          payload.search = searchQuery.trim();
          payload.recursive = true;
          if (activeDomain) {
            payload.path = activeDomain.path;
          }
        } else if (recursiveDomainView) {
          payload.recursive = true;
          if (pathOverride) {
            payload.path = pathOverride;
          }
        } else if (pathOverride) {
          payload.path = pathOverride;
        }

        if (fileTypeFilter !== 'all') {
          payload.file_type = fileTypeFilter;
          payload.recursive = true;
        }

        const res: unknown = await ipc.invoke('storage:list-files', payload);
        const resObj =
          res && typeof res === 'object'
            ? (res as Record<string, unknown>)
            : null;
        const listData = (
          resObj?.data && typeof resObj.data === 'object'
            ? resObj.data
            : resObj
        ) as {
          files?: FileEntry[];
          current_path?: string;
          parent_path?: string | null;
        } | null;

        if (listData) {
          setDomainFiles(listData.files || []);
          if (listData.current_path) {
            setCurrentBrowsePath(listData.current_path);
          }
          setParentBrowsePath(listData.parent_path || null);
        }
      } catch (err) {
        console.error('Failed to list domain files', err);
      } finally {
        setFilesLoading(false);
      }
    },
    [
      ipc,
      sortBy,
      sortOrder,
      searchQuery,
      fileTypeFilter,
      recursiveDomainView,
      activeDomain,
    ]
  );

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  useEffect(() => {
    fetchMediaFiles();
  }, [fetchMediaFiles]);

  useEffect(() => {
    if (activeDomain) {
      fetchDomainFiles(activeDomain.id, currentBrowsePath || undefined);
    }
  }, [activeDomain, currentBrowsePath, fetchDomainFiles]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleSelectDomain = (domain: DomainInfo) => {
    setActiveDomain(domain);
    setCurrentBrowsePath(domain.path);
    setSearchQuery('');
    setFileTypeFilter('all');
  };

  const handleBackToOverview = () => {
    setActiveDomain(null);
    setCurrentBrowsePath('');
    setParentBrowsePath(null);
    setDomainFiles([]);
    fetchOverviewData();
  };

  const handleNavigateUp = () => {
    if (parentBrowsePath && activeDomain) {
      setCurrentBrowsePath(parentBrowsePath);
    }
  };

  const handleFolderClick = (file: FileEntry) => {
    if (file.is_dir && activeDomain) {
      setCurrentBrowsePath(file.path);
    }
  };

  const handleDeleteFile = async (file: FileEntry) => {
    if (!ipc) return;
    if (
      !window.confirm(
        `Are you sure you want to delete "${file.name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await ipc.invoke('storage:delete-file', { path: file.path });
      if (previewFile?.path === file.path) {
        setPreviewFile(null);
      }
      if (activeDomain) {
        fetchDomainFiles(activeDomain.id, currentBrowsePath);
      } else {
        fetchMediaFiles();
      }
      fetchOverviewData();
    } catch (err) {
      console.error('Failed to delete file', err);
    }
  };

  const handleOpenFilePreview = async (file: FileEntry) => {
    setPreviewFile(file);
    setPreviewText(null);
    setCopiedText(false);

    const type = file.file_type.toLowerCase();
    if (
      type === 'code' ||
      type === 'config' ||
      type === 'document' ||
      file.extension === 'json' ||
      file.extension === 'md' ||
      file.extension === 'txt' ||
      file.extension === 'log'
    ) {
      setPreviewLoading(true);
      try {
        const textRes: unknown = await ipc.invoke('storage:read-text-file', {
          path: file.path,
          max_bytes: 512 * 1024,
        });
        const textObj =
          textRes && typeof textRes === 'object'
            ? (textRes as Record<string, unknown>)
            : null;
        const textData = (
          textObj?.data && typeof textObj.data === 'object'
            ? textObj.data
            : textObj
        ) as { content?: string } | null;
        if (textData?.content !== undefined) {
          setPreviewText(textData.content);
        }
      } catch (err) {
        console.error('Failed to read text preview', err);
        setPreviewText('Unable to read text preview.');
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  const getFileStreamUrl = (filePath: string, download = false): string => {
    const base = getCoreApiBaseUrl();
    const encoded = encodeURIComponent(filePath);
    return `${base}/api/storage/file?path=${encoded}${download ? '&download=true' : ''}`;
  };

  const handleDownloadFile = (file: FileEntry) => {
    const url = getFileStreamUrl(file.path, true);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ─── Filtered Domain Files ─────────────────────────────────────────────────

  const filteredFiles = useMemo(() => {
    return domainFiles.filter((f) => {
      if (sizeFilter === '<1mb' && f.size_bytes >= 1024 * 1024) return false;
      if (
        sizeFilter === '1-50mb' &&
        (f.size_bytes < 1024 * 1024 || f.size_bytes > 50 * 1024 * 1024)
      )
        return false;
      if (
        sizeFilter === '50-500mb' &&
        (f.size_bytes < 50 * 1024 * 1024 || f.size_bytes > 500 * 1024 * 1024)
      )
        return false;
      if (sizeFilter === '>500mb' && f.size_bytes <= 500 * 1024 * 1024)
        return false;
      return true;
    });
  }, [domainFiles, sizeFilter]);

  // ─── Filtered Media Files (Main Page) ───────────────────────────────────────

  const filteredMediaFiles = useMemo(() => {
    return mediaFiles.filter((f) => {
      if (mediaSizeFilter === '<1mb' && f.size_bytes >= 1024 * 1024) return false;
      if (
        mediaSizeFilter === '1-50mb' &&
        (f.size_bytes < 1024 * 1024 || f.size_bytes > 50 * 1024 * 1024)
      )
        return false;
      if (
        mediaSizeFilter === '50-500mb' &&
        (f.size_bytes < 50 * 1024 * 1024 || f.size_bytes > 500 * 1024 * 1024)
      )
        return false;
      if (mediaSizeFilter === '>500mb' && f.size_bytes <= 500 * 1024 * 1024)
        return false;
      return true;
    });
  }, [mediaFiles, mediaSizeFilter]);

  // Filtered Conversations / PCB
  const filteredConversations = useMemo(() => {
    if (!convSearch.trim()) return conversations;
    const q = convSearch.toLowerCase();
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.project && c.project.toLowerCase().includes(q))
    );
  }, [conversations, convSearch]);

  const filteredPcbProjects = useMemo(() => {
    if (!convSearch.trim()) return pcbProjects;
    const q = convSearch.toLowerCase();
    return pcbProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [pcbProjects, convSearch]);

  return (
    <div className="max-w-[1020px] text-left pb-16">
      {/* ─── Header & Top Actions ─────────────────────────────────────────── */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-sm">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 90% at 82% -10%, var(--brand-atmo-glow), transparent 60%)',
            }}
          />
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="animate-float shrink-0">
              <BrandLogo size={44} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-outfit text-2xl font-bold tracking-tight text-brand-textMain">
                  Storage Explorer
                </h1>
                <span className="rounded-full bg-brand-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-brand-accent">
                  Pro
                </span>
              </div>
              <p className="mt-0.5 text-xs text-brand-textMuted">
                High-density storage control center with deep-dive inspection, media playback, and direct exports.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowConvModal(true)}
              className="flex items-center gap-2 rounded-xl border border-brand-border bg-brand-bg/80 px-3.5 py-2 text-xs font-semibold text-brand-textMain hover:bg-brand-hover hover:border-brand-accent/40 transition-all shadow-xs"
            >
              <MessageSquare size={14} className="text-brand-accent" />
              <span>Chats & Projects</span>
              <span className="ml-1 rounded-full bg-brand-card px-1.5 py-0.2 text-[10px] text-brand-textMuted border border-brand-border">
                {conversations.length + pcbProjects.length}
              </span>
            </button>

            <button
              onClick={fetchOverviewData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-brand-border bg-brand-card px-3 py-2 text-xs font-semibold text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover disabled:opacity-50 transition-colors shadow-xs"
              title="Rescan disk usage"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Rescan</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Top Storage Metric Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-brand-border bg-brand-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-brand-textMuted">
            <span>Total Used</span>
            <HardDrive size={14} className="text-brand-accent" />
          </div>
          <div className="mt-2 font-outfit text-2xl font-bold text-brand-textMain">
            {formatBytes(totalSizeBytes)}
          </div>
          <div className="mt-0.5 text-[11px] text-brand-textMuted">
            Across 9 storage domains
          </div>
        </div>

        <div className="rounded-xl border border-brand-border bg-brand-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-brand-textMuted">
            <span>Total Files</span>
            <FileText size={14} className="text-indigo-400" />
          </div>
          <div className="mt-2 font-outfit text-2xl font-bold text-brand-textMain">
            {totalFilesCount.toLocaleString()}
          </div>
          <div className="mt-0.5 text-[11px] text-brand-textMuted">
            Indexed assets & configs
          </div>
        </div>

        <div className="rounded-xl border border-brand-border bg-brand-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-brand-textMuted">
            <span>Active Domains</span>
            <Layers size={14} className="text-emerald-400" />
          </div>
          <div className="mt-2 font-outfit text-2xl font-bold text-brand-textMain">
            {domains.length}
          </div>
          <div className="mt-0.5 text-[11px] text-brand-textMuted">
            First-class categories
          </div>
        </div>

        <div className="rounded-xl border border-brand-border bg-brand-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-brand-textMuted">
            <span>Conversations</span>
            <MessageSquare size={14} className="text-pink-400" />
          </div>
          <div className="mt-2 font-outfit text-2xl font-bold text-brand-textMain">
            {conversations.length}
          </div>
          <div className="mt-0.5 text-[11px] text-brand-textMuted">
            Saved history threads
          </div>
        </div>
      </div>

      {/* ─── Conditional: Overview or Deep-Dive ────────────────────────────── */}
      {!activeDomain ? (
        <>
          {/* ────────────────── OVERVIEW DASHBOARD ────────────────── */}
          <section>
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <h2 className="text-base font-bold text-brand-textMain">
                Storage Domains
              </h2>
              <p className="text-xs text-brand-textMuted">
                Select any domain to launch its deep-dive file explorer, view subfolders, and stream media.
              </p>
            </div>
          </div>

          {domains.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand-border p-12 text-center text-sm text-brand-textMuted">
              {loading ? 'Analyzing storage...' : 'No storage domains discovered.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {domains.map((dom) => {
                const percentage =
                  totalSizeBytes > 0
                    ? ((dom.size_bytes / totalSizeBytes) * 100).toFixed(1)
                    : '0';

                return (
                  <div
                    key={dom.id}
                    onClick={() => handleSelectDomain(dom)}
                    className="group relative flex flex-col justify-between rounded-xl border border-brand-border bg-brand-card p-4.5 cursor-pointer hover:border-brand-accent/50 hover:bg-brand-hover transition-all duration-200 shadow-xs hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-lg shadow-2xs"
                          style={{
                            backgroundColor: `${dom.color}20`,
                            color: dom.color,
                          }}
                        >
                          {getDomainIcon(dom.icon, 18)}
                        </div>
                        <div className="flex items-center gap-1 text-xs font-semibold text-brand-textMuted group-hover:text-brand-accent transition-colors">
                          <span>Deep-Dive</span>
                          <ChevronRight size={14} />
                        </div>
                      </div>

                      <div className="mt-3">
                        <h3 className="font-outfit text-base font-bold text-brand-textMain">
                          {dom.label}
                        </h3>
                        <p className="text-xs text-brand-textMuted mt-0.5 line-clamp-2 leading-relaxed">
                          {dom.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-brand-border/60">
                      <div className="flex items-baseline justify-between">
                        <span className="font-outfit text-lg font-bold text-brand-textMain">
                          {formatBytes(dom.size_bytes)}
                        </span>
                        <span className="text-xs text-brand-textMuted">
                          {dom.file_count.toLocaleString()} files ({percentage}%)
                        </span>
                      </div>

                      {/* Usage bar */}
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-bg">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(Number(percentage), 2)}%`,
                            backgroundColor: dom.color,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── Media & Files Gallery (Main Overview) ────────────────────────── */}
        <section className="mt-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-brand-textMain">
                  Media & Files Gallery
                </h2>
                <span className="rounded-full bg-brand-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-brand-accent">
                  {mediaFiles.length} {mediaFiles.length === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className="text-xs text-brand-textMuted mt-0.5">
                Instant preview, playback, and direct downloads for all images, videos, audio, and documents across SuperAgent storage.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="flex items-center rounded-lg border border-brand-border bg-brand-bg p-0.5">
                <button
                  onClick={() => setMediaViewMode('grid')}
                  className={`p-1.5 rounded transition-colors ${
                    mediaViewMode === 'grid'
                      ? 'bg-brand-card text-brand-textMain shadow-xs'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                  title="Grid View"
                >
                  <Grid size={14} />
                </button>
                <button
                  onClick={() => setMediaViewMode('table')}
                  className={`p-1.5 rounded transition-colors ${
                    mediaViewMode === 'table'
                      ? 'bg-brand-card text-brand-textMain shadow-xs'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                  title="Table View"
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Filter Pill Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'media', label: 'All Media', icon: Layers },
              { id: 'image', label: 'Images', icon: ImageIcon },
              { id: 'video', label: 'Videos', icon: Film },
              { id: 'audio', label: 'Audio', icon: Music },
              { id: 'document', label: 'Documents', icon: FileText },
              { id: 'all_types', label: 'All Files', icon: File },
            ].map((pill) => {
              const Icon = pill.icon;
              const isActive = mediaTypeFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  onClick={() => setMediaTypeFilter(pill.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    isActive
                      ? 'bg-brand-accent text-white shadow-xs'
                      : 'border border-brand-border bg-brand-card text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover'
                  }`}
                >
                  <Icon size={13} />
                  <span>{pill.label}</span>
                </button>
              );
            })}
          </div>

          {/* Adaptive Filters Bar for Media Gallery */}
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-brand-border bg-brand-card p-3 shadow-xs">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-textMuted"
              />
              <input
                type="text"
                value={mediaSearchQuery}
                onChange={(e) => setMediaSearchQuery(e.target.value)}
                placeholder="Search media files by name..."
                className="w-full rounded-lg border border-brand-border bg-brand-bg pl-8.5 pr-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-brand-accent transition-colors"
              />
            </div>

            {/* Domain filter */}
            <select
              value={mediaDomainFilter}
              onChange={(e) => setMediaDomainFilter(e.target.value)}
              className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-xs text-brand-textMain outline-none focus:border-brand-accent shrink-0"
            >
              <option value="all">All Domains</option>
              <option value="images">Images (~/.superagent/images)</option>
              <option value="videos">Videos (~/.superagent/videos)</option>
              <option value="conversation">Conversations (~/.superagent/conversation)</option>
              <option value="artifacts">Artifacts (~/.superagent/artifacts)</option>
              <option value="config">Config (~/.superagent/config)</option>
              <option value="bin">Binaries (~/.superagent/bin)</option>
            </select>

            {/* Size filter */}
            <select
              value={mediaSizeFilter}
              onChange={(e) => setMediaSizeFilter(e.target.value)}
              className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-xs text-brand-textMain outline-none focus:border-brand-accent shrink-0"
            >
              <option value="all">All Sizes</option>
              <option value="<1mb">&lt; 1 MB</option>
              <option value="1-50mb">1 – 50 MB</option>
              <option value="50-500mb">50 – 500 MB</option>
              <option value=">500mb">&gt; 500 MB</option>
            </select>

            {/* Sort */}
            <select
              value={`${mediaSortBy}-${mediaSortOrder}`}
              onChange={(e) => {
                const [by, ord] = e.target.value.split('-') as [
                  'date' | 'size' | 'name',
                  'asc' | 'desc',
                ];
                setMediaSortBy(by);
                setMediaSortOrder(ord);
              }}
              className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-xs text-brand-textMain outline-none focus:border-brand-accent shrink-0"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="size-desc">Largest First</option>
              <option value="size-asc">Smallest First</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
            </select>
          </div>

          {/* Media Items Grid or Table */}
          <div className="rounded-xl border border-brand-border bg-brand-card p-4 shadow-xs min-h-[350px]">
            {mediaLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-xs text-brand-textMuted gap-2">
                <RefreshCw size={18} className="animate-spin text-brand-accent" />
                <span>Loading media and files...</span>
              </div>
            ) : filteredMediaFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-xs text-brand-textMuted gap-2 border border-dashed border-brand-border rounded-lg">
                <FolderOpen size={24} className="text-brand-textMuted/60" />
                <span>No media files found matching your filters.</span>
              </div>
            ) : mediaViewMode === 'grid' ? (
              /* GRID VIEW */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredMediaFiles.map((file, i) => {
                  const domainBadge = getDomainBadgeColor(file.domain);
                  return (
                    <div
                      key={i}
                      onClick={() => handleOpenFilePreview(file)}
                      className="group relative flex flex-col justify-between rounded-xl border border-brand-border bg-brand-bg/80 p-3 hover:border-brand-accent hover:bg-brand-hover transition-all cursor-pointer overflow-hidden shadow-2xs"
                    >
                      {/* Media thumbnail */}
                      <div className="relative aspect-video w-full rounded-lg bg-brand-card flex items-center justify-center overflow-hidden border border-brand-border/60">
                        {file.file_type === 'image' ? (
                          <img
                            src={getFileStreamUrl(file.path)}
                            alt={file.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : file.file_type === 'video' ? (
                          <div className="relative h-full w-full bg-black/50 flex flex-col items-center justify-center">
                            <Film size={28} className="text-rose-500 transition-transform duration-300 group-hover:scale-110" />
                            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-white/90">
                              VIDEO
                            </span>
                          </div>
                        ) : file.file_type === 'audio' ? (
                          <div className="h-full w-full bg-violet-500/10 flex flex-col items-center justify-center">
                            <Music size={28} className="text-violet-500 transition-transform duration-300 group-hover:scale-110" />
                            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-white/90">
                              AUDIO
                            </span>
                          </div>
                        ) : file.file_type === 'document' ? (
                          <div className="h-full w-full bg-indigo-500/10 flex flex-col items-center justify-center">
                            <FileText size={28} className="text-indigo-400 transition-transform duration-300 group-hover:scale-110" />
                            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-white/90 uppercase">
                              {file.extension || 'DOC'}
                            </span>
                          </div>
                        ) : (
                          <div className="p-3">
                            {getFileTypeIcon(file.file_type, 28)}
                          </div>
                        )}

                        {/* Hover action overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenFilePreview(file);
                            }}
                            className="p-1.5 rounded-md bg-white/20 hover:bg-white/40 text-white transition-colors"
                            title="Preview"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadFile(file);
                            }}
                            className="p-1.5 rounded-md bg-white/20 hover:bg-white/40 text-white transition-colors"
                            title="Download"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(file);
                            }}
                            className="p-1.5 rounded-md bg-rose-500/60 hover:bg-rose-500 text-white transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* File metadata */}
                      <div className="mt-2 min-w-0">
                        <div
                          className="truncate text-xs font-semibold text-brand-textMain"
                          title={file.name}
                        >
                          {file.name}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px]">
                          <span
                            className={`rounded px-1.5 py-0.2 capitalize font-medium ${domainBadge.bg} ${domainBadge.text}`}
                          >
                            {file.domain || file.file_type}
                          </span>
                          <span className="text-brand-textMuted">
                            {formatBytes(file.size_bytes)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* TABLE VIEW */
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-brand-border text-brand-textMuted pb-2">
                      <th className="py-2.5 font-semibold">Name</th>
                      <th className="py-2.5 font-semibold">Domain</th>
                      <th className="py-2.5 font-semibold">Type</th>
                      <th className="py-2.5 font-semibold">Size</th>
                      <th className="py-2.5 font-semibold">Modified</th>
                      <th className="py-2.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/60">
                    {filteredMediaFiles.map((file, i) => {
                      const domainBadge = getDomainBadgeColor(file.domain);
                      return (
                        <tr
                          key={i}
                          onClick={() => handleOpenFilePreview(file)}
                          className="group hover:bg-brand-hover cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {getFileTypeIcon(file.file_type, 16)}
                              <span className="truncate font-medium text-brand-textMain">
                                {file.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] capitalize font-medium ${domainBadge.bg} ${domainBadge.text}`}
                            >
                              {file.domain || '—'}
                            </span>
                          </td>
                          <td className="py-2.5 text-brand-textMuted uppercase text-[10px]">
                            {file.extension || file.file_type}
                          </td>
                          <td className="py-2.5 font-medium text-brand-textMain">
                            {formatBytes(file.size_bytes)}
                          </td>
                          <td className="py-2.5 text-brand-textMuted">
                            {formatDate(file.modified_at)}
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenFilePreview(file);
                                }}
                                className="p-1 text-brand-textMuted hover:text-brand-textMain transition-colors"
                                title="Preview"
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadFile(file);
                                }}
                                className="p-1 text-brand-textMuted hover:text-brand-accent transition-colors"
                                title="Download"
                              >
                                <Download size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFile(file);
                                }}
                                className="p-1 text-brand-textMuted hover:text-destructive transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </>
    ) : (
      /* ────────────────── DEEP-DIVE DOMAIN VIEW ────────────────── */
        <section className="space-y-4">
          {/* Breadcrumbs & Navigation Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-brand-border bg-brand-card p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBackToOverview}
                className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-xs font-semibold text-brand-textMain hover:bg-brand-hover transition-colors"
              >
                <ArrowLeft size={13} />
                <span>All Domains</span>
              </button>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-brand-textMuted">Storage</span>
                <ChevronRight size={12} className="text-brand-textMuted" />
                <span
                  className="font-semibold"
                  style={{ color: activeDomain.color }}
                >
                  {activeDomain.label}
                </span>
                {currentBrowsePath &&
                  currentBrowsePath !== activeDomain.path && (
                    <>
                      <ChevronRight size={12} className="text-brand-textMuted" />
                      <span className="text-brand-textMain font-mono truncate max-w-[200px]">
                        {currentBrowsePath.replace(activeDomain.path, '')}
                      </span>
                    </>
                  )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setRecursiveDomainView((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  recursiveDomainView
                    ? 'border-brand-accent/50 bg-brand-accent/10 text-brand-accent'
                    : 'border-brand-border bg-brand-bg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover'
                }`}
                title="When enabled, recursively lists all files inside this domain and its subdirectories"
              >
                <Layers size={13} />
                <span>Recursive</span>
              </button>

              {parentBrowsePath && !recursiveDomainView && (
                <button
                  onClick={handleNavigateUp}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-xs font-medium text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors"
                >
                  <FolderOpen size={13} />
                  <span>Up Level</span>
                </button>
              )}

              <div className="flex items-center rounded-lg border border-brand-border bg-brand-bg p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-brand-card text-brand-textMain shadow-xs'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                  title="Grid View"
                >
                  <Grid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'table'
                      ? 'bg-brand-card text-brand-textMain shadow-xs'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                  title="Table View"
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Adaptive Filters Bar */}
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-brand-border bg-brand-card p-3 shadow-xs">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-textMuted"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files in domain..."
                className="w-full rounded-lg border border-brand-border bg-brand-bg pl-8.5 pr-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-brand-accent transition-colors"
              />
            </div>

            {/* Type filter */}
            <select
              value={fileTypeFilter}
              onChange={(e) => setFileTypeFilter(e.target.value)}
              className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-xs text-brand-textMain outline-none focus:border-brand-accent shrink-0"
            >
              <option value="all">All File Types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="document">Documents</option>
              <option value="code">Code</option>
              <option value="config">Config / JSON</option>
              <option value="model">Models</option>
              <option value="pcb">PCB CAD</option>
              <option value="binary">Binaries</option>
              <option value="folder">Folders</option>
            </select>

            {/* Size filter */}
            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-xs text-brand-textMain outline-none focus:border-brand-accent shrink-0"
            >
              <option value="all">All Sizes</option>
              <option value="<1mb">&lt; 1 MB</option>
              <option value="1-50mb">1 – 50 MB</option>
              <option value="50-500mb">50 – 500 MB</option>
              <option value=">500mb">&gt; 500 MB</option>
            </select>

            {/* Sort */}
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [by, ord] = e.target.value.split('-') as [
                  'date' | 'size' | 'name',
                  'asc' | 'desc',
                ];
                setSortBy(by);
                setSortOrder(ord);
              }}
              className="rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1.5 text-xs text-brand-textMain outline-none focus:border-brand-accent shrink-0"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="size-desc">Largest First</option>
              <option value="size-asc">Smallest First</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
            </select>
          </div>

          {/* Files List / Grid */}
          <div className="rounded-xl border border-brand-border bg-brand-card p-4 shadow-xs min-h-[350px]">
            {filesLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-xs text-brand-textMuted gap-2">
                <RefreshCw size={18} className="animate-spin text-brand-accent" />
                <span>Reading files in {activeDomain.label}...</span>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-xs text-brand-textMuted gap-2 border border-dashed border-brand-border rounded-lg">
                <FolderOpen size={24} className="text-brand-textMuted/60" />
                <span>No files match your filters in this domain.</span>
              </div>
            ) : viewMode === 'grid' ? (
              /* GRID VIEW */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredFiles.map((file, i) => (
                  <div
                    key={i}
                    onClick={() =>
                      file.is_dir
                        ? handleFolderClick(file)
                        : handleOpenFilePreview(file)
                    }
                    className="group relative flex flex-col justify-between rounded-xl border border-brand-border bg-brand-bg/80 p-3 hover:border-brand-accent hover:bg-brand-hover transition-all cursor-pointer overflow-hidden shadow-2xs"
                  >
                    {/* Media thumbnail / icon */}
                    <div className="relative aspect-video w-full rounded-lg bg-brand-card flex items-center justify-center overflow-hidden border border-brand-border/60">
                      {file.file_type === 'image' ? (
                        <img
                          src={getFileStreamUrl(file.path)}
                          alt={file.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="p-3">
                          {getFileTypeIcon(file.file_type, 28)}
                        </div>
                      )}

                      {/* Hover action overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        {!file.is_dir && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenFilePreview(file);
                              }}
                              className="p-1.5 rounded-md bg-white/20 hover:bg-white/40 text-white transition-colors"
                              title="Preview"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadFile(file);
                              }}
                              className="p-1.5 rounded-md bg-white/20 hover:bg-white/40 text-white transition-colors"
                              title="Download"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFile(file);
                              }}
                              className="p-1.5 rounded-md bg-rose-500/60 hover:bg-rose-500 text-white transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* File metadata */}
                    <div className="mt-2 min-w-0">
                      <div
                        className="truncate text-xs font-semibold text-brand-textMain"
                        title={file.name}
                      >
                        {file.name}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-brand-textMuted">
                        <span>
                          {file.is_dir ? 'Folder' : formatBytes(file.size_bytes)}
                        </span>
                        <span>{formatDate(file.modified_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* TABLE VIEW */
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-brand-border text-brand-textMuted pb-2">
                      <th className="py-2.5 font-semibold">Name</th>
                      <th className="py-2.5 font-semibold">Type</th>
                      <th className="py-2.5 font-semibold">Size</th>
                      <th className="py-2.5 font-semibold">Modified</th>
                      <th className="py-2.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/60">
                    {filteredFiles.map((file, i) => (
                      <tr
                        key={i}
                        onClick={() =>
                          file.is_dir
                            ? handleFolderClick(file)
                            : handleOpenFilePreview(file)
                        }
                        className="group hover:bg-brand-hover cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {getFileTypeIcon(file.file_type, 16)}
                            <span className="truncate font-medium text-brand-textMain">
                              {file.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 text-brand-textMuted uppercase text-[10px]">
                          {file.is_dir ? 'Directory' : file.extension || file.file_type}
                        </td>
                        <td className="py-2.5 font-medium text-brand-textMain">
                          {file.is_dir ? '—' : formatBytes(file.size_bytes)}
                        </td>
                        <td className="py-2.5 text-brand-textMuted">
                          {formatDate(file.modified_at)}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            {!file.is_dir && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenFilePreview(file);
                                  }}
                                  className="p-1 text-brand-textMuted hover:text-brand-textMain transition-colors"
                                  title="Preview"
                                >
                                  <Eye size={14} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadFile(file);
                                  }}
                                  className="p-1 text-brand-textMuted hover:text-brand-accent transition-colors"
                                  title="Download"
                                >
                                  <Download size={14} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFile(file);
                                  }}
                                  className="p-1 text-brand-textMuted hover:text-destructive transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── In-UI Media Preview Modal ─────────────────────────────────────── */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-brand-border px-5 py-3.5 bg-brand-bg/60">
              <div className="flex items-center gap-2.5 min-w-0 pr-4">
                {getFileTypeIcon(previewFile.file_type, 18)}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-brand-textMain">
                    {previewFile.name}
                  </div>
                  <div className="text-[11px] text-brand-textMuted">
                    {formatBytes(previewFile.size_bytes)} • Modified{' '}
                    {formatDate(previewFile.modified_at)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadFile(previewFile)}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-card px-3 py-1.5 text-xs font-semibold text-brand-textMain hover:bg-brand-hover transition-colors shadow-2xs"
                >
                  <Download size={13} />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => handleDeleteFile(previewFile)}
                  className="p-1.5 rounded-lg border border-brand-border text-brand-textMuted hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Delete File"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content / Preview Area */}
            <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-brand-bg/40">
              {previewFile.file_type === 'image' ? (
                <div className="max-h-[70vh] overflow-auto flex items-center justify-center">
                  <img
                    src={getFileStreamUrl(previewFile.path)}
                    alt={previewFile.name}
                    className="max-h-[65vh] max-w-full rounded-lg object-contain shadow-md"
                  />
                </div>
              ) : previewFile.file_type === 'video' ? (
                <div className="w-full max-w-3xl aspect-video rounded-lg overflow-hidden bg-black shadow-lg">
                  <video
                    controls
                    autoPlay
                    src={getFileStreamUrl(previewFile.path)}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : previewFile.file_type === 'audio' ? (
                <div className="w-full max-w-md p-6 rounded-xl border border-brand-border bg-brand-card flex flex-col items-center gap-4 shadow-md">
                  <Music size={48} className="text-violet-500 animate-pulse" />
                  <div className="text-sm font-semibold text-brand-textMain truncate">
                    {previewFile.name}
                  </div>
                  <audio
                    controls
                    autoPlay
                    src={getFileStreamUrl(previewFile.path)}
                    className="w-full"
                  />
                </div>
              ) : previewText !== null ? (
                <div className="w-full h-full flex flex-col max-h-[65vh]">
                  <div className="flex items-center justify-between pb-2 border-b border-brand-border text-xs text-brand-textMuted">
                    <span>Text / Code Preview</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(previewText);
                        setCopiedText(true);
                        setTimeout(() => setCopiedText(false), 2000);
                      }}
                      className="flex items-center gap-1 hover:text-brand-textMain transition-colors"
                    >
                      {copiedText ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedText ? 'Copied' : 'Copy Text'}</span>
                    </button>
                  </div>
                  <pre className="mt-3 flex-1 overflow-auto rounded-lg border border-brand-border bg-brand-bg p-4 font-mono text-xs text-brand-textMain leading-relaxed select-text">
                    {previewText}
                  </pre>
                </div>
              ) : previewLoading ? (
                <div className="flex flex-col items-center gap-2 text-xs text-brand-textMuted">
                  <RefreshCw size={20} className="animate-spin text-brand-accent" />
                  <span>Loading preview...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  {getFileTypeIcon(previewFile.file_type, 40)}
                  <div className="text-sm font-semibold text-brand-textMain">
                    {previewFile.name}
                  </div>
                  <div className="text-xs text-brand-textMuted max-w-sm">
                    No direct visual preview available for this file type. You can download it directly to view in your preferred application.
                  </div>
                  <button
                    onClick={() => handleDownloadFile(previewFile)}
                    className="mt-2 flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-2 text-xs font-semibold text-white hover:bg-brand-accent/80 transition-colors shadow-xs"
                  >
                    <Download size={14} />
                    <span>Download File</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Conversations & Projects Popup Modal ──────────────────────────── */}
      {showConvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative flex flex-col w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-brand-border px-5 py-4 bg-brand-bg/60">
              <div className="flex items-center gap-2.5">
                <MessageSquare size={18} className="text-brand-accent" />
                <h3 className="font-outfit text-lg font-bold text-brand-textMain">
                  Conversations & Projects
                </h3>
              </div>

              <button
                onClick={() => setShowConvModal(false)}
                className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Sub-bar: Tabs & Search */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-brand-border px-5 py-3 bg-brand-card">
              <div className="flex items-center rounded-lg border border-brand-border bg-brand-bg p-0.5">
                <button
                  onClick={() => setConvModalTab('chats')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    convModalTab === 'chats'
                      ? 'bg-brand-card text-brand-textMain shadow-2xs'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                >
                  Chats ({conversations.length})
                </button>
                <button
                  onClick={() => setConvModalTab('pcb')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    convModalTab === 'pcb'
                      ? 'bg-brand-card text-brand-textMain shadow-2xs'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                >
                  PCB Projects ({pcbProjects.length})
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-textMuted"
                />
                <input
                  type="text"
                  value={convSearch}
                  onChange={(e) => setConvSearch(e.target.value)}
                  placeholder={`Search ${convModalTab === 'chats' ? 'chats' : 'projects'}...`}
                  className="w-full rounded-lg border border-brand-border bg-brand-bg pl-8 pr-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-brand-accent transition-colors"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto p-5 divide-y divide-brand-border/60">
              {convModalTab === 'chats' ? (
                filteredConversations.length === 0 ? (
                  <div className="py-12 text-center text-xs text-brand-textMuted">
                    No conversations found.
                  </div>
                ) : (
                  filteredConversations.map((c) => (
                    <div
                      key={c.id}
                      className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-brand-textMain truncate">
                          {c.title}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-brand-textMuted">
                          <span>{c.message_count} messages</span>
                          {c.project && (
                            <span className="rounded bg-brand-bg px-1.5 py-0.5 text-[10px] text-brand-accent font-medium">
                              {c.project}
                            </span>
                          )}
                          <span>Updated {formatDate(c.updated_at)}</span>
                        </div>
                      </div>

                      {/* Media breakdown badges */}
                      <div className="flex items-center gap-2 shrink-0">
                        {c.media_counts.images > 0 && (
                          <span className="flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-500">
                            <ImageIcon size={12} />
                            {c.media_counts.images}
                          </span>
                        )}
                        {c.media_counts.videos > 0 && (
                          <span className="flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-500">
                            <Film size={12} />
                            {c.media_counts.videos}
                          </span>
                        )}
                        {c.media_counts.documents > 0 && (
                          <span className="flex items-center gap-1 rounded bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-400">
                            <FileText size={12} />
                            {c.media_counts.documents}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )
              ) : filteredPcbProjects.length === 0 ? (
                <div className="py-12 text-center text-xs text-brand-textMuted">
                  No PCB projects found.
                </div>
              ) : (
                filteredPcbProjects.map((p) => (
                  <div
                    key={p.id}
                    className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-brand-textMain truncate">
                          {p.name}
                        </span>
                        <span className="rounded bg-teal-500/15 text-teal-600 dark:text-teal-400 px-1.5 py-0.2 text-[10px] font-mono">
                          {p.revision}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-brand-textMuted">
                        <span>{p.components_count} components</span>
                        <span>{p.nets_count} nets</span>
                        <span>Updated {formatDate(p.updated_at)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorageSettings;
