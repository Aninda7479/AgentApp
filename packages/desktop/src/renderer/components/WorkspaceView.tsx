import React, { useState } from 'react';
import { CalendarDays, Folder, Plug, Sparkles, Stethoscope, Terminal, Bot, Plus, X } from 'lucide-react';
import { Composer, ComposerOptions } from './Composer';
import { TrajectoryCanvas, TrajectoryStep } from './TrajectoryCanvas';
import { MCPServerInfo } from './MCPDashboard';
import { ModelConfig } from '../settings/SettingsView';

// ─── Agent Session type ───────────────────────────────────────────────────────
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
}

const recommendations = [
  {
    title: 'Develop Dashboard',
    prompt: 'Develop a complete interactive analytics dashboard for my application',
    description: 'Generate React views, metrics charts, and CSS styling',
    Icon: Sparkles,
    accent: 'violet'
  },
  {
    title: 'Diagnostic Run',
    prompt: 'Analyze the project source code for dependencies and vulnerabilities',
    description: 'Audit package health, search for bugs, and run checks',
    Icon: Stethoscope,
    accent: 'emerald'
  },
  {
    title: 'Integrate MCP Tools',
    prompt: 'Configure a custom MCP Server extension for this environment',
    description: 'Extend agent capabilities with databases and file APIs',
    Icon: Plug,
    accent: 'sky'
  },
  {
    title: 'Schedule Workflows',
    prompt: 'Set up a new cron task that executes checks on a regular schedule',
    description: 'Automate builds, recurring reports, and routine tasks',
    Icon: CalendarDays,
    accent: 'rose'
  }
];

const accentClasses: Record<string, string> = {
  violet: 'bg-violet-500/10 text-violet-400 border-violet-500/25',
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  sky: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
  rose: 'bg-rose-500/10 text-rose-400 border-rose-500/25'
};

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
}

const AgentTabBar: React.FC<AgentTabBarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onAddSession,
  onCloseSession
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
        <Bot size={11} className={session.isGenerating ? 'text-violet-400 animate-pulse' : 'text-brand-textMuted'} />
        <span className="max-w-[100px] truncate">{session.label}</span>
        {session.isGenerating && (
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse flex-shrink-0" />
        )}
        {sessions.length > 1 && (
          <span
            onClick={e => { e.stopPropagation(); onCloseSession(session.id); }}
            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all cursor-pointer"
          >
            <X size={10} />
          </span>
        )}
      </button>
    ))}

    {/* Add new agent session */}
    <button
      onClick={onAddSession}
      title="Run another agent in parallel"
      className="flex items-center gap-1 px-2 py-1.5 rounded-md text-brand-textMuted hover:text-violet-400 hover:bg-violet-500/10 transition-all select-none flex-shrink-0"
    >
      <Plus size={12} />
      <span className="text-[11px]">New agent</span>
    </button>
  </div>
);

