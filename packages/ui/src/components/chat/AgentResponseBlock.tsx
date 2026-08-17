import React from 'react';
import { Eye, RotateCcw, RefreshCw } from 'lucide-react';
import { TrajectoryStep } from '../../types.js';
import { WorkedHeader } from './WorkedHeader.js';
import { ToolCallCard } from './ToolCallCard.js';
import { FileChangedChip } from './FileChangedChip.js';
import { MarkdownText } from './MarkdownText.js';
import { MessageActions, TrajectoryIconButton } from './MessageActions.js';

export interface AgentResponseBlockProps {
  steps: TrajectoryStep[];
  isLastTurn?: boolean;
  streamingStepId?: string | null;
  isStreaming?: boolean;
  onViewDiff?: (file: string, original: string, modified: string) => void;
  onActionClick?: (action: string, data: any) => void;
  lastError?: string;
  onRetryLast?: () => void;
  onRegenerate?: () => void;
  initialExpanded?: boolean;
}

export const AgentResponseBlock: React.FC<AgentResponseBlockProps> = ({
  steps,
  streamingStepId,
  isStreaming = false,
  onViewDiff,
  onActionClick,
  lastError,
  onRetryLast,
  onRegenerate,
  initialExpanded = false,
}) => {
  // Find index of last tool call or result
  const lastToolIdx = [...steps].reverse().findIndex(s => s.type === 'tool_call' || s.type === 'tool_result');
  const lastToolAbsoluteIdx = lastToolIdx === -1 ? -1 : steps.length - 1 - lastToolIdx;

  // Interleaved thinking steps (thoughts, tool calls, and intermediate assistant messages)
  const thinkingSteps = steps.filter((s, idx) => {
    if (s.type === 'thought') return true;
    if (s.type === 'tool_call' || s.type === 'tool_result') return true;
    if (s.type === 'assistant' && idx < lastToolAbsoluteIdx) return true;
    return false;
  });

  const toolSteps = steps.filter(s => s.type === 'tool_call' || s.type === 'tool_result');

  const assistantSteps = steps.filter((s, idx) => {
    return s.type === 'assistant' && idx >= lastToolAbsoluteIdx;
  });

  // Compute worked duration & edit stats from metadata
  const duration =
    thinkingSteps[0]?.metadata?.workedDuration ||
    toolSteps[0]?.metadata?.workedDuration ||
    assistantSteps[0]?.metadata?.workedDuration ||
    '0s';

  const totalFiles: number = toolSteps.reduce((acc, s) => acc + (s.metadata?.filesExplored || 0), 0);
  const totalFolders: number = toolSteps.reduce((acc, s) => acc + (s.metadata?.foldersExplored || 0), 0);

  const editedFiles = toolSteps
    .filter(s => s.metadata?.filename && (s.metadata.addedLines !== undefined || s.metadata.removedLines !== undefined))
    .map(s => ({
      name: s.metadata!.filename!,
      added: s.metadata!.addedLines || 0,
      removed: s.metadata!.removedLines || 0,
    }));

  const hasWorkDetails = thinkingSteps.length > 0 || totalFiles > 0 || editedFiles.length > 0;

  const totalAdded = toolSteps.reduce((acc, s) => acc + (s.metadata?.addedLines || 0), 0);
  const totalRemoved = toolSteps.reduce((acc, s) => acc + (s.metadata?.removedLines || 0), 0);
  const changedFilesCount = editedFiles.length;

  return (
    <div className="mb-6 flex flex-col gap-2 group">
      {/* Collapsible WorkedHeader */}
      {hasWorkDetails && (
        <WorkedHeader
          duration={duration}
          filesExplored={totalFiles > 0 ? totalFiles : undefined}
          foldersExplored={totalFolders > 0 ? totalFolders : undefined}
          editedFiles={editedFiles}
          initialExpanded={initialExpanded}
          isWorking={isStreaming}
        >
          {thinkingSteps.map((step, stepIdx) => {
            if (step.type === 'thought' || step.type === 'assistant') {
              return (
                <div
                  key={step.id || stepIdx}
                  className="flex flex-col gap-0.5 items-start max-w-[90%] mb-1"
                >
                  <div className="bg-[color:var(--brand-card)]/40 border border-[color:var(--brand-border)]/60 rounded-lg px-3.5 py-2 text-xs text-[color:var(--brand-text-muted)] leading-relaxed font-sans border-l-2 border-l-[color:var(--brand-accent)]/60">
                    <MarkdownText content={step.content} />
                  </div>
                </div>
              );
            }

            return (
              <ToolCallCard
                key={step.id || stepIdx}
                step={step}
                isLast={stepIdx === thinkingSteps.length - 1}
              />
            );
          })}
        </WorkedHeader>
      )}

      {/* Assistant responses */}
      {assistantSteps.map((step, idx) => {
        const isStreamingThis = step.id === streamingStepId;
        const isLast = idx === assistantSteps.length - 1;

        return (
          <div key={step.id || idx} className="flex flex-col gap-1">
            <MarkdownText content={step.content} isStreaming={isStreamingThis && isStreaming} />

            {/* What's Next prompt hint */}
            {isLast && !isStreaming && step.content.toLowerCase().includes("what's next") && (
              <div className="mt-1">
                <p className="text-[color:var(--brand-text-muted)] text-xs font-semibold mt-3 mb-1">What's Next?</p>
              </div>
            )}

            {/* Attached media / Generated assets */}
            {step.metadata?.mediaType && (
              <div className="mt-3 p-3 bg-[color:var(--brand-popover)] border border-[color:var(--brand-border)] rounded-xl flex items-center justify-between gap-3 select-none">
                <span className="text-xs text-[color:var(--brand-text-main)] font-medium">
                  🎨 Generated Asset ({step.metadata.mediaType.toUpperCase()})
                </span>
                <button
                  onClick={() => onActionClick && onActionClick('openMedia', step.metadata)}
                  className="bg-[color:var(--brand-highlight)] hover:bg-[color:var(--brand-highlight-hover)] text-[color:var(--brand-highlight-text)] px-3 py-1.5 rounded-lg cursor-pointer text-xs font-semibold transition-all active:scale-[0.97]"
                >
                  Open
                </button>
              </div>
            )}

            {/* File diff viewer button */}
            {step.metadata?.filename && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() =>
                    onViewDiff &&
                    onViewDiff(
                      step.metadata!.filename!,
                      step.metadata!.originalCode || '',
                      step.metadata!.modifiedCode || ''
                    )
                  }
                  className="flex items-center gap-1.5 text-xs text-[color:var(--brand-text-muted)] hover:text-[color:var(--neon-live)] transition-colors"
                >
                  <Eye size={12} />
                  <span>View diff — {step.metadata.filename}</span>
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* No response / error block */}
      {assistantSteps.length === 0 && (lastError || !isStreaming) && (
        <div className="text-[color:var(--neon-destructive)] bg-[color:var(--neon-destructive)]/10 border border-[color:var(--neon-destructive)]/25 px-4 py-3 rounded-xl text-xs select-none max-w-fit flex flex-col gap-2 mt-1 font-sans">
          <div className="flex items-center gap-2 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-destructive)] animate-pulse" />
            <span>No response for this prompt</span>
          </div>
          {lastError ? (
            <div className="text-[color:var(--neon-destructive)]/90 leading-relaxed">{lastError}</div>
          ) : (
            <div className="text-[color:var(--brand-text-muted)]">The agent finished without producing a reply.</div>
          )}
          {onRetryLast && (
            <button
              onClick={onRetryLast}
              className="self-start flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg border border-[color:var(--neon-destructive)]/40 text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/15 transition-colors cursor-pointer text-xs font-semibold"
            >
              <RotateCcw size={12} />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* File changed chip */}
      {changedFilesCount > 0 && !isStreaming && (
        <FileChangedChip
          count={changedFilesCount}
          added={totalAdded}
          removed={totalRemoved}
          onReview={
            editedFiles.length > 0 && onViewDiff
              ? () => {
                  const firstEdit = toolSteps.find(s => s.metadata?.filename);
                  if (firstEdit) {
                    onViewDiff(
                      firstEdit.metadata!.filename!,
                      firstEdit.metadata!.originalCode || '',
                      firstEdit.metadata!.modifiedCode || ''
                    );
                  }
                }
              : undefined
          }
        />
      )}

      {/* Bottom action buttons */}
      {assistantSteps.length > 0 && !isStreaming && (
        <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <MessageActions content={assistantSteps.map(s => s.content).join('\n\n')} />
          {onRegenerate && (
            <TrajectoryIconButton
              icon={RefreshCw}
              tooltip="Regenerate response"
              onClick={onRegenerate}
            />
          )}
        </div>
      )}
    </div>
  );
};
