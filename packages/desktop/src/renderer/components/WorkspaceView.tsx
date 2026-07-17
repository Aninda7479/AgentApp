import React, { useState } from 'react';
import { CalendarDays, Folder, Plug, Sparkles, Stethoscope, Terminal, Bot, Plus, X } from 'lucide-react';
import { Composer, ComposerOptions } from './Composer';
import { TrajectoryCanvas, TrajectoryStep } from './TrajectoryCanvas';
import { MCPServerInfo } from './MCPDashboard';
import { ModelConfig } from '../settings/SettingsView';
import { WorkspaceService } from '../logic/workspace';

/** Represents a parallel agent session with its own trajectory. */
export interface AgentSession {
  id: string;
  label: string;
  project: string;
  model: string;
  steps: TrajectoryStep[];
  isGenerating: boolean;
  startedAt: number;
}

interface WorkspaceViewProps {
  activeProject: string;
  trajectorySteps: TrajectoryStep[];
  isGenerating: boolean;
  startedAt?: number;
  modelsCatalog: ModelConfig[];
  mcpServers: MCPServerInfo[];
  hasCredentials: boolean;
  composerPrompt: string;
  onPromptChange: (value: string) => void;
  onSendPrompt: (prompt: string, options: ComposerOptions) => void;
  onStop: () => void;
  onViewDiff: (filename: string, originalCode: string, modifiedCode: string) => void;
  onOpenMcp: () => void;
  onOpenSettings: () => void;
  onToast: (message: string) => void;
  onUndoStep?: (stepId: string) => void;
  onAttachClick?: () => void;
  onAttachPastedFiles?: (files: FileList) => void;
  composerAttachments?: any[];
  onRemoveAttachment?: (index: number) => void;
  /** Model of the currently open chat (used to default the composer selection). */
  activeChatModel?: string;
  /** Called when the user changes the selected model in the composer. */
  onModelChange?: (model: string) => void;
  /** Projects available for the composer context switcher. */
  projects?: { name: string }[];
  /** Switch the active project from the composer. */
  onSelectProject?: (name: string) => void;
  /** Real execution-mode setting (true = full system access). */
  unsandboxedActions?: boolean;
  onUnsandboxedActionsChange?: (value: boolean) => void;
  /** Invoked when voice dictation is unavailable in this environment. */
  onMicUnavailable?: () => void;
  /** Built-in slash commands for the composer autocomplete. */
  slashCommands?: import('./slashCommands').SlashSuggestion[];
  /** Discovered skills for the composer autocomplete. */
  skills?: import('./slashCommands').SkillInfo[];
}

const recommendations = [
  {
    title: 'Develop Dashboard',
    prompt: 'Develop a complete interactive analytics dashboard for my application',
    description: 'Generate React views, metrics charts, and CSS styling',
    Icon: Sparkles
  },
  {
    title: 'Diagnostic Run',
    prompt: 'Analyze the project source code for dependencies and vulnerabilities',
    description: 'Audit package health, search for bugs, and run checks',
    Icon: Stethoscope
  },
  {
    title: 'Integrate MCP Tools',
    prompt: 'Configure a custom MCP Server extension for this environment',
    description: 'Extend agent capabilities with databases and file APIs',
    Icon: Plug
  },
  {
    title: 'Schedule Workflows',
    prompt: 'Set up a new cron task that executes checks on a regular schedule',
    description: 'Automate builds, recurring reports, and routine tasks',
    Icon: CalendarDays
  }
];

// ─── Elapsed time display ─────────────────────────────────────────────────────
const ElapsedTimer: React.FC<{ startedAt: number; running: boolean }> = ({ startedAt, running }) => {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, running]);

  if (!running) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const label = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <span className="text-brand-textMuted text-[11px]">
      Working for <span className="text-brand-textMain font-medium">{label}</span>
    </span>
  );
};

// ─── Multi-Agent Tab Bar ──────────────────────────────────────────────────────
interface AgentTabBarProps {
  sessions: AgentSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onAddSession: () => void;
  onCloseSession: (id: string) => void;
  /** Disabled until at least one enabled model is connected. */
  disabled: boolean;
}

