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
    const config = await ExtensionSessionStore.getServerConfig();
    const isLocalhost = config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1');

    if (status.connected && (status.authenticated || !status.authRequired || isLocalhost)) {
      await apiClient.connectWebSocket();
    } else if (!status.connected) {
      apiClient.disconnectWebSocket();
    } else {
      await ExtensionSessionStore.clearAuthToken();
      apiClient.disconnectWebSocket();
    }
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
    return state.connected && (state.authenticated || !state.authRequired);
  }
}
