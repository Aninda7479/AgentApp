/**
 * SuperAgent Browser Extension — Authentication Bridge
 */

import { AuthState } from '../shared/types.js';
import { ExtensionSessionStore } from '../shared/session-store.js';
import { apiClient } from './api-client.js';

export class AuthBridge {
  public static async verifySession(): Promise<AuthState> {
    const status = await apiClient.getAuthStatus();
    await ExtensionSessionStore.setAuthState(status);
    return status;
  }

  public static async login(password: string): Promise<{ success: boolean; error?: string }> {
    const result = await apiClient.login(password);
    return result;
  }

  public static async logout(): Promise<void> {
    await apiClient.logout();
  }

  public static async ensureAuthenticated(): Promise<boolean> {
    const state = await this.verifySession();
    return state.authenticated || !state.authRequired;
  }
}
