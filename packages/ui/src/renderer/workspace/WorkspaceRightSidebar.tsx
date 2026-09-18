import React, { useState, useMemo, useEffect } from 'react';
import {
  FileCode2,
  Users,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Eye,
  Bot,
  Search,
  Plus,
  Heart,
  Smile,
  Zap,
  Activity,
  FileCheck,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Send,
  Volume2,
  Battery,
  Camera,
  Coffee,
  Moon,
  Sun,
  X,
  Info,
  Copy,
  Check,
  Layers,
  Coins,
  HardDrive,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  ArrowLeft,
  Cpu,
  Loader2,
  Maximize2,
} from 'lucide-react';
import { useChatStore, type ChatStoreState } from '../stores/chatStore';
import { useSessionStore, type SessionStoreState } from '../stores/sessionStore';
import { usePartners } from '../pages/Settings/companion/library';
import { PetSprite } from '../partner-popup/PetSprite';
import { ErrorBoundary } from '../components/ErrorBoundary';
import type { TrajectoryStep } from '../pages/Workspace/TrajectoryCanvas';
import type { PartnerMood, PartnerManifest } from '../partner-popup/types';
import { moodReaction } from '../partner-popup/types';
import { computeChatContextStats, formatByteSize, type SubagentExecutionItem, type ChatAttachmentItem } from '../logic/context';
import { TrajectoryService } from '../logic/trajectory';
import type { StoredChat } from '../core/types';

export type WorkspaceSidebarTab = 'overview' | 'files' | 'agents' | 'partner' | 'info';

export interface WorkspaceRightSidebarProps {
  steps?: TrajectoryStep[];
  isGenerating?: boolean;
  activeChatId?: string;
  onViewDiff?: (filename: string, originalCode: string, modifiedCode: string) => void;
  onAddAgentSession?: () => void;
  onSelectChat?: (chatId: string) => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  initialTab?: WorkspaceSidebarTab;
}

export interface ModifiedFileItem {
  filename: string;
  action: 'modified' | 'added' | 'deleted';
  originalCode: string;
  modifiedCode: string;
  stepId: string;
}

export interface AttachmentPreviewItemProps {
  attachment: ChatAttachmentItem;
  defaultExpanded?: boolean;
  onEnlarge?: (src: string, title: string) => void;
}

