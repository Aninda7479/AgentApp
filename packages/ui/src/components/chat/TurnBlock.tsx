import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Edit, RefreshCw, Trash2 } from 'lucide-react';
import { AgentTurn, TrajectoryStep } from '../../types.js';
import { LocalImagePreview } from './LocalImagePreview.js';
import { CopyUserButton, TrajectoryIconButton } from './MessageActions.js';
import { AgentResponseBlock } from './AgentResponseBlock.js';

export interface TurnBlockProps {
  turn: AgentTurn;
  turnIdx: number;
  isStreaming: boolean;
  isLastTurn: boolean;
  streamingStepId: string | null;
  onViewDiff?: (file: string, original: string, modified: string) => void;
  onActionClick?: (action: string, data: any) => void;
  onUndoStep?: (stepId: string) => void;
  onEditStep?: (stepId: string, content: string) => void;
  onRegenerate?: (turnId: string, content: string) => void;
  lastError?: string;
  onRetryLast?: () => void;
  initialExpanded?: boolean;
}

/**
 * Splits a turn's flat agent steps into separate responses, grouped by their
 * `metadata.regenerationSeq` (consecutive runs of the same seq = one response).
 */
function splitResponses(steps: TrajectoryStep[]): TrajectoryStep[][] {
  const groups: TrajectoryStep[][] = [];
  let lastSeq: number | null = null;
  for (const s of steps) {
    const seq = s.metadata?.regenerationSeq ?? 0;
    if (groups.length === 0 || seq !== lastSeq) {
      groups.push([]);
      lastSeq = seq;
    }
    groups[groups.length - 1].push(s);
  }
  return groups;
}

export const TurnBlock: React.FC<TurnBlockProps> = ({
  turn,
  turnIdx,
  isStreaming,
  isLastTurn,
  streamingStepId,
  onViewDiff,
  onActionClick,
  onUndoStep,
  onEditStep,
  onRegenerate,
  lastError,
  onRetryLast,
  initialExpanded,
}) => {
  const userContent = turn.userSteps.map(s => s.content).filter(Boolean).join('\n');
  const responses = splitResponses(turn.agentSteps);
  const [selected, setSelected] = useState(Math.max(0, responses.length - 1));

  // Always surface the newest response (e.g. right after a regeneration)
  useEffect(() => {
    setSelected(Math.max(0, responses.length - 1));
  }, [responses.length]);

  const total = responses.length;
  const current = responses[selected] || [];

  return (
    <div className="flex flex-col gap-0 items-end group/user w-full">
      {/* User prompt bubble */}
      <div className="flex justify-end w-full mt-2">
        <div
          data-testid={`step-user-${turn.userSteps[0]?.id || turnIdx}`}
          className="relative bg-[color:var(--brand-card)]/80 backdrop-blur-sm border border-[color:var(--brand-border)]/70 rounded-xl px-4 py-2.5 max-w-[80%] text-right text-[color:var(--brand-text-main)] text-sm leading-relaxed shadow-sm hover:border-[color:var(--brand-border-strong)] transition-all font-sans"
        >
          {turn.userSteps.map((step, idx) => (
            <div key={step.id || idx} className={idx > 0 ? 'mt-2' : ''}>
              {step.content && <div>{step.content}</div>}

              {step.metadata?.mediaPath && step.metadata?.mediaType === 'image' && (
                <div className="mt-2 flex justify-end">
                  <LocalImagePreview filePath={step.metadata.mediaPath} />
                </div>
              )}

              {step.metadata?.mediaPath && step.metadata?.mediaType !== 'image' && (
                <div className="mt-2.5 p-3 bg-[color:var(--brand-popover)]/80 border border-[color:var(--brand-border)] rounded-xl flex items-center justify-between gap-3 select-none text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📄</span>
                    <span className="text-xs text-[color:var(--brand-text-main)] font-medium font-sans">
                      {step.metadata.mediaType?.toUpperCase()} Document
                    </span>
                  </div>
                  <button
                    onClick={() => onActionClick && onActionClick('openMedia', step.metadata)}
                    className="bg-[color:var(--brand-hover)] border border-[color:var(--brand-border)] hover:bg-[color:var(--brand-hover-strong)] text-[color:var(--brand-text-main)] px-3 py-1 rounded-lg cursor-pointer text-xs font-semibold transition-all"
                  >
                    Open
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* User actions on hover */}
      <div className="self-end flex items-center gap-0.5 mt-1 mr-0.5 select-none opacity-0 group-hover/user:opacity-100 transition-opacity duration-200">
        <CopyUserButton content={userContent} />

        {onEditStep && turn.userSteps[0] && (
          <TrajectoryIconButton
            icon={Edit}
            tooltip="Edit message"
            onClick={() => onEditStep(turn.userSteps[0].id, userContent)}
          />
        )}

        {onRegenerate && turn.userSteps[0] && (
          <TrajectoryIconButton
            icon={RefreshCw}
            tooltip="Regenerate response"
            onClick={() => onRegenerate(turn.userSteps[0].id, userContent)}
          />
        )}

        {onUndoStep && turn.userSteps[0] && (
          <TrajectoryIconButton
            icon={Trash2}
            tooltip="Delete prompt and response"
            danger
            onClick={() => onUndoStep(turn.userSteps[0].id)}
          />
        )}
      </div>

      {/* Agent Response Block */}
      <div className="w-full mt-2">
        {(current.length > 0 || (isLastTurn && (lastError || !isStreaming))) && (
          <AgentResponseBlock
            steps={current}
            isLastTurn={isLastTurn}
            streamingStepId={streamingStepId}
            isStreaming={isStreaming && selected === total - 1}
            onViewDiff={onViewDiff}
            onActionClick={onActionClick}
            lastError={lastError}
            onRetryLast={onRetryLast}
            onRegenerate={
              onRegenerate && turn.userSteps[0]
                ? () => onRegenerate(turn.userSteps[0].id, userContent)
                : undefined
            }
            initialExpanded={initialExpanded}
          />
        )}
      </div>

      {/* Regeneration history navigation */}
      {total > 1 && (
        <div className="self-start flex items-center gap-1.5 mt-1.5 px-1 text-[color:var(--brand-text-muted)] select-none">
          <button
            type="button"
            onClick={() => setSelected(s => Math.max(0, s - 1))}
            disabled={selected === 0}
            title="Previous response"
            className="p-1 rounded-md border border-[color:var(--brand-border)] text-[color:var(--brand-text-muted)] hover:text-[color:var(--brand-text-main)] hover:bg-[color:var(--brand-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="text-xs font-mono text-[color:var(--brand-text-main)] min-w-[28px] text-center tabular-nums">
            {selected + 1}/{total}
          </span>
          <button
            type="button"
            onClick={() => setSelected(s => Math.min(total - 1, s + 1))}
            disabled={selected === total - 1}
            title="Next response"
            className="p-1 rounded-md border border-[color:var(--brand-border)] text-[color:var(--brand-text-muted)] hover:text-[color:var(--brand-text-main)] hover:bg-[color:var(--brand-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
};
