/**
 * `AccountService` — account and session locking actions.
 * Manages locking the app / logging out across both Desktop and Web deployments.
 */
import type { AppContext } from './types';
import { AuthService } from '../services/AuthService';

export class AccountService {
  /**
   * Opens the account / web host management view in Settings.
   */
  static open(ctx: AppContext, _isWebMode?: boolean): void {
    ctx.setActiveTab('settings');
    ctx.setSettingsCategory('web-app');
  }

  /**
   * Locks the active session / logs the user out.
   * On Web: calls logout and redirects to `/login`.
   * On Desktop: clears stored session token and renders the DesktopLockScreen.
   */
  static async logout(ctx: AppContext, isWebMode: boolean): Promise<void> {
    try {
      await AuthService.logout();
    } catch {
      /* ignore */
    }
    if (isWebMode && typeof window !== 'undefined' && window.location && window.location.pathname !== '/login') {
      window.location.href = '/login';
    } else {
      ctx.triggerToast('SuperAgent session locked.');
    }
  }
}
