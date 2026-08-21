/**
 * `NavigationService` — owns the back/forward navigation history logic for the
 * app shell. The design layer just calls `buildSnapshot` on state changes and
 * `applySnapshot` when the user hits back/forward; all the comparison and
 * restore bookkeeping lives here.
 */
import type { AppContext, NavigationSnapshot } from './types';
import { StoreService } from './store';

export class NavigationService {
  /**
   * Captures the full navigation state so it can be restored later by
   * back/forward. Pass the current view flags; returns a snapshot object.
   */
  static buildSnapshot(state: {
    activeTab: string;
    settingsCategory: string;
    activeProject: string;
    activeChatId: string | null;
    activeDiff: { filename: string; originalCode: string; modifiedCode: string } | null;
  }): NavigationSnapshot {
    return {
      activeTab: state.activeTab,
      settingsCategory: state.settingsCategory,
      activeProject: state.activeProject,
      activeChatId: state.activeChatId,
      activeDiff: state.activeDiff
    };
  }

  /**
   * Compares two navigation snapshots for equality. Used to avoid pushing a
   * duplicate history entry when nothing the user sees has actually changed.
   */
  static snapshotsEqual(left: NavigationSnapshot, right: NavigationSnapshot): boolean {
    return (
      left.activeTab === right.activeTab &&
      left.settingsCategory === right.settingsCategory &&
      left.activeProject === right.activeProject &&
      left.activeChatId === right.activeChatId &&
      left.activeDiff?.filename === right.activeDiff?.filename &&
      left.activeDiff?.originalCode === right.activeDiff?.originalCode &&
      left.activeDiff?.modifiedCode === right.activeDiff?.modifiedCode
    );
  }

  /**
   * Restores a previously captured snapshot: sets every view state and, if a
   * chat is targeted, loads that chat's trajectory steps into the canvas.
   */
  static applySnapshot(snapshot: NavigationSnapshot, ctx: AppContext): void {
    ctx.setActiveTab(snapshot.activeTab);
    ctx.setSettingsCategory(snapshot.settingsCategory);
    ctx.setActiveProject(snapshot.activeProject);
    ctx.setActiveChatId(snapshot.activeChatId);
    ctx.setActiveDiff(snapshot.activeDiff);

    if (snapshot.activeChatId) {
      // Lazy-load the chat's trajectory (see StoreService.openChat) instead
      // of reading it from the in-memory array, which no longer holds
      // dormant chats' steps.
      StoreService.openChat(ctx, snapshot.activeChatId);
    }
  }
}