export const AttachmentPreviewItem: React.FC<AttachmentPreviewItemProps> = ({
  attachment,
  defaultExpanded = false,
  onEnlarge,
}) => {
  const initialSrc =
    attachment.url ||
    attachment.dataUrl ||
    (attachment.path.startsWith('data:') ||
    attachment.path.startsWith('blob:') ||
    attachment.path.startsWith('http://') ||
    attachment.path.startsWith('https://')
      ? attachment.path
      : null);

  const [imgSrc, setImgSrc] = useState<string | null>(initialSrc);
  const [isLoading, setIsLoading] = useState<boolean>(attachment.mediaType === 'image' && !initialSrc);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (attachment.mediaType !== 'image') return;
    if (imgSrc) return;

    let active = true;
    setIsLoading(true);
    setHasError(false);

    TrajectoryService.readLocalImageBase64(attachment.path)
      .then((base64: string | null) => {
        if (!active) return;
        if (base64) {
          setImgSrc(base64);
          setHasError(false);
        } else {
          setHasError(true);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (active) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [attachment.path, attachment.mediaType, imgSrc]);

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(attachment.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isImage = attachment.mediaType === 'image';
  const isVideo = attachment.mediaType === 'video';
  const isCode = attachment.mediaType === 'code';

  return (
    <div className="rounded-xl bg-brand-inner-bg/50 hover:bg-brand-inner-bg/80 border border-brand-border/30 overflow-hidden transition-all duration-150">
      {/* Attachment Row Header */}
      <div
        className="p-2 flex items-center justify-between gap-2.5 text-xs select-none"
        onClick={() => {
          if (isImage || isVideo) {
            setIsExpanded((prev) => !prev);
          }
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Thumbnail / Icon */}
          {isImage ? (
            <div
              className="w-10 h-10 rounded-lg overflow-hidden bg-black/30 border border-brand-border/40 shrink-0 relative flex items-center justify-center cursor-pointer group/thumb"
              onClick={(e) => {
                if (imgSrc && onEnlarge) {
                  e.stopPropagation();
                  onEnlarge(imgSrc, attachment.name);
                }
              }}
              title={imgSrc ? 'Click to enlarge preview' : attachment.name}
            >
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={attachment.name}
                  onError={() => setHasError(true)}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover/thumb:scale-110"
                />
              ) : isLoading ? (
                <Loader2 size={14} className="animate-spin text-brand-textMuted" />
              ) : (
                <ImageIcon size={16} className="text-emerald-400/80" />
              )}
            </div>
          ) : isVideo ? (
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 shrink-0 flex items-center justify-center text-purple-400">
              <VideoIcon size={16} />
            </div>
          ) : isCode ? (
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 shrink-0 flex items-center justify-center text-cyan-400">
              <FileCode2 size={16} />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-lg bg-brand-card border border-brand-border/40 shrink-0 flex items-center justify-center text-brand-textMuted">
              <FileText size={16} />
            </div>
          )}

          {/* Details */}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-medium text-brand-textMain truncate select-text" title={attachment.name}>
              {attachment.name}
            </p>
            <div className="flex items-center gap-1.5 text-[9px] text-brand-textMuted font-mono mt-0.5">
              <span className="capitalize">{attachment.mediaType}</span>
              {attachment.formattedSize && <span>· {attachment.formattedSize}</span>}
              {attachment.source && (
                <span className="px-1 py-0.2 rounded bg-brand-border/30 text-[8px] uppercase tracking-wider">
                  {attachment.source}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isImage && imgSrc && (
            <button
              onClick={() => onEnlarge?.(imgSrc, attachment.name)}
              className="p-1 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
              title="Enlarge preview"
            >
              <Maximize2 size={12} />
            </button>
          )}

          <button
            onClick={handleCopyPath}
            className="p-1 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
            title="Copy path"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>

          {(isImage || isVideo) && (
            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="p-1 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
              title={isExpanded ? 'Collapse preview' : 'Expand preview'}
            >
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Inline Preview */}
      {isExpanded && (
        <div className="px-2.5 pb-2.5 pt-0.5 border-t border-brand-border/20">
          {isImage && (
            imgSrc ? (
              <div
                className="relative group/preview rounded-lg overflow-hidden border border-brand-border/40 bg-black/40 cursor-zoom-in"
                onClick={() => onEnlarge?.(imgSrc, attachment.name)}
                title="Click to view full preview"
              >
                <img
                  src={imgSrc}
                  alt={attachment.name}
                  className="w-full max-h-48 object-contain transition-transform duration-200 group-hover/preview:scale-[1.01]"
                />
                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <span className="px-2 py-1 rounded bg-black/70 text-[10px] text-white backdrop-blur-xs flex items-center gap-1 font-mono">
                    <Maximize2 size={11} /> Click to enlarge
                  </span>
                </div>
              </div>
            ) : isLoading ? (
              <div className="h-32 rounded-lg border border-brand-border/30 bg-black/20 flex flex-col items-center justify-center gap-2 text-brand-textMuted animate-pulse">
                <Loader2 size={16} className="animate-spin text-brand-primary" />
                <span className="text-[10px] font-mono">Loading preview...</span>
              </div>
            ) : (
              <div className="p-3 rounded-lg border border-brand-border/30 bg-black/20 text-center">
                <p className="text-[10px] text-brand-textMuted font-mono">Image preview unavailable</p>
                <p className="text-[9px] text-brand-textMuted/60 font-mono truncate mt-0.5">{attachment.path}</p>
              </div>
            )
          )}

          {isVideo && (
            attachment.url ? (
              <video
                src={attachment.url}
                controls
                className="w-full max-h-44 rounded-lg bg-black border border-brand-border/40"
              />
            ) : (
              <div className="p-3 rounded-lg border border-brand-border/30 bg-black/20 text-center">
                <p className="text-[10px] text-brand-textMuted font-mono">Video file</p>
                <p className="text-[9px] text-brand-textMuted/60 font-mono truncate mt-0.5">{attachment.path}</p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export const WorkspaceRightSidebar: React.FC<WorkspaceRightSidebarProps> = ({
  steps = [],
  isGenerating = false,
  activeChatId,
  onViewDiff,
  onAddAgentSession,
  onSelectChat,
  isMobileOpen = false,
  onMobileClose,
  initialTab = 'overview',
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceSidebarTab>(initialTab);
  const isOverviewTab = activeTab === 'overview' || activeTab === 'files';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [customMood, setCustomMood] = useState<PartnerMood | null>(null);

  // Accordeon and layout states
  const [isStageCollapsed, setIsStageCollapsed] = useState(false);
  const [isInteractionsCollapsed, setIsInteractionsCollapsed] = useState(false);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(false);
  const [cameraAngle, setCameraAngle] = useState<'close-up' | 'normal' | 'full'>('normal');
  const [lipSync, setLipSync] = useState(false);
  const [darkCircles, setDarkCircles] = useState(false);

  // Gamification & Companion Stats (persisted in localStorage)
  const [affection, setAffection] = useState<number>(() => {
    const val = typeof localStorage !== 'undefined' ? localStorage.getItem('partner_affection') : null;
    return val ? parseInt(val, 10) : 60;
  });
  const [energy, setEnergy] = useState<number>(() => {
    const val = typeof localStorage !== 'undefined' ? localStorage.getItem('partner_energy') : null;
    return val ? parseInt(val, 10) : 85;
  });

  const [chatInput, setChatInput] = useState('');
  const [dialogueText, setDialogueText] = useState('');

  // Persist stats on change
  useEffect(() => {
    localStorage.setItem('partner_affection', affection.toString());
  }, [affection]);

  useEffect(() => {
    localStorage.setItem('partner_energy', energy.toString());
  }, [energy]);

  // Listen for global right sidebar toggle event (e.g. from TitleBar or shortcuts)
  useEffect(() => {
    const handleToggle = () => setIsCollapsed((prev) => !prev);
    window.addEventListener('toggle-right-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-right-sidebar', handleToggle);
  }, []);

  // Read stores
  const chats = useChatStore((s: ChatStoreState) => s.chats);
  const activeProject = useChatStore((s: ChatStoreState) => s.activeProject);
  const draftProject = useChatStore((s: ChatStoreState) => s.draftProject);
  const activeChat = chats.find((c: StoredChat) => c.id === activeChatId);
  const runningSessions = useSessionStore((s: SessionStoreState) => s.runningSessions);
  const runningSession = activeChatId ? runningSessions.get(activeChatId) : null;
  const contextUsage = runningSession?.contextUsage || null;
  const [copiedId, setCopiedId] = useState(false);
  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(null);
  const [copiedSubagentOutput, setCopiedSubagentOutput] = useState(false);
  const [copiedAttachmentPath, setCopiedAttachmentPath] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title: string } | null>(null);

  // Close lightbox on Escape key
  useEffect(() => {
    if (!lightboxImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage]);

  // Reset selected subagent drill-down when active chat changes
  useEffect(() => {
    setSelectedSubagentId(null);
  }, [activeChatId]);

  // Compute full chat context, token, pricing, size, subagents, and attachments stats
  const chatStats = useMemo(() => {
    return computeChatContextStats(
      steps,
      activeChat?.model,
      undefined,
      undefined,
      activeChat
    );
  }, [steps, activeChat]);

  // Scoped sub-agents in THIS specific chat
  const subagentItems = chatStats.subagents;
  const agentItems = subagentItems;

  // Partner hooks
  const partners = usePartners();
  const activePartner = partners.pets.find((p: PartnerManifest) => p.id === partners.activeId) || partners.pets[0] || null;

  // Compute file changes from trajectory steps
  const modifiedFiles = useMemo(() => {
    const fileMap = new Map<string, ModifiedFileItem>();

    steps.forEach((step) => {
      // Check tool metadata or content for file modifications
      if (step.metadata?.diff) {
        const diff = step.metadata.diff as { filename?: string; originalCode?: string; modifiedCode?: string } | undefined;
        const filename = diff?.filename;
        const originalCode = diff?.originalCode;
        const modifiedCode = diff?.modifiedCode;
        if (filename) {
          fileMap.set(filename, {
            filename,
            action: 'modified',
            originalCode: originalCode || '',
            modifiedCode: modifiedCode || '',
            stepId: step.id
          });
        }
      } else if (step.content) {
        // Regex search for write/edit patterns if metadata missing
        const writeMatch = step.content.match(/(?:Wrote|Updated|Created|Edited)\s+([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i);
        if (writeMatch && writeMatch[1]) {
          const filename = writeMatch[1];
          if (!fileMap.has(filename)) {
            fileMap.set(filename, {
              filename,
              action: 'modified',
              originalCode: '// Original code unavailable',
              modifiedCode: step.content,
              stepId: step.id
            });
          }
        }
      }
    });

    return Array.from(fileMap.values());
  }, [steps]);

  // Filter modified files by search query
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return modifiedFiles;
    const q = searchQuery.toLowerCase();
    return modifiedFiles.filter((f) => f.filename.toLowerCase().includes(q));
  }, [modifiedFiles, searchQuery]);

  // Partner derived mood
  const mood: PartnerMood = customMood || (activeChat?.lastError ? 'sad' : isGenerating ? 'working' : 'idle');

  // Helper for basename
  const getBasename = (filePath: string) => {
    const parts = filePath.split(/[\\/]/);
    return parts[parts.length - 1] || filePath;
  };

  // Helper for dirpath
  const getDirPath = (filePath: string) => {
    const parts = filePath.split(/[\\/]/);
    if (parts.length <= 1) return './';
    return parts.slice(0, -1).join('/');
  };

  const handleCloseMobileDrawer = () => {
    onMobileClose?.();
    window.dispatchEvent(new CustomEvent('close-mobile-right-sidebar'));
  };

  // Listen for Escape key to close mobile drawer
  useEffect(() => {
    if (!isMobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseMobileDrawer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onMobileClose]);

  const renderSidebarContent = (isMobile: boolean) => (
    <>
      {/* Sidebar Header & Tab Nav */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-brand-border/40 bg-brand-inner-bg/90 backdrop-blur-xs shrink-0">
        <div className="flex items-center gap-1 bg-black/10 dark:bg-black/30 p-1 rounded-lg border border-brand-border/30">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
              isOverviewTab
                ? 'bg-brand-card text-brand-textMain shadow-sm border border-brand-border/60'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <FileCode2 size={13} />
            <span>Overview</span>
            {modifiedFiles.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-brand-border text-[9px] text-brand-textMain font-mono">
                {modifiedFiles.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
              activeTab === 'agents'
                ? 'bg-brand-card text-brand-textMain shadow-sm border border-brand-border/60'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <Users size={13} />
            <span>Agents</span>
            {subagentItems.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-brand-border text-[9px] text-brand-textMain font-mono">
                {subagentItems.length}
              </span>
            )}
            {subagentItems.some((a: SubagentExecutionItem) => a.status === 'running') && (
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)] animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('partner')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
              activeTab === 'partner'
                ? 'bg-brand-card text-brand-textMain shadow-sm border border-brand-border/60'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <Sparkles size={13} />
            <span>Partner</span>
          </button>

          <button
            onClick={() => setActiveTab('info')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
              activeTab === 'info'
                ? 'bg-brand-card text-brand-textMain shadow-sm border border-brand-border/60'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <Info size={13} />
            <span>Info</span>
          </button>
        </div>

        {/* Collapse or Close button */}
        {isMobile ? (
          <button
            onClick={handleCloseMobileDrawer}
            className="p-1.5 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
            title="Close drawer"
            aria-label="Close drawer"
          >
            <X size={16} />
          </button>
        ) : (
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
            title="Collapse Panel"
            aria-label="Collapse Panel"
          >
            <ChevronRight size={15} />
          </button>
        )}
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-brand-border">
        {/* ── TAB 1: OVERVIEW & FILE CHANGES ─────────────────────────────── */}
        {isOverviewTab && (
          <div className="space-y-3">
            {/* Search filter */}
            {modifiedFiles.length > 0 && (
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2.5 text-brand-textMuted" />
                <input
                  type="text"
                  placeholder="Filter changed files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-brand-textMain placeholder:text-brand-textMuted focus:outline-none focus:border-brand-primary"
                />
              </div>
            )}

            {filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-brand-textMuted">
                <FileCheck size={28} className="text-brand-textMuted/40 mb-2" />
                <p className="text-xs font-medium text-brand-textMain">No File Changes</p>
                <p className="text-[11px] text-brand-textMuted mt-1 max-w-[200px]">
                  Files created or modified during agent runs will appear here for side-by-side diff review.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-brand-textMuted px-1">
                  <span>OVERVIEW · CHANGED FILES ({filteredFiles.length})</span>
                  <span>CLICK TO VIEW DIFF</span>
                </div>

                {filteredFiles.map((file) => (
                  <div
                    key={file.filename}
                    onClick={() => {
                      onViewDiff?.(file.filename, file.originalCode, file.modifiedCode);
                      if (isMobile) onMobileClose?.();
                    }}
                    className="group rounded-xl p-2.5 bg-brand-inner-bg/60 hover:bg-brand-inner-bg border border-brand-border/40 hover:border-brand-border/70 transition-all flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode2 size={15} className="text-brand-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-brand-textMain truncate">
                          {getBasename(file.filename)}
                        </div>
                        <div className="text-[10px] text-brand-textMuted truncate font-mono">
                          {getDirPath(file.filename)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[color:var(--neon-live)]/10 text-[color:var(--neon-live)] font-medium">
                        {file.action}
                      </span>
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 p-1 text-brand-textMuted hover:text-brand-textMain transition-all"
                        title="View Diff"
                      >
                        <Eye size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: SUB-AGENTS IN THIS CHAT ──────────────────────────────── */}
        {activeTab === 'agents' && (
          <div className="space-y-3">
            {selectedSubagentId ? (
              (() => {
                const subagent = subagentItems.find((s: SubagentExecutionItem) => s.id === selectedSubagentId);
                if (!subagent) {
                  return (
                    <div className="py-8 text-center text-xs text-brand-textMuted">
                      <p>Sub-agent not found.</p>
                      <button
                        onClick={() => setSelectedSubagentId(null)}
                        className="mt-2 text-brand-primary underline cursor-pointer"
                      >
                        Back to sub-agents
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {/* Back header */}
                    <div className="flex items-center justify-between pb-2 border-b border-brand-border/40">
                      <button
                        onClick={() => setSelectedSubagentId(null)}
                        className="flex items-center gap-1.5 text-xs text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer py-1"
                      >
                        <ArrowLeft size={13} />
                        <span>All Sub-agents</span>
                      </button>
                      <span
                        className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          subagent.status === 'running'
                            ? 'bg-[color:var(--neon-live)]/15 text-[color:var(--neon-live)] font-semibold'
                            : subagent.status === 'error'
                            ? 'bg-rose-500/15 text-rose-400 font-medium'
                            : 'bg-emerald-500/15 text-emerald-400 font-medium'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            subagent.status === 'running'
                              ? 'bg-[color:var(--neon-live)] animate-pulse'
                              : subagent.status === 'error'
                              ? 'bg-rose-400'
                              : 'bg-emerald-400'
                          }`}
                        />
                        {subagent.status === 'running' ? 'Running' : subagent.status === 'error' ? 'Failed' : 'Completed'}
                      </span>
                    </div>

                    {/* Subagent Meta Card */}
                    <div className="p-3 rounded-xl bg-brand-card/70 border border-brand-border/60 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                          <Cpu size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-brand-textMain font-mono truncate">
                            {subagent.name}
                          </h4>
                          <span className="text-[10px] text-brand-textMuted font-mono">
                            Persona: {subagent.personaId}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-brand-border/40 text-[10px] font-mono">
                        <div>
                          <span className="text-brand-textMuted block">Duration</span>
                          <span className="text-brand-textMain font-medium">{subagent.duration || 'Completed'}</span>
                        </div>
                        <div>
                          <span className="text-brand-textMuted block">Token Footprint</span>
                          <span className="text-brand-textMain font-medium">
                            {subagent.tokens.total.toLocaleString()} tok ({subagent.cost < 0.001 ? '< $0.001' : `$${subagent.cost.toFixed(4)}`})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Delegated Task */}
                    <div className="p-3 rounded-xl bg-brand-card/50 border border-brand-border/40 space-y-1.5">
                      <span className="text-[10px] font-mono text-brand-textMuted uppercase tracking-wider block">
                        Delegated Task / Objective
                      </span>
                      <div className="text-xs text-brand-textMain whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto font-sans p-2.5 rounded-lg bg-brand-inner-bg/60 border border-brand-border/30">
                        {subagent.prompt}
                      </div>
                    </div>

                    {/* Subagent Execution Output / Result */}
                    <div className="p-3 rounded-xl bg-brand-card/70 border border-brand-border/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-brand-textMuted uppercase tracking-wider">
                          {subagent.status === 'error' ? 'Error Message' : 'Sub-agent Response & History'}
                        </span>
                        {subagent.output && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(subagent.output || '');
                              setCopiedSubagentOutput(true);
                              setTimeout(() => setCopiedSubagentOutput(false), 2000);
                            }}
                            className="flex items-center gap-1 text-[10px] text-brand-textMuted hover:text-brand-textMain cursor-pointer"
                            title="Copy Response"
                          >
                            {copiedSubagentOutput ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedSubagentOutput ? 'Copied' : 'Copy'}</span>
                          </button>
                        )}
                      </div>

                      <div
                        className={`p-2.5 rounded-lg text-xs leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap font-sans ${
                          subagent.status === 'error'
                            ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                            : 'bg-brand-inner-bg text-brand-textMain border border-brand-border/40'
                        }`}
                      >
                        {subagent.output || 'No output recorded for this subagent execution.'}
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-brand-textMuted uppercase tracking-wider">
                    Sub-agents in this Chat ({subagentItems.length})
                  </span>
                  {onAddAgentSession && (
                    <button
                      onClick={onAddAgentSession}
                      className="flex items-center gap-1 text-[10px] font-medium text-brand-primary hover:text-brand-primary/80 transition-colors"
                      title="Delegate task to a subagent"
                    >
                      <Plus size={11} />
                      <span>New Agent</span>
                    </button>
                  )}
                </div>

                {subagentItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-brand-textMuted">
                    <Bot size={28} className="text-brand-textMuted/40 mb-2" />
                    <p className="text-xs font-medium text-brand-textMain">No Sub-agents in this Chat</p>
                    <p className="text-[11px] text-brand-textMuted mt-1 max-w-[230px]">
                      When the agent delegates work to specialized sub-agents (e.g., code research, review, or testing), they will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {subagentItems.map((agent: SubagentExecutionItem) => (
                      <div
                        key={agent.id}
                        onClick={() => setSelectedSubagentId(agent.id)}
                        className="p-3 rounded-xl border border-brand-border/50 bg-brand-card/70 hover:bg-brand-hover hover:border-brand-border transition-all cursor-pointer group shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <Cpu
                              size={15}
                              className={
                                agent.status === 'running'
                                  ? 'text-[color:var(--neon-live)] animate-pulse'
                                  : 'text-cyan-400'
                              }
                            />
                            <span className="text-xs font-semibold truncate text-brand-textMain font-mono">
                              {agent.name}
                            </span>
                          </div>

                          <span
                            className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
                              agent.status === 'running'
                                ? 'bg-[color:var(--neon-live)]/15 text-[color:var(--neon-live)] font-semibold'
                                : agent.status === 'error'
                                ? 'bg-rose-500/15 text-rose-400 font-medium'
                                : 'bg-emerald-500/15 text-emerald-400 font-medium'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                agent.status === 'running'
                                  ? 'bg-[color:var(--neon-live)] animate-pulse'
                                  : agent.status === 'error'
                                  ? 'bg-rose-400'
                                  : 'bg-emerald-400'
                              }`}
                            />
                            {agent.status === 'running' ? 'Running' : agent.status === 'error' ? 'Failed' : 'Completed'}
                          </span>
                        </div>

                        <p className="text-[11px] text-brand-textMuted line-clamp-2 leading-relaxed font-sans">
                          {agent.prompt}
                        </p>

                        <div className="flex items-center justify-between text-[10px] font-mono text-brand-textMuted mt-2 pt-2 border-t border-brand-border/30">
                          <span>
                            {agent.tokens.total.toLocaleString()} tok ·{' '}
                            {agent.cost < 0.001 ? '< $0.001' : `$${agent.cost.toFixed(4)}`}
                          </span>
                          <span className="flex items-center gap-0.5 text-brand-textMain font-medium group-hover:text-brand-primary transition-colors">
                            <span>History</span>
                            <ChevronRight size={11} />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── TAB 3: PARTNER COMPANION (PREMIUM ACCORDION) ────────────────────────── */}
        {activeTab === 'partner' && (
          <div className="space-y-3.5 select-none animate-fade-in pb-4">
            {activePartner ? (
              <>
                {/* ── Dialogue text sync ── */}
                <DialogueSync
                  activePartner={activePartner}
                  mood={mood}
                  dialogueText={dialogueText}
                  setDialogueText={setDialogueText}
                  setLipSync={setLipSync}
                />

                {/* ── ACCORDION SECTION 1: 3D COMPANION STAGE ── */}
                <div className="rounded-2xl border border-brand-border bg-brand-sidebar/40 overflow-hidden shadow-sm transition-all duration-200">
                  <button
                    onClick={() => setIsStageCollapsed(!isStageCollapsed)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-brand-bg/50 border-b border-brand-border/60 hover:bg-brand-hover/50 transition-colors text-xs font-semibold text-brand-textMain"
                  >
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={13} className="text-brand-primary" />
                      <span>3D Companion Stage</span>
                    </div>
                    {isStageCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>

                  <div className={`transition-all duration-300 ease-in-out ${isStageCollapsed ? 'h-0 opacity-0 overflow-hidden' : 'h-auto opacity-100 p-3'}`}>
                    {/* Stage Viewport */}
                    <div
                      className="w-full h-64 rounded-xl relative overflow-hidden flex flex-col items-center justify-center border border-brand-border/60 shadow-inner group"
                      style={{
                        background: `radial-gradient(ellipse at 50% 30%, color-mix(in srgb, ${activePartner.accent || '#ff8fb3'} 20%, transparent), transparent 75%), var(--brand-bg)`
                      }}
                    >
                      {/* Status header overlay */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10 pointer-events-none">
                        <div className="flex items-center gap-1 bg-brand-sidebar/90 backdrop-blur-md px-2 py-0.5 rounded-full border border-brand-border/60 text-[9px] font-semibold text-brand-textMain">
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{
                              background: mood === 'working' ? 'var(--neon-live)' : mood === 'sad' ? 'var(--neon-destructive)' : '#60a5fa'
                            }}
                          />
                          <span>{activePartner.name}</span>
                        </div>
                        <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-brand-sidebar/90 backdrop-blur-md border border-brand-border/60 text-brand-textMuted uppercase">
                          {mood}
                        </span>
                      </div>

                      {/* 3D Pet viewport */}
                      <div className="my-auto transform transition-transform duration-300">
                        <ErrorBoundary name="Pet Sprite" compact>
                          <PetSprite
                            manifest={activePartner}
                            mood={mood}
                            size={150}
                            cameraAngle={cameraAngle}
                            lipSync={lipSync}
                            darkCircles={darkCircles}
                            onPoke={(part: string) => {
                              let response = "Hmm? Did you touch something?";
                              if (part === 'head') {
                                const lines = [
                                  "Hehe, that tickles! Don't mess up my hair bow.",
                                  "You poked my head! Focus on the editor instead!",
                                  "Ah! *giggles* Let's write some code!"
                                ];
                                response = lines[Math.floor(Math.random() * lines.length)];
                                setAffection(prev => Math.min(prev + 2, 100));
                              } else if (part === 'body' || part === 'dress') {
                                response = "I'm right here keeping you company.";
                                setAffection(prev => Math.min(prev + 1, 100));
                              } else if (part.includes('hand') || part.includes('arm')) {
                                response = "High five! Let's build something awesome!";
                                setAffection(prev => Math.min(prev + 3, 100));
                              } else if (part === 'laptop') {
                                response = "My laptop shows the active processes... looks green!";
                              }

                              // Trigger LipSync response
                              setDialogueText(response);
                              setLipSync(true);
                              const duration = Math.min(Math.max(response.length * 80, 1500), 4000);
                              setTimeout(() => setLipSync(false), duration);
                            }}
                          />
                        </ErrorBoundary>
                      </div>

                      {/* Custom Dialogue bubble inside Stage */}
                      {dialogueText && (
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-brand-sidebar/95 backdrop-blur-md p-2 rounded-lg border border-brand-border/60 text-[10px] text-brand-textMain text-center shadow-md">
                          {dialogueText}
                        </div>
                      )}
                    </div>

                    {/* Viewport Control Panel */}
                    <div className="mt-3.5 space-y-2 border-t border-brand-border/30 pt-3">
                      {/* Camera Angle */}
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-brand-textMuted flex items-center gap-1 font-medium">
                          <Camera size={11} /> Camera Angle
                        </span>
                        <div className="flex bg-brand-bg rounded border border-brand-border/60 p-0.5">
                          {(['close-up', 'normal', 'full'] as const).map((angle) => (
                            <button
                              key={angle}
                              onClick={() => setCameraAngle(angle)}
                              className={`px-1.5 py-0.5 rounded capitalize text-[9px] font-medium transition-all ${
                                cameraAngle === angle
                                  ? 'bg-brand-card text-brand-textMain border border-brand-border/40 shadow-sm font-semibold'
                                  : 'text-brand-textMuted hover:text-brand-textMain'
                              }`}
                            >
                              {angle.replace('-', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tired Mode Toggle */}
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-brand-textMuted flex items-center gap-1 font-medium">
                          <Coffee size={11} /> Dark Circles
                        </span>
                        <button
                          onClick={() => setDarkCircles(!darkCircles)}
                          className={`w-8 h-4 rounded-full p-0.5 transition-all duration-200 ${
                            darkCircles ? 'bg-amber-500/80' : 'bg-brand-border'
                          }`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full bg-white transition-transform duration-200 transform ${
                              darkCircles ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── ACCORDION SECTION 2: STATS & INTERACTIONS ── */}
                <div className="rounded-2xl border border-brand-border bg-brand-sidebar/40 overflow-hidden shadow-sm transition-all duration-200">
                  <button
                    onClick={() => setIsInteractionsCollapsed(!isInteractionsCollapsed)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-brand-bg/50 border-b border-brand-border/60 hover:bg-brand-hover/50 transition-colors text-xs font-semibold text-brand-textMain"
                  >
                    <div className="flex items-center gap-1.5">
                      <Heart size={13} className="text-rose-400" />
                      <span>Stats & Interactions</span>
                    </div>
                    {isInteractionsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>

                  <div className={`transition-all duration-300 ease-in-out ${isInteractionsCollapsed ? 'h-0 opacity-0 overflow-hidden' : 'h-auto opacity-100 p-3 space-y-3'}`}>
                    {/* Progress Stats */}
                    <div className="space-y-2 bg-brand-bg/40 p-2.5 rounded-xl border border-brand-border/30">
                      {/* Affection bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-medium">
                          <span className="text-brand-textMain flex items-center gap-1">
                            <Heart size={9} className="text-rose-400 fill-rose-400" /> Affection
                          </span>
                          <span className="text-brand-textMuted font-mono">Lv. {Math.floor(affection / 20) + 1} ({affection}/100)</span>
                        </div>
                        <div className="w-full h-1.5 bg-brand-border/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-rose-400 to-purple-400 transition-all duration-300"
                            style={{ width: `${affection}%` }}
                          />
                        </div>
                      </div>

                      {/* Energy bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-medium">
                          <span className="text-brand-textMain flex items-center gap-1">
                            <Battery size={10} className="text-emerald-400" /> Energy
                          </span>
                          <span className="text-brand-textMuted font-mono">{energy}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-brand-border/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-300"
                            style={{ width: `${energy}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Interactions Grid */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => {
                          setCustomMood('happy');
                          setAffection((a) => Math.min(a + 5, 100));
                          setEnergy((e) => Math.max(e - 2, 0));
                          const res = "Aw, thank you! I'm feeling super motivated now!";
                          setDialogueText(res);
                          setLipSync(true);
                          setTimeout(() => setLipSync(false), 2000);
                        }}
                        className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-brand-bg border border-brand-border/60 text-xs font-semibold text-brand-textMain hover:bg-brand-hover hover:border-brand-border transition-colors shadow-sm"
                      >
                        <Smile size={14} className="text-amber-400" />
                        <span>Cheer Up</span>
                      </button>

                      <button
                        onClick={() => {
                          setCustomMood('celebrate');
                          setAffection((a) => Math.min(a + 10, 100));
                          setEnergy((e) => Math.max(e - 3, 0));
                          const res = "Ehehe, praising me makes me want to work harder!";
                          setDialogueText(res);
                          setLipSync(true);
                          setTimeout(() => setLipSync(false), 2500);
                        }}
                        className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-brand-bg border border-brand-border/60 text-xs font-semibold text-brand-textMain hover:bg-brand-hover hover:border-brand-border transition-colors shadow-sm"
                      >
                        <Heart size={14} className="text-rose-400" />
                        <span>Praise</span>
                      </button>

                      <button
                        onClick={() => {
                          setCustomMood('working');
                          setEnergy((e) => Math.max(e - 10, 0));
                          const res = "Full focus mode! I'll watch the workspace files.";
                          setDialogueText(res);
                          setLipSync(true);
                          setTimeout(() => setLipSync(false), 2000);
                        }}
                        className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-brand-bg border border-brand-border/60 text-xs font-semibold text-brand-textMain hover:bg-brand-hover hover:border-brand-border transition-colors shadow-sm"
                      >
                        <Zap size={14} className="text-emerald-400" />
                        <span>Focus</span>
                      </button>

                      <button
                        onClick={() => {
                          if (customMood === 'sleeping') {
                            setCustomMood(null);
                            setEnergy((e) => Math.min(e + 20, 100));
                            setDialogueText("Yawn... sleeping state deactivated. Ready!");
                          } else {
                            setCustomMood('sleeping');
                            setEnergy((e) => Math.min(e + 40, 100));
                            setDialogueText("Time to rest. Good night! Zzz...");
                          }
                        }}
                        className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-brand-bg border border-brand-border/60 text-xs font-semibold text-brand-textMain hover:bg-brand-hover hover:border-brand-border transition-colors shadow-sm"
                      >
                        {customMood === 'sleeping' ? (
                          <>
                            <Sun size={14} className="text-yellow-400" />
                            <span>Wake Up</span>
                          </>
                        ) : (
                          <>
                            <Moon size={14} className="text-indigo-400" />
                            <span>Sleep</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── ACCORDION SECTION 3: SAY / CHAT CONSOLE ── */}
                <div className="rounded-2xl border border-brand-border bg-brand-sidebar/40 overflow-hidden shadow-sm transition-all duration-200">
                  <button
                    onClick={() => setIsConsoleCollapsed(!isConsoleCollapsed)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-brand-bg/50 border-b border-brand-border/60 hover:bg-brand-hover/50 transition-colors text-xs font-semibold text-brand-textMain"
                  >
                    <div className="flex items-center gap-1.5">
                      <MessageSquare size={13} className="text-brand-primary" />
                      <span>Say Something</span>
                    </div>
                    {isConsoleCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>

                  <div className={`transition-all duration-300 ease-in-out ${isConsoleCollapsed ? 'h-0 opacity-0 overflow-hidden' : 'h-auto opacity-100 p-3'}`}>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!chatInput.trim()) return;
                        
                        const text = chatInput.trim().toLowerCase();
                        setChatInput('');
                        
                        let response = `Hmm, I'm thinking about "${chatInput}"...`;
                        if (text.includes('hello') || text.includes('hi') || text.includes('hey')) {
                          response = `Hello! How's your coding going today? Let's make something amazing!`;
                        } else if (text.includes('status') || text.includes('work') || text.includes('code')) {
                          response = `I'm monitoring your active workspace. Everything is set up perfectly!`;
                        } else if (text.includes('tired') || text.includes('sleep') || text.includes('rest')) {
                          response = `Make sure to take a screen break! I can watch over your agent runs.`;
                        } else if (text.includes('help') || text.includes('what can you do')) {
                          response = `I can help you stay focused, celebrate successful builds, or sulk when compilation fails!`;
                        } else {
                          const genericLines = [
                            "Let's write some clean, bug-free code together!",
                            "Don't worry, even complex tasks can be solved step by step.",
                            "Your code is looking great! Keep up the momentum.",
                            "I'm keeping an eye on the background services for you."
                          ];
                          response = genericLines[Math.floor(Math.random() * genericLines.length)];
                        }

                        // Synth beep play
                        try {
                          const AudioContextClass =
                            window.AudioContext ||
                            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
                          if (AudioContextClass) {
                            const audioCtx = new AudioContextClass();
                            const osc = audioCtx.createOscillator();
                            osc.connect(audioCtx.destination);
                            osc.frequency.setValueAtTime(580, audioCtx.currentTime);
                            osc.start();
                            osc.stop(audioCtx.currentTime + 0.1);
                          }
                        } catch (_) {}

                        setDialogueText(response);
                        setLipSync(true);
                        const duration = Math.min(Math.max(response.length * 80, 1500), 4000);
                        setTimeout(() => setLipSync(false), duration);
                        setAffection(prev => Math.min(prev + 1, 100));
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        placeholder={`Talk to ${activePartner.name}...`}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-xs text-brand-textMain placeholder:text-brand-textMuted focus:outline-none focus:border-brand-primary"
                      />
                      <button
                        type="submit"
                        disabled={!chatInput.trim()}
                        className="p-1.5 rounded-xl bg-brand-primary text-brand-bg hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center shadow"
                      >
                        <Send size={13} />
                      </button>
                    </form>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-brand-textMuted">
                <Sparkles size={28} className="text-brand-textMuted/40 mb-2" />
                <p className="text-xs font-medium text-brand-textMain">No Partner Active</p>
                <p className="text-[11px] text-brand-textMuted mt-1">
                  Select a Partner in Settings → Companion to show your AI character.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: CHAT INFO & CONTEXT (Soft Apple/Claude UI) ───────────── */}
        {activeTab === 'info' && (
          <div className="space-y-5 px-1 py-1 text-xs animate-in fade-in duration-150">
            {/* 1. Session Overview */}
            <div className="space-y-3 pb-4 border-b border-brand-border/30">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-brand-textMain leading-snug line-clamp-2">
                    {activeChat?.title || 'Active Session'}
                  </h4>
                  {(activeChat?.project || draftProject || activeProject) && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-brand-textMuted">
                      <span>Project:</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-inner-bg/80 text-brand-textMain border border-brand-border/30">
                        {activeChat?.project || draftProject || activeProject}
                      </span>
                    </div>
                  )}
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                    isGenerating
                      ? 'bg-[color:var(--neon-live)]/15 text-[color:var(--neon-live)] border border-[color:var(--neon-live)]/30'
                      : 'bg-brand-inner-bg/80 text-brand-textMuted border border-brand-border/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isGenerating ? 'bg-[color:var(--neon-live)] animate-pulse' : 'bg-brand-textMuted/60'
                    }`}
                  />
                  {isGenerating ? 'Active' : 'Idle'}
                </span>
              </div>

              {/* Chat ID row */}
              <div className="flex items-center justify-between py-1 text-[11px]">
                <span className="text-brand-textMuted font-mono">Chat ID</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-brand-textMain px-1.5 py-0.5 rounded bg-brand-inner-bg/80 border border-brand-border/30 select-all max-w-[140px] truncate">
                    {activeChatId || 'draft-chat'}
                  </span>
                  <button
                    onClick={() => {
                      if (activeChatId) {
                        navigator.clipboard.writeText(activeChatId);
                        setCopiedId(true);
                        setTimeout(() => setCopiedId(false), 2000);
                      }
                    }}
                    className="p-1 rounded text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
                    title="Copy Chat ID"
                  >
                    {copiedId ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

              {/* Adaptive Mode / Model row */}
              <div className="flex items-center justify-between py-1 text-[11px]">
                <span className="text-brand-textMuted">Mode</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-medium bg-brand-inner-bg/90 text-brand-textMain border border-brand-border/30">
                  <Sparkles size={11} className="text-brand-primary" />
                  {chatStats.models.displayLabel}
                </span>
              </div>

              {/* Created row */}
              {activeChat?.timestamp && (
                <div className="flex items-center justify-between py-1 text-[11px]">
                  <span className="text-brand-textMuted">Created</span>
                  <span className="text-brand-textMain font-medium">
                    {new Date(activeChat.timestamp).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* 2. Context & Tokens (No Progress Bar, Zero-Suppressed) */}
            <div className="space-y-2.5 pb-4 border-b border-brand-border/30">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-brand-textMuted">
                  Context Window
                </span>
                <span className="text-[11px] font-mono font-semibold text-brand-textMain">
                  {chatStats.pct > 0 ? `${chatStats.pct}%` : chatStats.usedTokens > 0 ? '< 1%' : '0%'}
                </span>
              </div>

              <div className="flex items-baseline justify-between text-xs">
                <span className="font-mono font-semibold text-brand-textMain text-sm">
                  {chatStats.formattedTokens}{' '}
                  <span className="text-[11px] text-brand-textMuted font-normal">
                    / {chatStats.formattedLimit} tokens
                  </span>
                </span>
                <span className="text-[10px] text-brand-textMuted font-mono">
                  ~{Math.max(0, Math.round((chatStats.limitTokens - chatStats.usedTokens) / 1000))}k remaining
                </span>
              </div>

              {/* Non-zero Token Breakdown Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {chatStats.breakdown.user > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-brand-inner-bg/80 text-[10px] font-mono text-brand-textMuted border border-brand-border/30">
                    User: <strong className="text-brand-textMain font-medium">{chatStats.breakdown.user.toLocaleString()}</strong>
                  </span>
                )}
                {chatStats.breakdown.assistant > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-brand-inner-bg/80 text-[10px] font-mono text-brand-textMuted border border-brand-border/30">
                    Assistant: <strong className="text-brand-textMain font-medium">{chatStats.breakdown.assistant.toLocaleString()}</strong>
                  </span>
                )}
                {(chatStats.breakdown.tools + chatStats.breakdown.system) > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-brand-inner-bg/80 text-[10px] font-mono text-brand-textMuted border border-brand-border/30">
                    Tools & System: <strong className="text-brand-textMain font-medium">{(chatStats.breakdown.tools + chatStats.breakdown.system).toLocaleString()}</strong>
                  </span>
                )}
                {chatStats.breakdown.subagents > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-brand-inner-bg/80 text-[10px] font-mono text-brand-textMuted border border-brand-border/30">
                    Sub-agents: <strong className="text-brand-textMain font-medium">{chatStats.breakdown.subagents.toLocaleString()}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* 3. Cost & Usage (Zero-Suppressed) */}
            {(!chatStats.isFreeModel || chatStats.totalCost > 0) && (
              <div className="space-y-2 pb-4 border-b border-brand-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-brand-textMuted">
                    Estimated Cost
                  </span>
                  <span className="text-xs font-mono font-bold text-brand-textMain">
                    {chatStats.isFreeModel
                      ? 'Free (Local)'
                      : chatStats.totalCost < 0.001
                      ? '< $0.001'
                      : `$${chatStats.totalCost.toFixed(4)}`}
                  </span>
                </div>

                {chatStats.subagentsCost > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-brand-textMuted font-mono">
                    <span>Main Chat: {chatStats.mainChatCost < 0.001 ? '< $0.001' : `$${chatStats.mainChatCost.toFixed(4)}`}</span>
                    <span>Sub-agents: {chatStats.subagentsCost < 0.001 ? '< $0.001' : `$${chatStats.subagentsCost.toFixed(4)}`}</span>
                  </div>
                )}

                {!chatStats.isFreeModel && (
                  <p className="text-[9px] text-brand-textMuted/70 font-mono">
                    Rates: ${chatStats.pricingRates.inputPrice} in / ${chatStats.pricingRates.outputPrice} out per 1M tok
                  </p>
                )}
              </div>
            )}

            {/* 4. Storage & Trajectory (Zero-Suppressed) */}
            {(chatStats.totalSizeBytes > 0 || steps.length > 0) && (
              <div className="space-y-2 pb-4 border-b border-brand-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-brand-textMuted">
                    Storage & Activity
                  </span>
                  {chatStats.totalSizeBytes > 0 && (
                    <span className="text-xs font-mono font-medium text-brand-textMain">
                      {chatStats.formattedSize}
                    </span>
                  )}
                </div>

                {chatStats.attachmentsBytes > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-brand-textMuted font-mono">
                    <span>Transcript: {formatByteSize(chatStats.transcriptBytes)}</span>
                    <span>Media: {formatByteSize(chatStats.attachmentsBytes)}</span>
                  </div>
                )}

                {steps.length > 0 && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-brand-textMuted">Trajectory Steps</span>
                    <span className="font-mono text-brand-textMain font-medium">{steps.length}</span>
                  </div>
                )}

                {modifiedFiles.length > 0 && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-brand-textMuted">Modified Files</span>
                    <button
                      onClick={() => setActiveTab('files')}
                      className="font-mono text-brand-primary hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>{modifiedFiles.length} file{modifiedFiles.length > 1 ? 's' : ''}</span>
                      <ChevronRight size={12} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 5. Attachments & Media (STRICTLY ZERO-SUPPRESSED: Only if attachments.length > 0) */}
            {chatStats.attachments.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-brand-textMuted">
                    Attachments ({chatStats.attachments.length})
                  </span>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                  {chatStats.attachments.map((att: ChatAttachmentItem) => (
                    <AttachmentPreviewItem
                      key={att.id}
                      attachment={att}
                      defaultExpanded={chatStats.attachments.length <= 3}
                      onEnlarge={(src, title) => setLightboxImage({ src, title })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Collapsed Rail (only on desktop lg+ when collapsed) */}
      {isCollapsed && (
        <div className="hidden lg:flex flex-col items-center py-3 px-1.5 bg-brand-inner-bg border-l border-brand-border/40 select-none z-20 shrink-0">
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors mb-3 cursor-pointer"
            title="Expand Right Sidebar"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setActiveTab('overview'); setIsCollapsed(false); }}
              className={`relative p-2 rounded-lg transition-colors cursor-pointer ${isOverviewTab ? 'bg-brand-card text-brand-textMain border border-brand-border' : 'text-brand-textMuted hover:text-brand-textMain'}`}
              title="Overview & File Changes"
            >
              <FileCode2 size={16} />
              {modifiedFiles.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-primary text-[9px] font-bold text-brand-bg flex items-center justify-center">
                  {modifiedFiles.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setActiveTab('agents'); setIsCollapsed(false); }}
              className={`relative p-2 rounded-lg transition-colors cursor-pointer ${activeTab === 'agents' ? 'bg-brand-card text-brand-textMain border border-brand-border' : 'text-brand-textMuted hover:text-brand-textMain'}`}
              title="Sub-agents in this Chat"
            >
              <Users size={16} />
              {subagentItems.some((a: SubagentExecutionItem) => a.status === 'running') ? (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[color:var(--neon-live)] animate-pulse" />
              ) : subagentItems.length > 0 ? (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-border text-[9px] font-bold text-brand-textMain flex items-center justify-center">
                  {subagentItems.length}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => { setActiveTab('partner'); setIsCollapsed(false); }}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${activeTab === 'partner' ? 'bg-brand-card text-brand-textMain border border-brand-border' : 'text-brand-textMuted hover:text-brand-textMain'}`}
              title="Partner Companion"
            >
              <Sparkles size={16} />
            </button>

            <button
              onClick={() => { setActiveTab('info'); setIsCollapsed(false); }}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${activeTab === 'info' ? 'bg-brand-card text-brand-textMain border border-brand-border' : 'text-brand-textMuted hover:text-brand-textMain'}`}
              title="Chat Info & Context"
            >
              <Info size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Desktop Expanded Sidebar (only on desktop lg+ when not collapsed) */}
      {!isCollapsed && (
        <aside className="hidden lg:flex w-80 h-full flex-col bg-brand-inner-bg border-l border-brand-border/40 select-none z-20 overflow-hidden transition-all duration-200 shrink-0">
          {renderSidebarContent(false)}
        </aside>
      )}

      {/* Mobile Drawer Overlay (only below lg when isMobileOpen is true) */}
      {isMobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-xs lg:hidden animate-in fade-in duration-200"
            onClick={handleCloseMobileDrawer}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-[88vw] sm:w-88 max-w-sm h-full flex flex-col bg-brand-inner-bg shadow-2xl border-l border-brand-border/40 select-none overflow-hidden animate-in slide-in-from-right duration-200 lg:hidden">
            {renderSidebarContent(true)}
          </aside>
        </>
      )}

      {/* Lightbox Modal for Attachment Image Preview */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[3000] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image Preview"
        >
          {/* Header Bar */}
          <div
            className="w-full max-w-4xl flex items-center justify-between py-2.5 px-4 mb-2 bg-brand-sidebar/90 rounded-xl border border-white/10 backdrop-blur-md select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ImageIcon size={15} className="text-emerald-400 shrink-0" />
              <span className="text-xs font-mono font-medium text-white truncate">
                {lightboxImage.title}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setLightboxImage(null)}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Centered Image */}
          <div
            className="relative max-w-4xl max-h-[80vh] flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-2xl bg-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.src}
              alt={lightboxImage.title}
              className="max-w-full max-h-[80vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
};

// ── INTERNAL DIALOGUE SYNC SHIM ──
interface DialogueSyncProps {
  activePartner: PartnerManifest;
  mood: PartnerMood;
  dialogueText: string;
  setDialogueText: (t: string) => void;
  setLipSync: (on: boolean) => void;
}

const DialogueSync: React.FC<DialogueSyncProps> = ({
  activePartner,
  mood,
  dialogueText,
  setDialogueText,
  setLipSync
}) => {
  useEffect(() => {
    // Determine the reaction line
    const reaction = moodReaction(activePartner, mood);
    const line = reaction.line || (
      mood === 'working'
        ? 'Analyzing files & writing code...'
        : mood === 'sad'
        ? 'Ouch, an error occurred. Let’s retry!'
        : `${activePartner.name} is ready to assist you.`
    );
    
    setDialogueText(line);
    setLipSync(true);
    const duration = Math.min(Math.max(line.length * 80, 1500), 4000);
    const timer = setTimeout(() => {
      setLipSync(false);
    }, duration);

    return () => clearTimeout(timer);
  }, [mood, activePartner, setDialogueText, setLipSync]);

  return null;
};

