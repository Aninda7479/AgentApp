/**
 * `AccountService` — the web-deployment account actions (open the account page,
 * log out). On the desktop shell these have no native surface, so they surface
 * an informational toast instead. The design layer calls `open` / `logout`.
 */
import type { AppContext } from './types';

export class AccountService {
  /**
   * Opens the account-management page. In web mode it navigates to `/account`;
   * on the desktop app it shows an info toast (account management is web-only).
   */
  static open(ctx: AppContext, isWebMode: boolean): void {
    if (isWebMode) {
      window.location.href = '/account';
    } else {
      ctx.triggerToast('Account management is available in the web deployment.');
    }
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
