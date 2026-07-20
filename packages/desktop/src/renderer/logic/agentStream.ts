/**
 * `AgentStreamService` — owns the live streaming handler for the real-agent
 * `agent-event` IPC channel.
 *
 * The design layer (App.tsx) mounts it once, passing the live streaming refs and
 * the partner ref. Everything below — token buffering, mapping tool-call /
 * tool-result events back onto the trajectory, stamping the worked duration on
 * completion, and the make-3D-character → Partner import-on-success side effect
 * — lives here so the design shell stays thin and free of logic.
 */
import type { AppContext, TrajectoryStep } from './types';
import { StoreService } from './store';
import { FormatService } from './format';
import type { StreamingRefs } from './agent';

/** Shape of an `agent-event` payload emitted by the main process. */
export interface AgentEvent {
  type: string;
  sessionId: string;
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  error?: string;
  chatName?: string;
  /** Live context-window usage estimate, set on `type: 'context'` events. */
  context?: { used: number; limit: number; pct: number };
}

/** Minimal slice of the partners controller the streaming handler touches. */
export interface PartnerController {
  activeId: string | null;
  importModel: (id: string, path: string) => Promise<unknown>;
  setActive: (id: string) => void;
  startPet: () => Promise<void>;
}

export class AgentStreamService {
  /**
   * Builds the `agent-event` listener. Returns a function the design layer
   * registers with `ipc.on('agent-event', …)` and removes on unmount. The
   * handler reads the active chat id / buffer / step id from the live streaming
   * refs so it always acts on the run currently in flight.
   */
  static createHandler(
    ctx: AppContext,
    streaming: StreamingRefs,
    partnersRef: { current: PartnerController },
    onContext?: (usage: { used: number; limit: number; pct: number }) => void
  ): (event: unknown, agentEvent: AgentEvent) => void {
    // ── Streaming flush throttle ─────────────────────────────────────────────
    // The original code called `updateChatSteps` on EVERY token, which
    // re-allocates the entire `chats` array + the entire `steps` array per
    // call — thousands of full-array allocations per fast (Ollama) reply.
    // The `persist: false` flag only skipped the *disk* write; the
    // in-memory O(n²) churn (and the resulting GC pressure → multi-GB RSS)
    // still happened on every token. We now buffer deltas in the streaming
    // refs and commit to React state on a single throttled flush (~100 ms),
    // so a reply produces a handful of allocations instead of thousands.
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let dirtySinceFlush = false;

    const flushPending = (): void => {
      if (!dirtySinceFlush) return;
      dirtySinceFlush = false;
      const targetChatId = streaming.chatIdRef.current;
      if (!targetChatId) return;
      const buffer = streaming.bufferRef.current;
      const currentStepId = streaming.stepIdRef.current;
      // Guard: never synthesize an empty assistant step from a cleared/stale buffer.
      if (!currentStepId && !buffer) return;
      StoreService.updateChatSteps(
        ctx,
        targetChatId,
        (prev) => {
          if (currentStepId) {
            return prev.map((s) => (s.id === currentStepId ? { ...s, content: buffer } : s));
          }
          const newStepId = `stream-assistant-${Date.now()}`;
          streaming.stepIdRef.current = newStepId;
          const newStep: TrajectoryStep = {
            id: newStepId,
            type: 'assistant',
            content: buffer,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            metadata: {
              workedDuration: FormatService.formatWorkedDuration(
                Date.now() - (ctx.getChats().find((c) => c.id === targetChatId)?.startedAt || Date.now())
              )
            }
          };
          return [...prev, newStep];
        },
        false
      );
    };

    const scheduleFlush = (): void => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushPending();
      }, 100);
    };

    return (_event: unknown, agentEvent: AgentEvent) => {
      const chatId = streaming.chatIdRef.current;
      if (!chatId) return;

      // ── chat-name: update the chat title in state and store ──
      if (agentEvent.type === 'chat-name' && agentEvent.chatName) {
        StoreService.updateChatRecord(ctx, chatId, (current) => ({
          ...current,
          title: agentEvent.chatName!
        }));
      }

      // ── context: forward live context-window usage to the UI gauge ──
      if (agentEvent.type === 'context' && agentEvent.context && onContext) {
        onContext(agentEvent.context);
      }

      // ── token: append to the streaming buffer, mark dirty, schedule a
      // single throttled React-state flush (see flushPending above). The actual
      // `updateChatSteps` only runs on the ~100ms tick, not per token.
      if (agentEvent.type === 'token') {
        streaming.bufferRef.current += agentEvent.content || '';
        dirtySinceFlush = true;
        scheduleFlush();
      }

      // ── tool_call: append a "running" tool step to the trajectory ──
      if (agentEvent.type === 'tool_call') {
        const toolStep: TrajectoryStep = {
          id: `tool-call-${Date.now()}`,
          type: 'tool_call',
          toolName: agentEvent.toolName,
          content: `${agentEvent.toolName}(${JSON.stringify(agentEvent.toolArgs || {})})`,
          status: 'running',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        StoreService.updateChatSteps(ctx, chatId, (prev) => [...prev, toolStep]);
      }

      // ── tool_result: mark the matching running tool step "success" and, on a
      //    3D-character win, kick off the Partner import ──
      if (agentEvent.type === 'tool_result') {
        StoreService.updateChatSteps(ctx, chatId, (prev) => {
          const lastToolCallIdx = [...prev]
            .reverse()
            .findIndex((s) => s.type === 'tool_call' && s.status === 'running');
          if (lastToolCallIdx === -1) return prev;
          const actualIdx = prev.length - 1 - lastToolCallIdx;
          return prev.map((s, i) =>
            i === actualIdx ? { ...s, status: 'success' as const, content: agentEvent.content || s.content } : s
          );
        });
        streaming.bufferRef.current = '';
        streaming.stepIdRef.current = null;

        if (agentEvent.toolName === 'make_3d_character' && agentEvent.toolResult) {
          AgentStreamService.import3DCharacter(ctx, partnersRef, agentEvent.toolResult);
        }
      }

      // ── done / error / abort: finalize the chat (worked duration, not-running) ──
      if (agentEvent.type === 'done' || agentEvent.type === 'error' || agentEvent.type === 'abort') {
        // Commit any pending token flush right now so the final state is exact.
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flushPending();
        const chat = ctx.getChats().find((c) => c.id === chatId);
        const workedDuration = FormatService.formatWorkedDuration(Date.now() - (chat?.startedAt || Date.now()));
        StoreService.updateChatRecord(ctx, chatId, (current) => ({
          ...current,
          isRunning: false,
          lastError: agentEvent.type === 'error' ? (agentEvent.error || 'Unknown error') : undefined,
          steps: FormatService.stampWorkedDuration(current.steps, workedDuration)
        }));
        streaming.bufferRef.current = '';
        streaming.stepIdRef.current = null;
        streaming.chatIdRef.current = null;
        ctx.setIsGenerating(false);
        if (agentEvent.type === 'error') {
          ctx.triggerToast(`Agent error: ${agentEvent.error || 'Unknown error'}`);
        }
      }
    };
  }

  /**
   * On a successful `make_3d_character` tool result, imports the produced model
   * into the active Partner and launches the pet so it shows + animates.
   * No-ops (with an info toast) when 3D gen is disabled, the model is missing,
   * or there is no active Partner to display it. Non-JSON results are ignored.
   */
  private static import3DCharacter(
    ctx: AppContext,
    partnersRef: { current: PartnerController },
    toolResult: string
  ): void {
    try {
      const res = JSON.parse(toolResult) as {
        ok?: boolean;
        disabled?: boolean;
        path?: string;
        provider?: string;
        message?: string;
      };
      if (res.disabled) {
        ctx.triggerToast('3D Model Gen is disabled — enable it in Settings → 3D Model Gen.', 'info');
      } else if (res.ok && res.path) {
        const activeId = partnersRef.current.activeId;
        if (!activeId) {
          ctx.triggerToast('3D character ready, but no active Partner to show it.', 'info');
        } else {
          partnersRef.current
            .importModel(activeId, res.path)
            .then(() => {
              partnersRef.current.setActive(activeId);
              // The hook's startPet() returns void (it sets petRunning internally),
              // so we can't observe "running" here — mirror the original App.tsx
              // behavior and just confirm the model was saved.
              partnersRef.current.startPet().then(() => {
                ctx.triggerToast(`3D character saved to ${res.path}`, 'info');
              });
            });
        }
      } else if (res.message) {
        ctx.triggerToast(res.message, 'info');
      }
    } catch {
      /* non-JSON tool result — ignore */
    }
  }
}