// ─── WorkspaceView ────────────────────────────────────────────────────────────

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  activeProject,
  trajectorySteps,
  isGenerating,
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
  onRemoveAttachment
}) => {
  const enabledModels = modelsCatalog.filter(model => model.enabled);

  // ── Multi-agent session state ──────────────────────────────────────────────
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([
    {
      id: 'session-main',
      label: activeProject || 'Agent 1',
      project: activeProject,
      model: enabledModels[0]?.name || '',
      steps: trajectorySteps,
      isGenerating,
      startedAt: Date.now()
    }
  ]);
  const [activeSessionId, setActiveSessionId] = useState('session-main');

  // Sync primary session steps with parent state
  React.useEffect(() => {
    setAgentSessions(prev => prev.map(s =>
      s.id === 'session-main'
        ? { ...s, steps: trajectorySteps, isGenerating, project: activeProject }
        : s
    ));
  }, [trajectorySteps, isGenerating, activeProject]);

  const activeSession = agentSessions.find(s => s.id === activeSessionId) || agentSessions[0];
  const showMultiAgentBar = agentSessions.length > 1;

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
      <div className="h-9 border-b border-brand-border/60 flex items-center justify-between px-5 bg-brand-sidebar flex-shrink-0">
        <div className="flex items-center gap-2 text-[11px] text-brand-textMuted">
          <Folder size={11} className="text-amber-500" />
          <span className="text-brand-textMain font-medium">
            {activeProject || 'Workspace'}
          </span>
          {activeProject && <span className="text-brand-textMuted/50">/</span>}
          <span className="text-brand-textMuted">
            {activeSession?.label !== activeProject ? activeSession?.label : 'agent'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Running agents count badge */}
          {agentSessions.filter(s => s.isGenerating).length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-violet-400">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span>{agentSessions.filter(s => s.isGenerating).length} agent{agentSessions.filter(s => s.isGenerating).length > 1 ? 's' : ''} running</span>
            </div>
          )}

          {/* Elapsed timer */}
          <ElapsedTimer startedAt={activeSession?.startedAt || Date.now()} running={activeSession?.isGenerating || false} />

          {/* MCP + Model info */}
          <div className="flex items-center gap-2 text-[10px] text-brand-textMuted/70">
            <span className="flex items-center gap-1">
              <span className={`w-1 h-1 rounded-full ${mcpServers.filter(s => s.enabled).length > 0 ? 'bg-emerald-500' : 'bg-brand-textMuted/30'}`} />
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
            const electron = typeof window !== 'undefined' && (window as any).require
              ? (window as any).require('electron')
              : null;
            if (electron && data?.mediaPath) {
              electron.shell.openPath(data.mediaPath);
            } else {
              onToast(`Open Media Artifact: ${data?.mediaPath || 'No Path'}`);
            }
          }
        }}
      >
        {/* ── Welcome/Empty State ─────────────────────────────────────────── */}
        {(activeSessionId === 'session-main' ? trajectorySteps : (activeSession?.steps || [])).length === 0 && (
          <div className="flex flex-col items-center justify-center px-4 max-w-[760px] w-full mx-auto mt-6 mb-4 animate-fade-in relative">
            {/* Glow blob */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] bg-violet-500/4 rounded-full blur-[90px] pointer-events-none" />

            {/* Title */}
            <div
              data-testid="workspace-title-question"
              className="text-center text-xl font-outfit font-bold tracking-tight text-brand-textMain mb-1"
            >
              {activeProject ? (
                <>
                  What should we build in{' '}
                  <span className="bg-gradient-to-r from-violet-400 via-sky-400 to-teal-400 bg-clip-text text-transparent">
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
            <div className="w-full max-w-[680px] mb-4 px-3.5 py-2.5 glass-card rounded-lg text-[11px] text-brand-textMuted flex gap-2 items-center border border-violet-500/12">
              <Terminal size={13} className="text-violet-400 flex-shrink-0" />
              <div>
                <span className="font-bold text-violet-400 mr-1.5 uppercase tracking-wider text-[9px]">
                  System:
                </span>
                <span>SuperAgent Desktop ready — {enabledModels.length > 0 ? `${enabledModels.length} model${enabledModels.length !== 1 ? 's' : ''} connected` : 'configure providers in Settings'}</span>
              </div>
            </div>

            {/* Recommendation cards */}
            <div className="grid grid-cols-2 gap-2.5 w-full max-w-[680px] mb-5">
              {recommendations.map(({ title, prompt, description, Icon, accent }) => (
                <button
                  key={title}
                  onClick={() => onPromptChange(prompt)}
                  className="glass-card glow-hover p-3.5 rounded-xl cursor-pointer text-left flex gap-3 items-start transition-all"
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center border flex-shrink-0 ${accentClasses[accent]}`}>
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
                <span className={`w-1 h-1 rounded-full ${enabledModels.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-brand-textMuted/30'}`} />
                <span>Models: {enabledModels.length > 0 ? enabledModels.length : 'None'}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-brand-card border border-brand-border px-2.5 py-1 rounded-full shadow-sm">
                <span className={`w-1 h-1 rounded-full ${mcpServers.filter(s => s.enabled).length > 0 ? 'bg-sky-500 animate-pulse' : 'bg-brand-textMuted/30'}`} />
                <span>MCP: {mcpServers.filter(s => s.enabled).length} online</span>
              </div>
              <div className="flex items-center gap-1.5 bg-brand-card border border-brand-border px-2.5 py-1 rounded-full shadow-sm">
                <span className={`w-1 h-1 rounded-full ${hasCredentials ? 'bg-teal-500 animate-pulse' : 'bg-amber-500'}`} />
                <span>Keys: {hasCredentials ? 'Active' : 'Setup needed'}</span>
              </div>
              <button
                onClick={handleAddAgentSession}
                className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/25 hover:border-violet-500/45 px-2.5 py-1 rounded-full text-violet-400 transition-all cursor-pointer"
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
        onAttachClick={onAttachClick || (() => onToast('File Attachment Manager'))}
        onMicClick={() => onToast('Voice Dictation Input')}
        onLocallyClick={() => onToast('Local Execution Environments')}
        onBranchClick={() => onToast('Git Branch Selector')}
        availableModels={enabledModels.map(model => model.name)}
        defaultModel={enabledModels[0]?.name || ''}
        promptValue={composerPrompt}
        onPromptChange={onPromptChange}
        onAttachPastedFiles={onAttachPastedFiles}
        attachments={composerAttachments}
        onRemoveAttachment={onRemoveAttachment}
      />
    </>
  );
};
