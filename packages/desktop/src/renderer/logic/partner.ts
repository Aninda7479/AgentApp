/**
 * `PartnerSyncService` — keeps the desktop 3D Partner (pet) in sync with the
 * app: it derives the pet's mood from agent state, pushes the active Partner
 * manifest to the main process, and relays "say" requests from the DOM event
 * the pet listens for. All communication goes over IPC.
 */
export class PartnerSyncService {
  /**
   * Derives the pet's current mood from demo/agent state: an errored chat makes
   * the pet sad, an in-flight run makes it work, otherwise it idles.
   */
  static moodFor(isGenerating: boolean, lastError?: string): 'sad' | 'working' | 'idle' {
    if (lastError) return 'sad';
    return isGenerating ? 'working' : 'idle';
  }

  /**
   * Pushes the active Partner manifest to the main process so the 3D pet window
   * renders the right character. Safe no-op when IPC is unavailable.
   */
  static syncActive(ipc: any | null, active: any | null): void {
    if (!ipc) return;
    ipc.invoke('pet-set-partner', active).catch(() => {});
  }

  /**
   * Relays a "partner:say" DOM event to the pet. The detail may be a string or
   * `{ text }`; only non-empty text is forwarded over IPC.
   */
  static say(ipc: any | null, detail: unknown): void {
    if (!ipc) return;
    const text = typeof detail === 'string' ? detail : ((detail as any)?.text as string) || '';
    if (text) ipc.invoke('pet-say', text).catch(() => {});
  }
}
