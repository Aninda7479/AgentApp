/**
 * Interactive Question & Quiz Composer
 * Replaces the prompt input with selectable choices, category chips,
 * multi-step quiz stepper, custom write-in field, and answer submission.
 */

import React, { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  X,
  SendHorizontal
} from 'lucide-react';
import type { PendingQuestion, QuestionItem } from '../stores/questionStore';

export interface InteractiveQuestionComposerProps {
  pendingQuestion: PendingQuestion;
  onSubmit: (responsePrompt: string) => void;
  onDismiss: () => void;
  disabled?: boolean;
}

export const InteractiveQuestionComposer: React.FC<InteractiveQuestionComposerProps> = ({
  pendingQuestion,
  onSubmit,
  onDismiss,
  disabled = false,
}) => {
  const questions: QuestionItem[] = pendingQuestion.questions;
  const total = questions.length;
  const [currentIndex, setCurrentIndex] = useState(0);

  // Map from question index to array of selected option labels
  const [selectedMap, setSelectedMap] = useState<Record<number, string[]>>({});
  // Map from question index to custom write-in answer
  const [customMap, setCustomMap] = useState<Record<number, string>>({});

  const currentQ = questions[currentIndex] || questions[0];
  if (!currentQ) return null;

  const currentSelected = selectedMap[currentIndex] || [];
  const currentCustom = customMap[currentIndex] || '';

  const handleToggleOption = (label: string) => {
    if (disabled) return;
    setSelectedMap((prev) => {
      const existing = prev[currentIndex] || [];
      if (currentQ.isMultiSelect) {
        const next = existing.includes(label)
          ? existing.filter((l) => l !== label)
          : [...existing, label];
        return { ...prev, [currentIndex]: next };
      } else {
        const next = existing.includes(label) ? [] : [label];
        return { ...prev, [currentIndex]: next };
      }
    });
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomMap((prev) => ({ ...prev, [currentIndex]: val }));
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleSubmitAll = () => {
    if (disabled) return;

    if (total === 1) {
      const parts: string[] = [];
      if (currentSelected.length > 0) {
        parts.push(currentSelected.join(', '));
      }
      if (currentCustom.trim()) {
        parts.push(currentCustom.trim());
      }
      const ans = parts.length > 0 ? parts.join('; ') : 'No answer selected';
      onSubmit(`My answer: ${ans}`);
      return;
    }

    const lines: string[] = ['Here are my answers:'];
    for (let i = 0; i < total; i++) {
      const q = questions[i];
      const sel = selectedMap[i] || [];
      const cust = customMap[i] || '';
      const parts: string[] = [];
      if (sel.length > 0) parts.push(sel.join(', '));
      if (cust.trim()) parts.push(cust.trim());
      const ans = parts.length > 0 ? parts.join('; ') : 'Skipped';
      const label = q.header ? `[${q.header}] ${q.question}` : q.question;
      lines.push(`${i + 1}. ${label}: ${ans}`);
    }

    onSubmit(lines.join('\n'));
  };

  const hasAnyAnswerCurrent = currentSelected.length > 0 || currentCustom.trim().length > 0;

  return (
    <div
      data-testid="interactive-question-composer"
      className="relative w-full flex flex-col gap-2.5 p-3 sm:p-4 bg-brand-card/95 backdrop-blur-2xl border border-brand-border rounded-2xl shadow-xl transition-all select-none"
    >
      {/* Top Bar: Category / Header & Stepper & Dismiss */}
      <div className="flex items-center justify-between gap-2 border-b border-brand-border/60 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
            <HelpCircle size={14} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 truncate">
            {currentQ.header || (total > 1 ? `Quiz Question ${currentIndex + 1}` : 'Question / Clarification')}
          </span>
          {currentQ.isMultiSelect && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-inner-bg/80 border border-brand-border/60 text-brand-textMuted shrink-0">
              Multi-Select
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {total > 1 && (
            <span className="text-xs font-mono text-brand-textMuted bg-brand-inner-bg px-2 py-0.5 rounded-full border border-brand-border/50">
              {currentIndex + 1} / {total}
            </span>
          )}
          <button
            type="button"
            data-testid="dismiss-question-btn"
            onClick={onDismiss}
            title="Dismiss and type manually"
            aria-label="Dismiss and type manually"
            className="w-6 h-6 rounded-lg flex items-center justify-center text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Question Text */}
      <div className="px-0.5">
        <h3 className="text-sm sm:text-base font-semibold text-brand-textMain leading-relaxed break-words">
          {currentQ.question}
        </h3>
      </div>

      {/* Options List */}
      {currentQ.options && currentQ.options.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-0.5">
          {currentQ.options.map((opt, idx) => {
            const letter = String.fromCharCode(65 + (idx % 26));
            const isSelected = currentSelected.includes(opt.label);

            return (
              <div
                key={opt.label + idx}
                data-testid={`question-option-${idx}`}
                role="button"
                tabIndex={0}
                onClick={() => handleToggleOption(opt.label)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleToggleOption(opt.label);
                  }
                }}
                className={`flex items-start gap-2.5 p-2.5 sm:p-3 rounded-xl border text-left cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? 'bg-cyan-500/15 border-cyan-500/60 ring-1 ring-cyan-500/40 text-brand-textMain shadow-sm'
                    : 'bg-brand-inner-bg/50 border-brand-border/80 hover:bg-brand-hover hover:border-brand-borderStrong text-brand-textMain'
                }`}
              >
                {/* Checkbox / Radio Badge */}
                <div
                  className={`w-5 h-5 rounded-${currentQ.isMultiSelect ? 'md' : 'full'} shrink-0 flex items-center justify-center text-[11px] font-mono font-bold transition-all mt-0.5 ${
                    isSelected
                      ? 'bg-cyan-500 text-neutral-950 shadow-sm'
                      : 'bg-brand-inner-bg border border-brand-border text-brand-textMuted'
                  }`}
                >
                  {isSelected ? <Check size={12} strokeWidth={3} /> : letter}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs sm:text-sm font-medium leading-snug break-words">
                    {opt.label}
                  </div>
                  {opt.description && (
                    <div className="text-[11px] text-brand-textMuted mt-0.5 leading-normal break-words">
                      {opt.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Write-in Field */}
      <div className="mt-1">
        <input
          type="text"
          data-testid="question-custom-input"
          value={currentCustom}
          onChange={handleCustomChange}
          placeholder="Or type a custom answer..."
          disabled={disabled}
          className="w-full text-xs sm:text-sm px-3 py-1.5 rounded-xl bg-brand-inner-bg/60 border border-brand-border text-brand-textMain placeholder:text-brand-textMuted/60 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all"
        />
      </div>

      {/* Footer Controls: Back, Next, Submit */}
      <div className="flex items-center justify-between gap-2 border-t border-brand-border/60 pt-2.5 mt-0.5">
        <div className="flex items-center gap-1.5">
          {currentIndex > 0 ? (
            <button
              type="button"
              data-testid="question-prev-btn"
              onClick={handlePrev}
              disabled={disabled}
              className="px-2.5 py-1 text-xs font-medium rounded-lg border border-brand-border hover:bg-brand-hover text-brand-textMain flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ChevronLeft size={14} />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer px-1"
            >
              Skip
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {currentIndex < total - 1 ? (
            <button
              type="button"
              data-testid="question-next-btn"
              onClick={handleNext}
              disabled={disabled}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-brand-inner-bg border border-brand-borderStrong hover:bg-brand-hover text-brand-textMain flex items-center gap-1 transition-all cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          ) : null}

          <button
            type="button"
            data-testid="question-submit-btn"
            onClick={handleSubmitAll}
            disabled={disabled || (!hasAnyAnswerCurrent && total === 1)}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-cyan-500 text-neutral-950 hover:bg-cyan-400 active:scale-95 shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{total > 1 ? (currentIndex === total - 1 ? 'Submit All Answers' : 'Submit Answers') : 'Submit Answer'}</span>
            <SendHorizontal size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
};
