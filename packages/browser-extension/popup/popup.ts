/**
 * SuperAgent Browser Extension — Quick Popup Controller
 */

import { MessageBus } from '../src/shared/message-bus.js';
import { AuthState } from '../src/shared/types.js';

document.addEventListener('DOMContentLoaded', async () => {
  const popupDot = document.getElementById('popupDot') as HTMLElement;
  const popupStatus = document.getElementById('popupStatus') as HTMLElement;
  const btnOpenSidePanel = document.getElementById('btnOpenSidePanel') as HTMLButtonElement;
  const btnQuickScreenshot = document.getElementById('btnQuickScreenshot') as HTMLButtonElement;
  const btnOpenOptions = document.getElementById('btnOpenOptions') as HTMLButtonElement;

  try {
    const auth: AuthState = await MessageBus.send({ type: 'GET_AUTH_STATE' });
    if (auth.authenticated || !auth.authRequired) {
      popupDot.className = 'dot connected';
      popupStatus.textContent = 'Connected';
    } else {
      popupDot.className = 'dot';
      popupStatus.textContent = 'Auth Required';
    }
  } catch {
    popupDot.className = 'dot';
    popupStatus.textContent = 'Offline';
  }

  btnOpenSidePanel.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  });

  btnQuickScreenshot.addEventListener('click', async () => {
    btnQuickScreenshot.textContent = 'Capturing...';
    const res = await MessageBus.send({
      type: 'EXECUTE_TOOL',
      payload: { tool: 'capture_screenshot', input: { format: 'png' } }
    });
    if (res?.result?.dataUrl) {
      btnQuickScreenshot.textContent = '✓ Screenshot Saved';
      // Open in new tab for easy viewing/saving
      chrome.tabs.create({ url: res.result.dataUrl });
    } else {
      btnQuickScreenshot.textContent = 'Failed to capture';
    }
    setTimeout(() => {
      btnQuickScreenshot.textContent = '📸 Capture Viewport Screenshot';
    }, 2000);
  });

  btnOpenOptions.addEventListener('click', () => {
    if (chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });
});
