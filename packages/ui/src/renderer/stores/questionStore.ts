/**
 * Question Store
 * Manages pending interactive questions and quizzes initiated by agent tools
 * (`question` or `ask_question`). Provides reactive subscription for ComposerBar.
 */

import { useSyncExternalStore } from 'react';

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionItem {
  id?: string;
  header?: string;
  question: string;
  options: QuestionOption[];
  isMultiSelect?: boolean;
}

export interface PendingQuestion {
  toolCallId?: string;
  questions: QuestionItem[];
  timestamp: number;
}

function parseOptions(raw: unknown): QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  const options: QuestionOption[] = [];
  for (const opt of raw) {
    if (typeof opt === 'string' && opt.trim()) {
      options.push({ label: opt.trim() });
    } else if (typeof opt === 'object' && opt !== null) {
      const obj = opt as Record<string, unknown>;
      const label =
        typeof obj.label === 'string'
          ? obj.label
          : typeof obj.text === 'string'
          ? obj.text
          : typeof obj.value === 'string'
          ? obj.value
          : '';
      const description =
        typeof obj.description === 'string'
          ? obj.description
          : typeof obj.desc === 'string'
          ? obj.desc
          : undefined;
      if (label.trim()) {
        options.push({ label: label.trim(), description: description?.trim() });
      }
    }
  }
  return options;
}

export function parseQuestionToolArgs(rawArgs: unknown, toolCallId?: string): PendingQuestion | null {
  if (!rawArgs) return null;
  let argsObj: Record<string, unknown>;
  if (typeof rawArgs === 'string') {
    try {
      argsObj = JSON.parse(rawArgs);
    } catch {
      return null;
    }
  } else if (typeof rawArgs === 'object') {
    argsObj = rawArgs as Record<string, unknown>;
  } else {
    return null;
  }

  const questions: QuestionItem[] = [];

  // Case 1: questions array
  if (Array.isArray(argsObj.questions)) {
    for (let i = 0; i < argsObj.questions.length; i++) {
      const q = argsObj.questions[i];
      if (typeof q === 'object' && q !== null) {
        const qObj = q as Record<string, unknown>;
        const questionText =
          typeof qObj.question === 'string'
            ? qObj.question
            : typeof qObj.text === 'string'
            ? qObj.text
            : typeof qObj.prompt === 'string'
            ? qObj.prompt
            : '';
        const header =
          typeof qObj.header === 'string'
            ? qObj.header
            : typeof qObj.category === 'string'
            ? qObj.category
            : undefined;
        const isMultiSelect = Boolean(qObj.is_multi_select || qObj.isMultiSelect || qObj.multiple);
        const options = parseOptions(qObj.options || qObj.choices);

        if (questionText.trim()) {
          questions.push({
            id: `q-${i + 1}`,
            header,
            question: questionText.trim(),
            options,
            isMultiSelect,
          });
        }
      }
    }
  }

  // Case 2: single question
  if (questions.length === 0) {
    const singleQuestionText =
      typeof argsObj.question === 'string'
        ? argsObj.question
        : typeof argsObj.text === 'string'
        ? argsObj.text
        : typeof argsObj.prompt === 'string'
        ? argsObj.prompt
        : '';
    if (singleQuestionText.trim()) {
      const header =
        typeof argsObj.header === 'string'
          ? argsObj.header
          : typeof argsObj.category === 'string'
          ? argsObj.category
          : undefined;
      const isMultiSelect = Boolean(argsObj.is_multi_select || argsObj.isMultiSelect || argsObj.multiple);
      const options = parseOptions(argsObj.options || argsObj.choices);
      questions.push({
        id: 'q-1',
        header,
        question: singleQuestionText.trim(),
        options,
        isMultiSelect,
      });
    }
  }

  if (questions.length === 0) return null;

  return {
    toolCallId,
    questions,
    timestamp: Date.now(),
  };
}

class QuestionStoreManager {
  private pending: Map<string, PendingQuestion> = new Map();
  private listeners: Set<() => void> = new Set();

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  public getPendingQuestion(chatId?: string): PendingQuestion | null {
    if (!chatId) {
      const first = this.pending.values().next();
      return first.done ? null : first.value;
    }
    const cleanId = chatId.replace(/^session-/, '');
    return this.pending.get(chatId) || this.pending.get(cleanId) || this.pending.get(`session-${cleanId}`) || null;
  }

  public setPendingQuestion(chatId: string, question: PendingQuestion): void {
    const cleanId = chatId.replace(/^session-/, '');
    this.pending.set(cleanId, question);
    this.pending.set(chatId, question);
    this.emit();
  }

  public clearPendingQuestion(chatId?: string): void {
    if (!chatId) {
      this.pending.clear();
      this.emit();
      return;
    }
    const cleanId = chatId.replace(/^session-/, '');
    this.pending.delete(cleanId);
    this.pending.delete(chatId);
    this.pending.delete(`session-${cleanId}`);
    this.emit();
  }

  public clearAll(): void {
    this.pending.clear();
    this.emit();
  }
}

export const questionStore = new QuestionStoreManager();

export function usePendingQuestion(chatId?: string): PendingQuestion | null {
  return useSyncExternalStore(
    questionStore.subscribe,
    () => questionStore.getPendingQuestion(chatId),
    () => null
  );
}
