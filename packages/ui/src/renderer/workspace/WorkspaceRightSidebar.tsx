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
  Sun
} from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useSessionStore } from '../stores/sessionStore';
import { usePartners } from '../pages/Settings/companion/library';
import { PetSprite } from '../partner-popup/PetSprite';
import { ErrorBoundary } from '../components/ErrorBoundary';
import type { TrajectoryStep } from '../pages/Workspace/TrajectoryCanvas';
import type { PartnerMood, PartnerManifest } from '../partner-popup/types';
import { moodReaction } from '../partner-popup/types';

export type WorkspaceSidebarTab = 'files' | 'agents' | 'partner';

export interface WorkspaceRightSidebarProps {
  steps?: TrajectoryStep[];
  isGenerating?: boolean;
  activeChatId?: string;
  onViewDiff?: (filename: string, originalCode: string, modifiedCode: string) => void;
  onAddAgentSession?: () => void;
  onSelectChat?: (chatId: string) => void;
}

export interface ModifiedFileItem {
  filename: string;
  action: 'modified' | 'added' | 'deleted';
  originalCode: string;
  modifiedCode: string;
  stepId: string;
}

export const WorkspaceRightSidebar: React.FC<WorkspaceRightSidebarProps> = ({
  steps = [],
  isGenerating = false,
  activeChatId,
  onViewDiff,
  onAddAgentSession,
  onSelectChat
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceSidebarTab>('files');
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


  // Read stores
  const chats = useChatStore((s) => s.chats);
  const activeChat = chats.find((c) => c.id === activeChatId);
  const runningSessions = useSessionStore((s) => s.runningSessions);

  // Partner hooks
  const partners = usePartners();
  const activePartner = partners.pets.find((p) => p.id === partners.activeId) || partners.pets[0] || null;

  // Compute file changes from trajectory steps
  const modifiedFiles = useMemo(() => {
    const fileMap = new Map<string, ModifiedFileItem>();

    steps.forEach((step) => {
      // Check tool metadata or content for file modifications
      if (step.metadata?.diff) {
        const { filename, originalCode, modifiedCode } = step.metadata.diff as any;
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

  // Compute multiagent running items
  const agentItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      isRunning: boolean;
      startedAt?: number;
      model?: string;
      lastError?: string;
    }> = [];

    // Main running sessions from sessionStore
    runningSessions.forEach((sess, id) => {
      const chat = chats.find((c) => c.id === id);
      items.push({
        id,
        title: chat?.title || `Session ${id.slice(0, 8)}`,
        isRunning: sess.isGenerating,
        startedAt: sess.startedAt,
        model: chat?.model || 'Auto Orchestrator',
        lastError: sess.lastError
      });
    });

    // Also include other non-running active chats if list is short
    chats.forEach((c) => {
      if (!items.some((i) => i.id === c.id)) {
        items.push({
          id: c.id,
          title: c.title || 'Untitled Session',
          isRunning: c.isRunning || false,
          startedAt: c.startedAt,
          model: c.model || 'Default Model',
          lastError: c.lastError
        });
      }
    });

    return items;
  }, [runningSessions, chats]);

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

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-3 px-1.5 bg-brand-sidebar/95 border-l border-brand-border/60 select-none z-20">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors mb-3"
          title="Expand Right Sidebar"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => { setActiveTab('files'); setIsCollapsed(false); }}
            className={`relative p-2 rounded-lg transition-colors ${activeTab === 'files' ? 'bg-brand-card text-brand-textMain border border-brand-border' : 'text-brand-textMuted hover:text-brand-textMain'}`}
            title="File Changes"
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
            className={`relative p-2 rounded-lg transition-colors ${activeTab === 'agents' ? 'bg-brand-card text-brand-textMain border border-brand-border' : 'text-brand-textMuted hover:text-brand-textMain'}`}
            title="Multiagent Sessions"
          >
            <Users size={16} />
            {agentItems.filter(a => a.isRunning).length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[color:var(--neon-live)] animate-pulse" />
            )}
          </button>

          <button
            onClick={() => { setActiveTab('partner'); setIsCollapsed(false); }}
            className={`p-2 rounded-lg transition-colors ${activeTab === 'partner' ? 'bg-brand-card text-brand-textMain border border-brand-border' : 'text-brand-textMuted hover:text-brand-textMain'}`}
            title="Partner Companion"
          >
            <Sparkles size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside className="w-80 h-full flex flex-col bg-brand-sidebar/95 border-l border-brand-border/60 select-none z-20 overflow-hidden transition-all duration-200">
      {/* Sidebar Header & Tab Nav */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-brand-border/60 bg-brand-sidebar/80">
        <div className="flex items-center gap-1 bg-brand-bg/60 p-1 rounded-lg border border-brand-border/40">
          <button
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              activeTab === 'files'
                ? 'bg-brand-card text-brand-textMain shadow-sm border border-brand-border/60'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <FileCode2 size={13} />
            <span>Diffs</span>
            {modifiedFiles.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-brand-border text-[9px] text-brand-textMain font-mono">
                {modifiedFiles.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              activeTab === 'agents'
                ? 'bg-brand-card text-brand-textMain shadow-sm border border-brand-border/60'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <Users size={13} />
            <span>Agents</span>
            {agentItems.filter(a => a.isRunning).length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)] animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('partner')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              activeTab === 'partner'
                ? 'bg-brand-card text-brand-textMain shadow-sm border border-brand-border/60'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <Sparkles size={13} />
            <span>Partner</span>
          </button>
        </div>

        {/* Collapse button */}
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors"
          title="Collapse Panel"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-brand-border">
        {/* ── TAB 1: FILE CHANGES ────────────────────────────────────────── */}
        {activeTab === 'files' && (
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
                  <span>CHANGED FILES ({filteredFiles.length})</span>
                  <span>CLICK TO VIEW DIFF</span>
                </div>

                {filteredFiles.map((file) => (
                  <div
                    key={file.filename}
                    onClick={() => onViewDiff?.(file.filename, file.originalCode, file.modifiedCode)}
                    className="group glass-card p-2.5 rounded-xl border border-brand-border/60 hover:border-brand-border hover:bg-brand-hover cursor-pointer transition-all flex items-center justify-between gap-2"
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

        {/* ── TAB 2: MULTIAGENT RUNNING NAMES ──────────────────────────────── */}
        {activeTab === 'agents' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-brand-textMuted uppercase tracking-wider">
                Multiagent Sessions ({agentItems.length})
              </span>
              {onAddAgentSession && (
                <button
                  onClick={onAddAgentSession}
                  className="flex items-center gap-1 text-[10px] font-medium text-brand-primary hover:text-brand-primary/80 transition-colors"
                >
                  <Plus size={11} />
                  <span>New Agent</span>
                </button>
              )}
            </div>

            {agentItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-brand-textMuted">
                <Bot size={28} className="text-brand-textMuted/40 mb-2" />
                <p className="text-xs font-medium text-brand-textMain">No Multiagent Sessions</p>
                <p className="text-[11px] text-brand-textMuted mt-1">
                  Launch parallel agents to execute independent tasks in background threads.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {agentItems.map((agent) => (
                  <div
                    key={agent.id}
                    onClick={() => onSelectChat?.(agent.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      agent.id === activeChatId
                        ? 'bg-brand-card border-brand-border text-brand-textMain shadow-sm'
                        : 'bg-brand-bg/40 border-brand-border/40 text-brand-textMuted hover:bg-brand-hover hover:text-brand-textMain'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Bot
                          size={15}
                          className={agent.isRunning ? 'text-[color:var(--neon-live)] animate-pulse' : 'text-brand-textMuted'}
                        />
                        <span className="text-xs font-semibold truncate text-brand-textMain">
                          {agent.title}
                        </span>
                      </div>

                      <span
                        className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          agent.isRunning
                            ? 'bg-[color:var(--neon-live)]/15 text-[color:var(--neon-live)] font-semibold'
                            : 'bg-brand-border/40 text-brand-textMuted'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            agent.isRunning ? 'bg-[color:var(--neon-live)] animate-pulse' : 'bg-brand-textMuted/40'
                          }`}
                        />
                        {agent.isRunning ? 'Running' : 'Idle'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-brand-textMuted mt-2 pt-2 border-t border-brand-border/30">
                      <span className="truncate">Model: {agent.model}</span>
                      <span>{agent.id === activeChatId ? 'Active' : 'Switch'}</span>
                    </div>
                  </div>
                ))}
              </div>
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
                            onPoke={(part) => {
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
                          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
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
      </div>
    </aside>
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

