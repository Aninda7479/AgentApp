/**
 * SuperAgent Browser Extension — Options Controller
 */

import { MessageBus } from '../shared/message-bus.js';
import { AuthState, ServerConfig } from '../shared/types.js';

document.addEventListener('DOMContentLoaded', async () => {
  const serverBaseUrl = document.getElementById('serverBaseUrl') as HTMLInputElement;
  const btnSaveServer = document.getElementById('btnSaveServer') as HTMLButtonElement;
  const connectionStatus = document.getElementById('connectionStatus') as HTMLElement;

  const authPassword = document.getElementById('authPassword') as HTMLInputElement;
  const btnLogin = document.getElementById('btnLogin') as HTMLButtonElement;
  const btnLogout = document.getElementById('btnLogout') as HTMLButtonElement;
  const authStatusText = document.getElementById('authStatusText') as HTMLElement;

  const btnRefreshMemory = document.getElementById('btnRefreshMemory') as HTMLButtonElement;
  const memoryOutput = document.getElementById('memoryOutput') as HTMLElement;

  // Load current config
  try {
    const config: ServerConfig = await MessageBus.send({ type: 'GET_SERVER_CONFIG' });
    if (config?.baseUrl) serverBaseUrl.value = config.baseUrl;

    const auth: AuthState = await MessageBus.send({ type: 'GET_AUTH_STATE' });
    updateAuthDisplay(auth);
  } catch (e) {}

  function updateAuthDisplay(auth: AuthState) {
    if (auth.authenticated || !auth.authRequired) {
      authStatusText.style.color = 'var(--accent-success)';
      authStatusText.textContent = `✓ Authenticated as "${auth.username || 'admin'}"`;
    } else {
      authStatusText.style.color = 'var(--text-secondary)';
      authStatusText.textContent = '🔒 Unauthenticated. Please sign in.';
    }
  }

  btnSaveServer.addEventListener('click', async () => {
    btnSaveServer.textContent = 'Saving...';
    await MessageBus.send({
      type: 'SET_SERVER_CONFIG',
      payload: { baseUrl: serverBaseUrl.value.trim() }
    });

    const ping = await MessageBus.send({ type: 'PING_SERVER' });
    connectionStatus.style.display = 'block';
    if (ping?.ok) {
      connectionStatus.style.color = 'var(--accent-success)';
      connectionStatus.textContent = '✓ Successfully connected to SuperAgent server!';
    } else {
      connectionStatus.style.color = '#ef4444';
      connectionStatus.textContent = '⚠️ Could not reach server at this address.';
    }
    btnSaveServer.textContent = 'Save & Test Connection';
  });

  btnLogin.addEventListener('click', async () => {
    const password = authPassword.value;
    if (!password) return;
    btnLogin.textContent = 'Signing in...';
    const res = await MessageBus.send({
      type: 'LOGIN_REQUEST',
      payload: { password }
    });
    btnLogin.textContent = 'Sign In';
    if (res?.success) {
      const auth = await MessageBus.send({ type: 'GET_AUTH_STATE' });
      updateAuthDisplay(auth);
    } else {
      authStatusText.style.color = '#ef4444';
      authStatusText.textContent = `Login failed: ${res?.error || 'Invalid password'}`;
    }
  });

  btnLogout.addEventListener('click', async () => {
    await MessageBus.send({ type: 'LOGOUT_REQUEST' });
    const auth = await MessageBus.send({ type: 'GET_AUTH_STATE' });
    updateAuthDisplay(auth);
  });

  btnRefreshMemory.addEventListener('click', async () => {
    memoryOutput.textContent = 'Fetching global memory & insights from core...';
    try {
      const profile = await MessageBus.send({ type: 'GET_MEMORY_PROFILE' });
      const insights = await MessageBus.send({ type: 'GET_LEARNED_INSIGHTS' });

      memoryOutput.textContent = JSON.stringify(
        {
          userProfileFacts: profile,
          learnedWorkflowInsights: insights
        },
        null,
        2
      );
    } catch (e: any) {
      memoryOutput.textContent = `Failed to fetch memory: ${e?.message || e}`;
    }
  });
});