const AgentTabBar: React.FC<AgentTabBarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onAddSession,
  onCloseSession,
  disabled
}) => (
  <div className="flex items-center gap-1 px-4 py-1.5 border-b border-brand-border/60 bg-brand-sidebar overflow-x-auto scrollbar-thin">
    {sessions.map(session => (
      <button
        key={session.id}
        onClick={() => onSelectSession(session.id)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all select-none group flex-shrink-0 ${
          session.id === activeSessionId
            ? 'bg-brand-card border border-brand-border text-brand-textMain'
            : 'text-brand-textMuted hover:text-brand-textMain hover:bg-white/5'
        }`}
      >
        <Bot size={11} className={session.isGenerating ? 'text-[var(--neon-live)] animate-pulse' : 'text-brand-textMuted'} />
        <span className="max-w-[100px] truncate">{session.label}</span>
        {session.isGenerating && (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--neon-live)] animate-pulse flex-shrink-0" />
        )}
        {sessions.length > 1 && (
          <span
            onClick={e => { e.stopPropagation(); onCloseSession(session.id); }}
            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-[color:var(--neon-destructive)] transition-all cursor-pointer"
          >
            <X size={10} />
          </span>
        )}
      </button>
    ))}

    {/* Add new agent session */}
    <button
      onClick={onAddSession}
      disabled={disabled}
      title={disabled ? 'Connect a model in Settings to use agents' : 'Run another agent in parallel'}
      className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-brand-textMuted transition-all select-none flex-shrink-0 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:text-brand-textMain hover:bg-brand-hover cursor-pointer'
      }`}
    >
      <Plus size={12} />
      <span className="text-[11px]">New agent</span>
    </button>
  </div>
);

// ─── WorkspaceView ────────────────────────────────────────────────────────────

/** Main workspace view combining trajectory canvas, composer, and multi-agent tabs. */
export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  activeProject,
  trajectorySteps,
  isGenerating,
  startedAt,
  modelsCatalog,
  mcpServers,
  hasCredentials,
  composerPrompt,
  onPromptChange,
  onSendPrompt,
  onStop,
  onViewDiff,
  onOpenMcp,
  onOpenSettings,
  onToast,
  onUndoStep,
  onAttachClick,
  onAttachPastedFiles,
  composerAttachments = [],
  onRemoveAttachment,
  activeChatModel,
  onModelChange,
  projects = [],
  onSelectProject,
  unsandboxedActions = false,
  onUnsandboxedActionsChange,
  onMicUnavailable,
  slashCommands,
  skills = []
}) => {
  // Only surface models the user has ENABLED in Settings → Models. Each catalog
  // entry carries a per-model `enabled` flag (ModelConfig.enabled); connected
  // providers' models default to enabled:true in enrichModel, so first-run users
  // still see their connected models — the toggle is the refinement that lets a
  // user hide models they don't want from the workspace/composer dropdown.
  const enabledModels = modelsCatalog.filter((m) => m.enabled);

  // ── Multi-agent session state ──────────────────────────────────────────────
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([
    {
      id: 'session-main',
      label: activeProject || 'Agent 1',
      project: activeProject,
      model: enabledModels[0]?.name || '',
      steps: trajectorySteps,
      isGenerating,
      startedAt: startedAt || Date.now()
    }
  ]);
  const [activeSessionId, setActiveSessionId] = useState('session-main');

  // Sync primary session steps with parent state
  React.useEffect(() => {
    setAgentSessions(prev => prev.map(s =>
      s.id === 'session-main'
        ? { ...s, steps: trajectorySteps, isGenerating, project: activeProject, startedAt: startedAt || s.startedAt }
        : s
    ));
  }, [trajectorySteps, isGenerating, activeProject, startedAt]);

  const activeSession = agentSessions.find(s => s.id === activeSessionId) || agentSessions[0];
  const showMultiAgentBar = agentSessions.length > 1;

  // Mirror the composer's gate: an agent session can't actually run until a
  // usable (enabled) model exists, so the entry points that spawn one are
  // disabled when there are no enabled models rather than letting a user create
  // a dead, un-sendable agent.
  const noModels = enabledModels.length === 0;

  const handleAddAgentSession = () => {
    const newId = `session-${Date.now()}`;
    const newSession: AgentSession = {
      id: newId,
      label: `Agent ${agentSessions.length + 1}`,
      project: activeProject,
      model: enabledModels[0]?.name || '',
      steps: [],
      isGenerating: false,
      startedAt: Date.now()
    };
    setAgentSessions(prev => [...prev, newSession]);
    setActiveSessionId(newId);
    onToast(`Launched parallel Agent ${agentSessions.length + 1}`);
  };

  const handleCloseSession = (id: string) => {
    if (id === 'session-main') return; // can't close main
    setAgentSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(next[next.length - 1]?.id || 'session-main');
      }
      return next;
    });
  };

  // Send prompt routed to active session
  const handleSendPromptForSession = (prompt: string, options: ComposerOptions) => {
    if (activeSessionId === 'session-main') {
      onSendPrompt(prompt, options);
    } else {
      // Parallel session: update local steps and simulate (real engine hook-up in Phase 2)
      const userStep: TrajectoryStep = {
        id: `step-user-${Date.now()}`,
        type: 'user',
        content: prompt,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      const thinkStep: TrajectoryStep = {
        id: `step-thought-${Date.now()}`,
        type: 'thought',
        content: `Parallel agent analyzing: "${prompt.slice(0, 60)}..."`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setAgentSessions(prev => prev.map(s =>
        s.id === activeSessionId
          ? { ...s, steps: [...s.steps, userStep, thinkStep], isGenerating: true, startedAt: Date.now() }
          : s
      ));

      // Simulate response
      setTimeout(() => {
        const assistantStep: TrajectoryStep = {
          id: `step-assistant-${Date.now()}`,
          type: 'assistant',
          content: `Parallel agent completed analysis. This session is running independently from the main agent. You can switch between sessions using the tabs above.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setAgentSessions(prev => prev.map(s =>
          s.id === activeSessionId
            ? { ...s, steps: [...s.steps, assistantStep], isGenerating: false }
            : s
        ));
      }, 2000);
    }
  };

  return (
    <>
      {/* ── Workspace Header Bar ─────────────────────────────────────────── */}
      <div className="h-9 border-b border-brand-border flex items-center justify-between gap-2 px-3 sm:px-5 bg-brand-sidebar/80 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-2 text-[11px] text-brand-textMuted min-w-0">
          <Folder size={11} className="text-brand-textMuted flex-shrink-0" />
          <span className="text-brand-textMain font-medium truncate">
            {activeProject || 'Workspace'}
          </span>
          {activeProject && <span className="text-brand-textMuted/50 flex-shrink-0">/</span>}
          <span className="text-brand-textMuted truncate">
            {activeSession?.label !== activeProject ? activeSession?.label : 'agent'}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Running agents count badge */}
          {agentSessions.filter(s => s.isGenerating).length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--neon-live)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--neon-live)] animate-pulse" />
              <span className="hidden sm:inline">{agentSessions.filter(s => s.isGenerating).length} agent{agentSessions.filter(s => s.isGenerating).length > 1 ? 's' : ''} running</span>
            </div>
          )}

          {/* Elapsed timer */}
          <ElapsedTimer startedAt={activeSession?.startedAt || Date.now()} running={activeSession?.isGenerating || false} />

          {/* MCP + Model info */}
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-brand-textMuted/70">
            <span className="flex items-center gap-1">
              <span className={`w-1 h-1 rounded-full ${mcpServers.filter(s => s.enabled).length > 0 ? 'bg-[color:var(--neon-live)]' : 'bg-brand-textMuted/30'}`} />
              <span>{mcpServers.filter(s => s.enabled).length} MCP</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Multi-Agent Tab Bar (only when > 1 session) ──────────────────── */}
      {showMultiAgentBar && (
        <AgentTabBar
          sessions={agentSessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onAddSession={handleAddAgentSession}
          onCloseSession={handleCloseSession}
          disabled={noModels}
        />
      )}

      {/* ── Trajectory Canvas ─────────────────────────────────────────────── */}
      <TrajectoryCanvas
        steps={activeSessionId === 'session-main' ? trajectorySteps : (activeSession?.steps || [])}
        isStreaming={activeSessionId === 'session-main' ? isGenerating : (activeSession?.isGenerating || false)}
        onViewDiff={onViewDiff}
        onUndoStep={onUndoStep}
        onActionClick={(action, data) => {
          if (action === 'openMedia') {
            WorkspaceService.openMedia(data?.mediaPath, () =>
              onToast(`Open Media Artifact: ${data?.mediaPath || 'No Path'}`)
            );
          }
        }}
      >
        {/* ── Welcome/Empty State ─────────────────────────────────────────── */}
        {(activeSessionId === 'session-main' ? trajectorySteps : (activeSession?.steps || [])).length === 0 && (
          <div className="flex flex-col items-center justify-center px-4 max-w-[760px] w-full mx-auto mt-6 mb-4 animate-fade-in relative">
            {/* Glow blob */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] bg-brand-textMuted/5 rounded-full blur-[90px] pointer-events-none" />

            {/* Title */}
            <div
              data-testid="workspace-title-question"
              className="text-center text-xl font-outfit font-bold tracking-tight text-brand-textMain mb-1"
            >
              {activeProject ? (
                <>
                  What should we build in{' '}
                  <span className="text-brand-textMain">
                    {activeProject}
                  </span>
                  ?
                </>
              ) : (
                'What should we build?'
              )}
            </div>
            <p className="text-brand-textMuted text-[11px] text-center mb-5">
              Select a workflow below or write a custom request to start an agent session.
            </p>

            {/* Status bar */}
            <div className="w-full max-w-[680px] mb-4 px-3.5 py-2.5 glass-card rounded-lg text-[11px] text-brand-textMuted flex gap-2 items-center border border-brand-border">
              <Terminal size={13} className="text-brand-textMuted flex-shrink-0" />
              <div>
                <span className="font-bold text-brand-textMuted mr-1.5 uppercase tracking-wider text-[9px]">
                  System:
                </span>
                <span>SuperAgent Desktop ready — {enabledModels.length > 0 ? `${enabledModels.length} model${enabledModels.length !== 1 ? 's' : ''} connected` : 'configure providers in Settings'}</span>
              </div>
            </div>

            {/* Recommendation cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-[680px] mb-5">
              {recommendations.map(({ title, prompt, description, Icon }) => (
                <button
                  key={title}
                  onClick={() => onPromptChange(prompt)}
                  className="group glass-card glow-hover p-3.5 rounded-xl cursor-pointer text-left flex gap-3 items-start transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-highlight/60"
                >
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center border border-brand-border bg-brand-hover text-brand-textMuted group-hover:text-brand-textMain transition-colors flex-shrink-0">
                    <Icon size={13} />
                  </span>
                  <span>
                    <span className="block font-semibold text-brand-textMain text-[12px]">{title}</span>
                    <span className="block text-brand-textMuted text-[10px] mt-0.5 leading-relaxed">{description}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* Status pills */}
            <div className="flex gap-2 items-center flex-wrap text-[10px] text-brand-textMuted border-t border-brand-border/30 pt-4 w-full max-w-[680px] justify-center">
              <div className="flex items-center gap-1.5 bg-brand-card border border-brand-border px-2.5 py-1 rounded-full shadow-sm">
                <span className={`w-1 h-1 rounded-full ${enabledModels.length > 0 ? 'bg-[color:var(--neon-constructive)] animate-pulse' : 'bg-brand-textMuted/30'}`} />
                <span>Models: {enabledModels.length > 0 ? enabledModels.length : 'None'}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-brand-card border border-brand-border px-2.5 py-1 rounded-full shadow-sm">
                <span className={`w-1 h-1 rounded-full ${mcpServers.filter(s => s.enabled).length > 0 ? 'bg-[color:var(--neon-live)] animate-pulse' : 'bg-brand-textMuted/30'}`} />
                <span>MCP: {mcpServers.filter(s => s.enabled).length} online</span>
              </div>
              <div className="flex items-center gap-1.5 bg-brand-card border border-brand-border px-2.5 py-1 rounded-full shadow-sm">
                <span className={`w-1 h-1 rounded-full ${hasCredentials ? 'bg-[color:var(--neon-live)] animate-pulse' : 'bg-[color:var(--neon-attention)]'}`} />
                <span>Keys: {hasCredentials ? 'Active' : 'Setup needed'}</span>
              </div>
              <button
                onClick={handleAddAgentSession}
                disabled={noModels}
                title={noModels ? 'Connect a model in Settings to use agents' : 'Run another agent in parallel'}
                className={`flex items-center gap-1.5 border px-2.5 py-1 rounded-full text-brand-textMain transition-all ${
                  noModels
                    ? 'opacity-40 cursor-not-allowed border-brand-border bg-brand-hover'
                    : 'bg-brand-hover border-brand-border hover:border-brand-border-strong cursor-pointer'
                }`}
              >
                <Bot size={10} />
                <span>Run parallel agent</span>
              </button>
            </div>
          </div>
        )}
      </TrajectoryCanvas>

      {/* ── Prompt Composer ───────────────────────────────────────────────── */}
      <Composer
        onSend={handleSendPromptForSession}
        isGenerating={activeSessionId === 'session-main' ? isGenerating : (activeSession?.isGenerating || false)}
        onStop={activeSessionId === 'session-main' ? onStop : () => {
          setAgentSessions(prev => prev.map(s =>
            s.id === activeSessionId ? { ...s, isGenerating: false } : s
          ));
        }}
        activeProject={activeProject}
        onAttachClick={onAttachClick}
        availableModels={composerModelsFromCatalog(modelsCatalog)}
        emptyStateMessage={composerEmptyStateMessage(modelsCatalog)}
        defaultModel={activeChatModel && enabledModels.some(m => m.name === activeChatModel) ? activeChatModel : (enabledModels.length > 1 ? 'Model Governance' : (enabledModels[0]?.name || ''))}
        promptValue={composerPrompt}
        onPromptChange={onPromptChange}
        onAttachPastedFiles={onAttachPastedFiles}
        attachments={composerAttachments}
        onRemoveAttachment={onRemoveAttachment}
        onModelChange={onModelChange}
        projects={projects}
        onSelectProject={onSelectProject}
        sandbox={!unsandboxedActions}
        onSandboxChange={(v) => onUnsandboxedActionsChange?.(!v)}
        onMicUnavailable={onMicUnavailable}
        slashCommands={slashCommands}
        skills={skills}
        mcpServers={mcpServers.map((s) => ({ name: s.name, id: s.id }))}
      />
    </>
  );
};

/**
 * Builds the composer's model dropdown from the connected-providers model
 * catalog, showing ONLY models the user has enabled in Settings → Models
 * (ModelConfig.enabled). Disabled models are excluded so the dropdown reflects
 * the user's selection there. Connected providers' models default to
 * enabled:true in enrichModel, so first-run users still see their connected
 * models — and the per-model toggle is what hides unwanted ones.
 */
export function composerModelsFromCatalog(modelsCatalog: ModelConfig[]): string[] {
  const enabled = modelsCatalog.filter((m) => m.enabled);
  if (enabled.length === 0) return [];
  if (enabled.length === 1) return [enabled[0].name];
  return ['Model Governance', ...enabled.map((m) => m.name)];
}

/**
 * Chooses the composer's empty-state message based on *why* no model is
 * available, so the remediation the user is told matches reality:
 *  - catalog empty → no provider connected → send them to connect one.
 *  - catalog non-empty but nothing enabled → a provider IS connected, the
 *    models are just toggled off → send them to enable one (not "connect",
 *    which was the old, misleading copy when providers were already connected).
 * Returns null when at least one model is enabled (composer is usable).
 */
export function composerEmptyStateMessage(modelsCatalog: ModelConfig[]): string | null {
  const hasAnyModel = modelsCatalog.length > 0;
  const hasEnabled = modelsCatalog.some((m) => m.enabled);
  if (hasEnabled) return null;
  if (hasAnyModel) {
    return 'A provider is connected, but no model is enabled. Enable one in Settings → Models.';
  }
  return 'No provider connected yet. Add one in Settings → Providers to start chatting.';
}
