import React, { useRef, useEffect } from 'react';
import { Bot, Terminal, Code, Cpu } from 'lucide-react';
import { ChatMessage, TrajectoryStep, AgentTurn } from '../types.js';
import { TurnBlock, AgentResponseBlock } from './chat/index.js';

export interface ChatViewProps {
  steps?: TrajectoryStep[];
  messages?: ChatMessage[];
  isStreaming?: boolean;
  onCopyText?: (text: string) => void;
  onViewDiff?: (file: string, original: string, modified: string) => void;
  onActionClick?: (action: string, data: any) => void;
  onUndoStep?: (stepId: string) => void;
  onEditStep?: (stepId: string, content: string) => void;
  onRegenerate?: (turnId: string, content: string) => void;
  lastError?: string;
  onRetryLast?: () => void;
  initialExpanded?: boolean;
  children?: React.ReactNode;
}

/** Converts legacy ChatMessage array to modern TrajectoryStep array if needed. */
function normalizeToTrajectorySteps(messages?: ChatMessage[], steps?: TrajectoryStep[]): TrajectoryStep[] {
  if (steps && steps.length > 0) {
    return steps;
  }
  if (!messages || messages.length === 0) {
    return [];
  }

  const result: TrajectoryStep[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = msg.content.map(c => (c.type === 'text' ? c.text : '')).join('\n');
      result.push({
        id: msg.id,
        type: 'user',
        content: text,
        timestamp: msg.timestamp,
        status: 'success',
      });
    } else {
      for (const block of msg.content) {
        if (block.type === 'text') {
          if (block.text) {
            result.push({
              id: `${msg.id}-text`,
              type: 'assistant',
              content: block.text,
              timestamp: msg.timestamp,
              status: 'success',
            });
          }
        } else if (block.type === 'tool_use') {
          result.push({
            id: block.id,
            type: 'tool_call',
            content: '',
            toolName: block.name,
            status: 'running',
            metadata: {
              toolArgs: block.input,
            },
          });
        } else if (block.type === 'tool_result') {
          result.push({
            id: block.tool_use_id,
            type: 'tool_result',
            content: block.content,
            status: block.is_error ? 'error' : 'success',
            metadata: {
              toolResult: block.content,
            },
          });
        }
      }
    }
  }
  return result;
}

export const ChatView: React.FC<ChatViewProps> = ({
  steps,
  messages,
  isStreaming = false,
  onViewDiff,
  onActionClick,
  onUndoStep,
  onEditStep,
  onRegenerate,
  lastError,
  onRetryLast,
  initialExpanded = false,
  children,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const normalizedSteps = normalizeToTrajectorySteps(messages, steps);

  // Auto-scroll on new steps or streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [normalizedSteps.length, isStreaming]);

  // Turn grouping
  const initialAgentSteps: TrajectoryStep[] = [];
  const turns: AgentTurn[] = [];
  let pendingAgentSteps: TrajectoryStep[] = [];
  let currentUserSteps: TrajectoryStep[] = [];

  for (const step of normalizedSteps) {
    if (step.type === 'user') {
      if (currentUserSteps.length > 0 && pendingAgentSteps.length > 0) {
        turns.push({ userSteps: [...currentUserSteps], agentSteps: [...pendingAgentSteps] });
        pendingAgentSteps = [];
        currentUserSteps = [step];
      } else {
        currentUserSteps.push(step);
      }
    } else {
      if (currentUserSteps.length > 0) {
        pendingAgentSteps.push(step);
      } else {
        initialAgentSteps.push(step);
      }
    }
  }
  if (currentUserSteps.length > 0) {
    turns.push({ userSteps: [...currentUserSteps], agentSteps: [...pendingAgentSteps] });
  }

  // Find last streaming step ID
  const lastAssistantIdx = [...normalizedSteps].reverse().findIndex(s => s.type === 'assistant');
  const streamingStepId =
    isStreaming && lastAssistantIdx !== -1
      ? normalizedSteps[normalizedSteps.length - 1 - lastAssistantIdx]?.id
      : null;

  if (normalizedSteps.length === 0 && !children) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none overflow-y-auto">
        <div className="w-14 h-14 bg-[color:var(--brand-card)] text-[color:var(--brand-text-main)] rounded-2xl border border-[color:var(--brand-border)] flex items-center justify-center mb-4 shadow-md">
          <Bot className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[color:var(--brand-text-main)] mb-2">SuperAgent Core v2</h2>
        <p className="text-sm text-[color:var(--brand-text-muted)] max-w-md mb-6 leading-relaxed">
          Autonomous AI Coding & Workspace Automation Agent. Enter a prompt to search code, edit files, or execute shell commands.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left text-xs">
          <div className="p-3 bg-[color:var(--brand-card)] border border-[color:var(--brand-border)] rounded-xl hover:border-[color:var(--brand-border-strong)] transition-all">
            <span className="font-semibold text-[color:var(--brand-text-main)] block mb-1 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-[color:var(--neon-live)]" />
              <span>Search Codebase</span>
            </span>
            <span className="text-[color:var(--brand-text-muted)]">"Find all occurrences of API endpoints in src"</span>
          </div>
          <div className="p-3 bg-[color:var(--brand-card)] border border-[color:var(--brand-border)] rounded-xl hover:border-[color:var(--brand-border-strong)] transition-all">
            <span className="font-semibold text-[color:var(--brand-text-main)] block mb-1 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[color:var(--neon-constructive)]" />
              <span>Run Tests & Commands</span>
            </span>
            <span className="text-[color:var(--brand-text-muted)]">"Run cargo check and fix any compiler warnings"</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="trajectory-canvas"
      className="flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-8 workspace-canvas relative z-10 scrollbar-thin"
    >
      <div className="max-w-[820px] w-full mx-auto flex flex-col gap-0">
        {children}

        {/* Initial agent steps if any */}
        {initialAgentSteps.length > 0 && (
          <AgentResponseBlock
            steps={initialAgentSteps}
            isLastTurn={turns.length === 0}
            streamingStepId={streamingStepId}
            isStreaming={isStreaming && turns.length === 0}
            onViewDiff={onViewDiff}
            onActionClick={onActionClick}
            lastError={lastError}
            onRetryLast={onRetryLast}
            onRegenerate={onRegenerate ? () => onRegenerate('', '') : undefined}
            initialExpanded={initialExpanded}
          />
        )}

        {/* Grouped turns */}
        {turns.map((turn, turnIdx) => (
          <TurnBlock
            key={turn.userSteps[0]?.id || `turn-${turnIdx}`}
            turn={turn}
            turnIdx={turnIdx}
            isStreaming={isStreaming}
            isLastTurn={turnIdx === turns.length - 1}
            streamingStepId={streamingStepId}
            onViewDiff={onViewDiff}
            onActionClick={onActionClick}
            onUndoStep={onUndoStep}
            onEditStep={onEditStep}
            onRegenerate={onRegenerate}
            lastError={lastError}
            onRetryLast={onRetryLast}
            initialExpanded={initialExpanded}
          />
        ))}

        {/* Streaming Thinking dots when turn has just started */}
        {isStreaming && turns.length > 0 && turns[turns.length - 1].agentSteps.length === 0 && (
          <div className="flex items-center gap-2 text-[color:var(--brand-text-muted)] text-xs px-1 py-2 mb-4 select-none">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--brand-text-muted)] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--brand-text-muted)] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--brand-text-muted)] animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span>Thinking...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};
