import React from 'react';

export interface TrajectoryStep {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thought';
  content: string;
  timestamp?: string;
  status?: 'pending' | 'running' | 'success' | 'error';
  toolName?: string;
  metadata?: {
    filename?: string;
    originalCode?: string;
    modifiedCode?: string;
    mediaType?: 'image' | 'pdf' | 'ppt' | 'audio';
    [key: string]: any;
  };
}

export interface TrajectoryCanvasProps {
  steps: TrajectoryStep[];
  isStreaming?: boolean;
  onViewDiff?: (file: string, original: string, modified: string) => void;
  onActionClick?: (action: string, data: any) => void;
}

export const TrajectoryCanvas: React.FC<TrajectoryCanvasProps> = ({
  steps,
  isStreaming = false,
  onViewDiff,
  onActionClick
}) => {
  return (
    <div
      data-testid="trajectory-canvas"
      className="flex-1 overflow-y-auto px-4 md:px-6 py-6 bg-brand-bg scrollbar-thin"
    >
      {/* Centered Column wrapping all steps to align with the prompt composer */}
      <div className="max-w-[900px] w-full mx-auto flex flex-col gap-5">
        {steps.length === 0 ? (
          <div
            data-testid="empty-state"
            className="text-center text-brand-textMuted mt-24 text-sm md:text-base select-none"
          >
            No agent execution trajectory yet. Type a prompt below to start!
          </div>
        ) : (
          steps.map((step) => {
            if (step.type === 'user') {
              return (
                <div
                  key={step.id}
                  data-testid={`step-user-${step.id}`}
                  className="self-end bg-brand-card border border-brand-border rounded-2xl px-5 py-4 max-w-[85%] md:max-w-[80%] text-brand-textMain shadow-md"
                >
                  <div className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted mb-1.5 flex justify-between gap-4 select-none">
                    <span>User</span>
                    {step.timestamp && <span>{step.timestamp}</span>}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed text-sm md:text-base font-sans">{step.content}</div>
                </div>
              );
            }

            if (step.type === 'thought') {
              return (
                <div
                  key={step.id}
                  data-testid={`step-thought-${step.id}`}
                  className="self-start bg-brand-card border-l-4 border-purple-500 rounded-r-xl px-4 py-3 max-w-[90%] md:max-w-[85%] text-brand-textMuted italic text-[13px] md:text-sm shadow-sm"
                >
                  <div className="font-bold text-purple-400 mb-1.5 not-italic select-none text-[11px] uppercase tracking-wider">
                    🧠 Reasoning Trajectory
                  </div>
                  <div className="leading-relaxed">{step.content}</div>
                </div>
              );
            }

            if (step.type === 'tool_call' || step.type === 'tool_result') {
              const isSuccess = step.status === 'success';
              const isError = step.status === 'error';
              const isRunning = step.status === 'running' || step.status === 'pending';

              return (
                <div
                  key={step.id}
                  data-testid={`step-tool-${step.id}`}
                  className="self-start bg-brand-card border border-brand-border rounded-xl p-4 max-w-[95%] md:max-w-[85%] w-full shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3 mb-2.5 select-none">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">⚙️</span>
                      <span className="font-bold text-blue-400 text-xs md:text-sm">
                        Tool: {step.toolName || 'Executor'}
                      </span>
                    </div>
                    <div>
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          isSuccess
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40'
                            : isError
                            ? 'bg-red-950/80 text-red-400 border border-red-800/40'
                            : 'bg-indigo-950/80 text-indigo-400 border border-indigo-800/40'
                        }`}
                      >
                        {isRunning ? 'Running...' : step.status || 'Done'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-brand-bg border border-brand-border/60 p-3 rounded-lg font-mono text-xs md:text-[13px] text-brand-textMain overflow-x-auto white-space-pre-wrap leading-relaxed">
                    {step.content}
                  </div>

                  {step.metadata?.filename && (
                    <div className="mt-3 flex gap-2 select-none">
                      <button
                        data-testid={`view-diff-btn-${step.id}`}
                        onClick={() =>
                          onViewDiff &&
                          onViewDiff(
                            step.metadata!.filename!,
                            step.metadata!.originalCode || '',
                            step.metadata!.modifiedCode || ''
                          )
                        }
                        className="bg-brand-sidebar border border-brand-border hover:border-brand-textMuted/40 hover:bg-brand-border/20 text-blue-400 rounded-lg px-3.5 py-1.5 text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors active:scale-[0.98]"
                      >
                        <span>🔍</span> Inspect File Diff ({step.metadata.filename})
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            // Default: Assistant text response
            return (
              <div
                key={step.id}
                data-testid={`step-assistant-${step.id}`}
                className="self-start bg-brand-card border border-brand-border rounded-2xl p-5 max-w-[100%] md:max-w-[90%] w-full text-brand-textMain shadow-lg"
              >
                <div className="flex items-center justify-between gap-4 mb-3 text-xs text-brand-textMuted select-none">
                  <span className="text-purple-400 font-bold uppercase tracking-wider">SuperAgent Core</span>
                  {step.timestamp && <span>{step.timestamp}</span>}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed text-sm md:text-base font-sans">
                  {step.content}
                </div>

                {step.metadata?.mediaType && (
                  <div className="mt-4 p-3 bg-brand-bg border border-brand-border rounded-lg flex items-center justify-between gap-3 select-none">
                    <span className="text-xs md:text-sm text-brand-textMain font-medium">
                      🎨 Generated Media Asset ({step.metadata.mediaType.toUpperCase()})
                    </span>
                    <button
                      onClick={() => onActionClick && onActionClick('openMedia', step.metadata)}
                      className="bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-1.5 rounded-lg cursor-pointer text-xs font-semibold transition-colors active:scale-[0.97]"
                    >
                      Open Artifact
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {isStreaming && (
          <div
            data-testid="streaming-indicator"
            className="flex items-center gap-2 text-purple-400 text-xs md:text-sm px-3 py-2 select-none"
          >
            <span className="animate-pulse">⚡</span>
            <span>SuperAgent is generating trajectory...</span>
          </div>
        )}
      </div>
    </div>
  );
};
