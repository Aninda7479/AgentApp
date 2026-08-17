import React, { useState } from 'react';
import { TrajectoryStep } from '../../types.js';
import { summarizeToolContent } from '../../utils/trajectory.js';
import { ChevronRight, ChevronDown, FileText, Loader2 } from 'lucide-react';

interface ToolCallCardProps {
  step: TrajectoryStep;
  isLast: boolean;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ step, isLast }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = step.status === 'running';
  const isError = step.status === 'error';
  const isSuccess = step.status === 'success';

  let statusColor = 'var(--brand-text-muted)';
  if (isRunning) statusColor = 'var(--neon-live)';
  else if (isError) statusColor = 'var(--neon-destructive)';
  else if (isSuccess) statusColor = 'var(--neon-constructive)';

  const summary = summarizeToolContent(step);

  return (
    <div className="relative flex gap-3 group">
      {!isLast && (
        <div className="absolute left-2.5 top-6 bottom-[-16px] w-[2px] bg-[color:var(--brand-border)]" />
      )}
      
      <div className="mt-1 relative z-10 flex items-center justify-center w-5 h-5 bg-[color:var(--brand-card)] rounded-full">
        {isRunning ? (
          <Loader2 size={14} className="animate-spin text-[color:var(--neon-live)]" />
        ) : (
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
        )}
      </div>

      <div className="flex-1 bg-[color:var(--brand-card)] border border-[color:var(--brand-border)] rounded-lg overflow-hidden transition-colors hover:border-[color:var(--brand-hover)]">
        <div 
          className="px-3 py-2 flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-semibold text-[color:var(--brand-text-main)] whitespace-nowrap">
              {step.toolName || 'Tool'}
            </span>
            <span className="text-xs text-[color:var(--brand-text-muted)] truncate">
              {summary}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {step.status && (
              <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: statusColor }}>
                {step.status}
              </span>
            )}
            {expanded ? (
              <ChevronDown size={14} className="text-[color:var(--brand-text-muted)]" />
            ) : (
              <ChevronRight size={14} className="text-[color:var(--brand-text-muted)]" />
            )}
          </div>
        </div>

        {expanded && (
          <div className="border-t border-[color:var(--brand-border)] p-3 flex flex-col gap-3 bg-black/20">
            {step.metadata?.toolArgs && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[color:var(--brand-text-muted)] uppercase tracking-wider">Input</span>
                <pre className="text-xs font-mono text-[color:var(--brand-text-main)] bg-[color:var(--brand-card)] p-2 rounded border border-[color:var(--brand-border)] overflow-x-auto">
                  {JSON.stringify(step.metadata.toolArgs, null, 2)}
                </pre>
              </div>
            )}
            {step.metadata?.toolResult && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[color:var(--brand-text-muted)] uppercase tracking-wider">Output</span>
                <pre className="text-xs font-mono text-[color:var(--brand-text-main)] bg-[color:var(--brand-card)] p-2 rounded border border-[color:var(--brand-border)] overflow-x-auto whitespace-pre-wrap break-words">
                  {step.metadata.toolResult.substring(0, 2000)}{step.metadata.toolResult.length > 2000 ? '...\n[Truncated]' : ''}
                </pre>
              </div>
            )}
            {step.metadata?.filename && (
              <div className="flex items-center gap-1.5 text-xs text-[color:var(--brand-text-muted)] mt-1">
                <FileText size={12} />
                <span>{step.metadata.filename}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
