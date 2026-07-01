import React, { useState, useEffect } from 'react';

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

const LocalImagePreview: React.FC<{ filePath: string }> = ({ filePath }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const ipc = typeof window !== 'undefined' && (window as any).require
      ? (window as any).require('electron').ipcRenderer
      : null;
    if (ipc) {
      ipc.invoke('read-file-base64', filePath).then((base64: string | null) => {
        if (base64) setSrc(base64);
      });
    }
  }, [filePath]);

  if (!src) {
    return (
      <div className="mt-2 w-32 h-20 bg-brand-card animate-pulse rounded-lg border border-brand-border flex items-center justify-center text-[10px] text-brand-textMuted select-none">
        Loading...
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="Attached preview"
      className="mt-2 rounded-lg max-w-full max-h-[220px] object-contain border border-brand-border/60 shadow-sm"
    />
  );
};

export interface TrajectoryCanvasProps {
  steps: TrajectoryStep[];
  isStreaming?: boolean;
  onViewDiff?: (file: string, original: string, modified: string) => void;
  onActionClick?: (action: string, data: any) => void;
  children?: React.ReactNode;
}

export const TrajectoryCanvas: React.FC<TrajectoryCanvasProps> = ({
  steps,
  isStreaming = false,
  onViewDiff,
  onActionClick,
  children
}) => {
  return (
    <div
      data-testid="trajectory-canvas"
      className="flex-1 overflow-y-auto px-4 md:px-6 py-6 bg-brand-bg scrollbar-thin relative z-10"
    >
      {/* Centered Column wrapping all steps to align with the prompt composer */}
      <div className="max-w-[900px] w-full mx-auto flex flex-col gap-5">
        {children}

        {steps.length === 0 && !children && (
          <div
            data-testid="empty-state"
            className="text-center text-brand-textMuted mt-24 text-sm md:text-base select-none"
          >
            No agent execution trajectory yet. Type a prompt below to start!
          </div>
        )}

        {((steps.length > 1) || (steps.length > 0 && !children)) && (
          steps.map((step) => {
            if (step.type === 'user') {
              const hasMedia = step.metadata?.mediaPath;
              const isImage = step.metadata?.mediaType === 'image';
              return (
                <div
                  key={step.id}
                  data-testid={`step-user-${step.id}`}
                  className="self-end glass-card border border-brand-border rounded-xl px-6 py-5 max-w-[85%] md:max-w-[78%] text-brand-textMain shadow-md hover:border-violet-500/30 transition-all"
                >
                  <div className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted mb-1.5 flex justify-between gap-4 select-none">
                    <span>User</span>
                    {step.timestamp && <span>{step.timestamp}</span>}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed text-sm md:text-base font-sans">{step.content}</div>

                  {hasMedia && isImage && (
                    <LocalImagePreview filePath={step.metadata!.mediaPath} />
                  )}
                  {hasMedia && !isImage && (
                    <div className="mt-2.5 p-3.5 bg-brand-popover/80 border border-brand-border rounded-xl flex items-center justify-between gap-3 select-none hover:border-violet-500/30 transition-all">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📄</span>
                        <span className="text-xs md:text-sm text-brand-textMain font-medium font-sans">
                          {step.metadata!.mediaType!.toUpperCase()} Document
                        </span>
                      </div>
                      <button
                        onClick={() => onActionClick && onActionClick('openMedia', step.metadata)}
                        className="bg-white/5 border border-brand-border hover:bg-white/10 text-brand-textMain px-3.5 py-1.5 rounded-lg cursor-pointer text-xs font-semibold transition-all"
                      >
                        Open File
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            if (step.type === 'thought') {
              return (
                <div
                  key={step.id}
                  data-testid={`step-thought-${step.id}`}
                  className="self-start glass-panel border-l-4 border-violet-500 rounded-xl px-6 py-5 max-w-[94%] md:max-w-[88%] text-brand-textMuted/95 italic text-[13px] md:text-sm shadow-md border-t border-r border-b border-brand-border/60 pulse-glow"
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
                  className="self-start glass-card border border-brand-border rounded-xl p-5 max-w-[96%] md:max-w-[88%] w-full shadow-md hover:border-blue-500/30 transition-all"
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
                            ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                            : isError
                            ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                            : 'bg-indigo-500/15 text-indigo-500 border border-indigo-500/30'
                        }`}
                      >
                        {isRunning ? 'Running...' : step.status || 'Done'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-brand-bg/85 border border-brand-border/50 p-4 rounded-xl font-mono text-xs md:text-[13px] text-brand-textMain overflow-x-auto white-space-pre-wrap leading-relaxed">
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
                        className="bg-blue-500/10 border border-blue-500/25 hover:border-blue-500/45 hover:bg-blue-500/15 text-blue-500 rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] shadow-sm"
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
                className="self-start glass-card border border-brand-border rounded-xl p-6 max-w-[100%] md:max-w-[92%] w-full text-brand-textMain shadow-md border-l-4 border-l-violet-500/40 hover:border-brand-border transition-all"
              >
                <div className="flex items-center justify-between gap-4 mb-3 text-xs text-brand-textMuted select-none">
                  <span className="text-purple-400 font-bold uppercase tracking-wider">SuperAgent Core</span>
                  {step.timestamp && <span>{step.timestamp}</span>}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed text-sm md:text-base font-sans">
                  {step.content}
                </div>

                {step.metadata?.mediaType && (
                  <div className="mt-4 p-4 bg-brand-popover border border-brand-border rounded-xl flex items-center justify-between gap-3 select-none">
                    <span className="text-xs md:text-sm text-brand-textMain font-medium">
                      🎨 Generated Media Asset ({step.metadata.mediaType.toUpperCase()})
                    </span>
                    <button
                      onClick={() => onActionClick && onActionClick('openMedia', step.metadata)}
                      className="bg-purple-600 hover:bg-purple-500 hover:shadow-[0_0_12px_rgba(168,85,247,0.4)] text-white px-4 py-2 rounded-lg cursor-pointer text-xs font-semibold transition-all active:scale-[0.97]"
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
