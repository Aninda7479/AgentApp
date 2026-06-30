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
  onToast
}) => {
  const enabledModels = modelsCatalog.filter((model) => model.enabled);

  return (
    <>
      <div className="h-14 border-b border-brand-border/70 flex items-center justify-between px-8 bg-brand-sidebar">
        <div className="flex items-center gap-2 text-sm text-brand-textMain font-semibold">
          <Folder size={15} className="text-amber-500" />
          <span>{activeProject || 'No Project'} workspace</span>
        </div>

        <div className="flex gap-2 text-brand-textMuted">
          <button
            onClick={onOpenMcp}
            title="MCP Dashboard"
            className="w-9 h-9 rounded-lg border border-brand-border bg-brand-card flex items-center justify-center hover:text-brand-textMain hover:bg-brand-popover transition-colors shadow-sm"
          >
            <Plug size={15} />
          </button>
          <button
            onClick={onOpenSettings}
            title="Settings"
            className="w-9 h-9 rounded-lg border border-brand-border bg-brand-card flex items-center justify-center hover:text-brand-textMain hover:bg-brand-popover transition-colors shadow-sm"
          >
            <Wrench size={15} />
          </button>
        </div>
      </div>

      {trajectorySteps.length <= 1 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 max-w-[980px] w-full mx-auto mt-10 mb-4 animate-fade-in relative z-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-violet-500/10 rounded-full blur-[100px] pointer-events-none" />

          <div
            data-testid="workspace-title-question"
            className="text-center text-3xl md:text-4xl font-outfit font-bold tracking-tight text-brand-textMain mb-2"
          >
            What should we build in{' '}
            <span className="bg-gradient-to-r from-violet-400 via-sky-400 to-teal-400 bg-clip-text text-transparent">
              {activeProject}
            </span>
            ?
          </div>
          <p className="text-brand-textMuted text-xs md:text-sm text-center mb-6 font-medium">
            Select a workflow recommendation below or write a custom request.
          </p>

          <div className="w-full max-w-[860px] mb-6 p-5 glass-card rounded-xl text-xs md:text-sm text-brand-textMuted flex gap-3 items-center border border-violet-500/25 shadow-md">
            <Terminal size={18} className="text-violet-400 flex-shrink-0" />
            <div className="leading-relaxed text-left">
              <span className="font-bold text-violet-400 mr-2 uppercase tracking-wider text-[10px] md:text-[11px]">
                System Status:
              </span>
              <span>SuperAgent Desktop initialized. Ready for autonomous software engineering and multimodal AI media generation.</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-[860px] mb-8">
            {recommendations.map(({ title, prompt, description, Icon, className }) => (
              <button
                key={title}
                onClick={() => onPromptChange(prompt)}
                className="glass-card glow-hover p-5 rounded-xl cursor-pointer text-left flex gap-4 items-start"
              >
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center border ${className}`}>
                  <Icon size={18} />
                </span>
                <span>
                  <span className="block font-semibold text-brand-textMain text-sm">{title}</span>
                  <span className="block text-brand-textMuted text-xs mt-1">{description}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="flex gap-4 items-center justify-center flex-wrap max-w-[860px] w-full text-[11px] text-brand-textMuted border-t border-brand-border/50 pt-5">
            <div className="flex items-center gap-1.5 bg-brand-card border border-brand-border px-3.5 py-2 rounded-full font-medium shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Connected Models: {enabledModels.length || 'Default'}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-brand-card border border-brand-border px-3.5 py-2 rounded-full font-medium shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
              <span>MCP Servers: {mcpServers.filter((server) => server.enabled).length} Online</span>
            </div>
            <div className="flex items-center gap-1.5 bg-brand-card border border-brand-border px-3.5 py-2 rounded-full font-medium shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              <span>Credentials: {hasCredentials ? 'Active' : 'Configure keys'}</span>
            </div>
          </div>
        </div>
      ) : (
        <TrajectoryCanvas steps={trajectorySteps} isStreaming={isGenerating} onViewDiff={onViewDiff} />
      )}

      <Composer
        onSend={onSendPrompt}
        isGenerating={isGenerating}
        onStop={onStop}
        activeProject={activeProject}
        onAttachClick={() => onToast('File Attachment Manager')}
        onMicClick={() => onToast('Voice Dictation Input')}
        onLocallyClick={() => onToast('Local Execution Environments')}
        onBranchClick={() => onToast('Git Branch Selector')}
        availableModels={enabledModels.map((model) => model.name)}
        defaultModel={enabledModels[0]?.name || 'Gemini 3.5 Flash (High)'}
        promptValue={composerPrompt}
        onPromptChange={onPromptChange}
      />
    </>
  );
};
