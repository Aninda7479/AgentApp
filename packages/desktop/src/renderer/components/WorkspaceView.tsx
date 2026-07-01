import React from 'react';
import { CalendarDays, Folder, Plug, Sparkles, Stethoscope, Terminal, Wrench } from 'lucide-react';
import { Composer, ComposerOptions } from './Composer';
import { TrajectoryCanvas, TrajectoryStep } from './TrajectoryCanvas';
import { MCPServerInfo } from './MCPDashboard';
import { ModelConfig } from '../settings/SettingsView';

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
  onAttachClick?: () => void;
  onAttachPastedFiles?: (files: FileList) => void;
}

const recommendations = [
  {
    title: 'Develop Dashboard',
    prompt: 'Develop a complete interactive analytics dashboard for my application',
    description: 'Generate React views, metrics charts, and CSS styling',
    Icon: Sparkles,
    className: 'bg-violet-500/10 text-violet-400 border-violet-500/20'
  },
  {
    title: 'Diagnostic Run',
    prompt: 'Analyze the project source code for dependencies and vulnerabilities',
    description: 'Audit package health, search for bugs, and run checks',
    Icon: Stethoscope,
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  },
  {
    title: 'Integrate MCP Tools',
    prompt: 'Configure a custom MCP Server extension for this environment',
    description: 'Extend agent capabilities with databases and file APIs',
    Icon: Plug,
    className: 'bg-sky-500/10 text-sky-400 border-sky-500/20'
  },
  {
    title: 'Schedule Workflows',
    prompt: 'Set up a new cron task that executes checks on a regular schedule',
    description: 'Automate builds, recurring reports, and routine tasks',
    Icon: CalendarDays,
    className: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
  }
];

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
  onAttachClick,
  onAttachPastedFiles
}) => {
  const enabledModels = modelsCatalog.filter((model) => model.enabled);

  return (
    <>
      <div className="h-11 border-b border-brand-border/70 flex items-center px-6 bg-brand-sidebar">
        <div className="flex items-center gap-2 text-xs text-brand-textMain font-semibold">
          <Folder size={13} className="text-amber-500" />
          <span>{activeProject ? `${activeProject} workspace` : 'Workspace'}</span>
        </div>
      </div>

      <TrajectoryCanvas
        steps={trajectorySteps}
        isStreaming={isGenerating}
        onViewDiff={onViewDiff}
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
        {trajectorySteps.length <= 1 && (
          <div className="flex flex-col items-center justify-center px-6 max-w-[840px] w-full mx-auto mt-4 mb-2 animate-fade-in relative z-10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-violet-500/5 rounded-full blur-[80px] pointer-events-none" />

            <div
              data-testid="workspace-title-question"
              className="text-center text-xl md:text-2xl font-outfit font-bold tracking-tight text-brand-textMain mb-1.5"
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
            <p className="text-brand-textMuted text-[11px] text-center mb-4 font-medium">
              Select a workflow recommendation below or write a custom request.
            </p>

            <div className="w-full max-w-[760px] mb-4 p-3.5 glass-card rounded-lg text-xs text-brand-textMuted flex gap-2.5 items-center border border-violet-500/15 shadow-sm">
              <Terminal size={15} className="text-violet-400 flex-shrink-0" />
              <div className="leading-relaxed text-left">
                <span className="font-bold text-violet-400 mr-1.5 uppercase tracking-wider text-[9px] md:text-[10px]">
                  System Status:
                </span>
                <span>SuperAgent Desktop initialized. Ready for autonomous software engineering and multimodal AI media generation.</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-[760px] mb-5">
              {recommendations.map(({ title, prompt, description, Icon, className }) => (
                <button
                  key={title}
                  onClick={() => onPromptChange(prompt)}
                  className="glass-card glow-hover p-3.5 rounded-lg cursor-pointer text-left flex gap-3.5 items-start"
                >
                  <span className={`w-7.5 h-7.5 rounded flex items-center justify-center border ${className}`}>
                    <Icon size={14} />
                  </span>
                  <span>
                    <span className="block font-semibold text-brand-textMain text-xs">{title}</span>
                    <span className="block text-brand-textMuted text-[10px] mt-0.5">{description}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-3 items-center justify-center flex-wrap max-w-[760px] w-full text-[10px] text-brand-textMuted border-t border-brand-border/40 pt-4">
              <div className="flex items-center gap-1 bg-brand-card border border-brand-border px-2.5 py-1 rounded-full font-medium shadow-sm">
                <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                <span>Connected Models: {enabledModels.length || 'Default'}</span>
              </div>
              <div className="flex items-center gap-1 bg-brand-card border border-brand-border px-2.5 py-1 rounded-full font-medium shadow-sm">
                <span className="w-1 h-1 rounded-full bg-sky-500 animate-pulse" />
                <span>MCP Servers: {mcpServers.filter((server) => server.enabled).length} Online</span>
              </div>
              <div className="flex items-center gap-1 bg-brand-card border border-brand-border px-2.5 py-1 rounded-full font-medium shadow-sm">
                <span className="w-1 h-1 rounded-full bg-teal-500 animate-pulse" />
                <span>Credentials: {hasCredentials ? 'Active' : 'Configure keys'}</span>
              </div>
            </div>
          </div>
        )}
      </TrajectoryCanvas>

      <Composer
        onSend={onSendPrompt}
        isGenerating={isGenerating}
        onStop={onStop}
        activeProject={activeProject}
        onAttachClick={onAttachClick || (() => onToast('File Attachment Manager'))}
        onMicClick={() => onToast('Voice Dictation Input')}
        onLocallyClick={() => onToast('Local Execution Environments')}
        onBranchClick={() => onToast('Git Branch Selector')}
        availableModels={enabledModels.map((model) => model.name)}
        defaultModel={enabledModels[0]?.name || ''}
        promptValue={composerPrompt}
        onPromptChange={onPromptChange}
        onAttachPastedFiles={onAttachPastedFiles}
      />
    </>
  );
};
