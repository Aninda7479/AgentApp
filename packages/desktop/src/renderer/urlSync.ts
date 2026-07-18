/**
 * URL <-> view-state synchronization for the SuperAgent renderer.
 *
 * The same renderer runs in two shells:
 *  - Web:      served over http(s), so we use the History API (`pushState`).
 *  - Desktop:  loaded via `file://`, where `pushState` throws a SecurityError,
 *              so we fall back to the location hash.
 *
 * This gives every view a shareable URL (/settings, /chat/<id>, /plugins) while
 * keeping the app's existing internal navigation state as the source of truth.
 * Browser/desktop back-forward is handled by listening to `popstate`/`hashchange`.
 */

export interface RouteState {
  activeTab: string;
  activeChatId: string | null;
  settingsCategory: string;
}

const KNOWN_TABS = ['trajectory', 'settings', 'mcp', 'scheduled', 'diff', 'partner', 'studio'];

// Sentinel id used by the app for a chat that is being composed but not yet
// saved. It is not a real, shareable chat, so it must map to the home
// route ("/") rather than "/chat/draft-chat".
const DRAFT_CHAT_ID = 'draft-chat';

// Settings categories are keyed by hyphenated ids internally (e.g. "3d",
// "model-gov"). A human-typed or bookmarked URL may use a friendlier slug
// (e.g. "3d-model-gen"). Normalize incoming slugs to the canonical id so the
// matching SettingsView panel always renders instead of a blank panel.
const SETTINGS_SLUG_TO_ID: Record<string, string> = {
  '3d-model-gen': '3d',
  '3d-model-generation': '3d',
  'model-governance': 'model-gov',
  'model-government': 'model-gov'
};

function normalizeSettingsCategory(raw: string): string {
  if (!raw || raw === 'general') return 'general';
  return SETTINGS_SLUG_TO_ID[raw] || raw;
}

function isFileProtocol(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'file:';
}

/** Reads the current route from the address bar. */
export function getRouteFromLocation(): RouteState {
  if (typeof window === 'undefined') {
    // Server-side / test render with no DOM — fall back to the default view.
    return { activeTab: 'trajectory', activeChatId: null, settingsCategory: 'general' };
  }
  const raw = isFileProtocol()
    ? window.location.hash.replace(/^#/, '')
    : window.location.pathname;
  const path = raw && raw.startsWith('/') ? raw : '/' + (raw || '');
  const segments = path.split('/').filter(Boolean);

  if (segments[0] === 'chat' && segments[1] && segments[1] !== DRAFT_CHAT_ID) {
    return { activeTab: 'trajectory', activeChatId: segments[1], settingsCategory: 'general' };
  }
  if (segments[0] === 'settings') {
    const category = normalizeSettingsCategory(segments[1] || 'general');
    return { activeTab: 'settings', activeChatId: null, settingsCategory: category };
  }
  const tab = segments[0];
  if (tab && KNOWN_TABS.includes(tab)) {
    return { activeTab: tab, activeChatId: null, settingsCategory: 'general' };
  }
  return { activeTab: 'trajectory', activeChatId: null, settingsCategory: 'general' };
}

/** Builds the URL path for a given view state. */
export function buildPath(state: RouteState): string {
  if (state.activeChatId && state.activeChatId !== DRAFT_CHAT_ID) {
    return `/chat/${state.activeChatId}`;
  }
  if (state.activeTab === 'settings') {
    return state.settingsCategory && state.settingsCategory !== 'general'
      ? `/settings/${state.settingsCategory}`
      : '/settings';
  }
  if (state.activeTab === 'trajectory') {
    return '/';
  }
  return `/${state.activeTab}`;
}

/** Pushes the current view state into the address bar (no-op if unchanged). */
export function pushRoute(state: RouteState): void {
  const target = buildPath(state);
  const current = isFileProtocol() ? window.location.hash.replace(/^#/, '') : window.location.pathname;
  if (current === target) return;
  if (isFileProtocol()) {
    window.location.hash = target;
  } else {
    window.history.pushState(state, '', target);
  }
}

/** Subscribes to browser/desktop back-forward navigation. Returns an unsubscribe fn. */
export function subscribeRouteChange(cb: (state: RouteState) => void): () => void {
  const handler = () => cb(getRouteFromLocation());
  if (isFileProtocol()) {
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }
  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}
