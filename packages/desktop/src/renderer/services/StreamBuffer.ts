/**
 * Session Stream Buffer for High Performance Token Streaming
 * Batches incoming tokens per session and flushes via requestAnimationFrame.
 */

import { chatStore } from '../stores/chatStore';
import type { TrajectoryStep } from '../core/types';
import { FormatUtils } from '../util/format';

export class SessionStreamBuffer {
  public chatId: string;
  public buffer: string = '';
  public stepId: string | null = null;
  public responseSeq: number = 0;
  private rafId: number | null = null;
  private startedAt: number = Date.now();

  constructor(chatId: string) {
    this.chatId = chatId;
  }

  public setStartedAt(ts: number): void {
    this.startedAt = ts;
  }

  public append(token: string): void {
    if (token.startsWith('\u0000REPLACE:')) {
      this.buffer = token.slice('\u0000REPLACE:'.length);
    } else {
      this.buffer += token;
    }
    this.scheduleFlush();
  }

  public replace(content: string): void {
    this.buffer = content;
    this.scheduleFlush();
  }

  public resetTurn(): void {
    this.buffer = '';
    this.stepId = null;
  }

  public scheduleFlush(): void {
    if (this.rafId !== null) return;

    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.flush();
      });
    } else {
      setImmediate(() => this.flush());
    }
  }

  public flush(): void {
    if (!this.chatId || !this.buffer) return;

    if (!this.stepId) {
      this.stepId = `stream-assistant-${Date.now()}`;
    }

    const currentStepId = this.stepId;
    const currentBuffer = this.buffer;
    const currentSeq = this.responseSeq;
    const duration = FormatUtils.formatWorkedDuration(Date.now() - this.startedAt);

    chatStore.updateSteps(this.chatId, (prev) => {
      const existingIdx = prev.findIndex((s) => s.id === currentStepId);
      if (existingIdx !== -1) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], content: currentBuffer };
        return updated;
      }

      const newStep: TrajectoryStep = {
        id: currentStepId,
        type: 'assistant',
        content: currentBuffer,
        timestamp: FormatUtils.formatTimestamp(),
        metadata: {
          regenerationSeq: currentSeq,
          workedDuration: duration,
        },
      };
      return [...prev, newStep];
    });
  }

  public clear(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.buffer = '';
    this.stepId = null;
  }
}
