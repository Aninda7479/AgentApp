/**
 * `AccountService` — the web-deployment account actions (open the account page,
 * log out). On the desktop shell these have no native surface, so they surface
 * an informational toast instead. The design layer calls `open` / `logout`.
 */
import type { AppContext } from './types';

export class AccountService {
  /**
   * Opens the account / web host management view in Settings.
   */
  static open(ctx: AppContext, _isWebMode?: boolean): void {
    ctx.setActiveTab('settings');
    ctx.setSettingsCategory('web-app');
  }

  /**
   * Logs the user out. Web only: POSTs to `/api/auth/logout` (best-effort) then
   * redirects to `/login`. On the desktop app it shows an info toast and returns.
   */
  static async logout(ctx: AppContext, isWebMode: boolean): Promise<void> {
    if (!isWebMode) {
      ctx.triggerToast('Logout is available in the web deployment.');
      return;
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      /* best-effort — proceed to redirect anyway */
    }
    window.location.href = '/login';
  }
}
