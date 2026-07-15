/**
 * Shared types and the `AppContext` bridge used to separate logic from design.
 *
 * The renderer's `.tsx` files are the "design" layer. All real work (IPC
 * orchestration, data transforms, branching/simulation) lives in documented
 * classes under `renderer/logic/`. Those classes never touch React directly —
 * instead `App.tsx` builds an `AppContext` and passes it into every class
 * method. The context exposes:
 *   • live **getters** (read through refs so classes see fresh state, not stale
 *     closure captures), and
 *   • **setters** (so classes can drive UI state), plus a couple of composite
 *     helpers (`persistStore`, `triggerToast`) that `App.tsx` owns.
 *
 * This keeps the design shell thin while leaving behavior identical to before
 * the refactor.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { StoredChat, StoredProject, ThemeMode } from '../types';
import type { TrajectoryStep } from '../components/TrajectoryCanvas';
import type { ProviderConnection, ModelConfig } from '../settings/SettingsView';
import type { MCPServerInfo } from '../components/MCPDashboard';
import type { InternetAccessLevel } from '../settings/types';

export type {
  StoredChat,
  StoredProject,
  ThemeMode,
  TrajectoryStep,
  ProviderConnection,
  ModelConfig,
  MCPServerInfo,
  InternetAccessLevel
};

/** Options accepted by the composer when sending a prompt. */
export interface ComposerOptions {
  model?: string;
  mode?: string;
  attachments?: string[];
}

/** A single attachment staged in the composer before a prompt is sent. */
export interface ComposerAttachment {
  filename: string;
  sourcePath?: string;
  buffer?: number[];
}

/** Shape of a navigation snapshot stored in the back/forward history. */
export interface NavigationSnapshot {
  activeTab: string;
  settingsCategory: string;
  activeProject: string;
  activeChatId: string | null;
  activeDiff: { filename: string; originalCode: string; modifiedCode: string } | null;
}

/** Status payload for the Settings → Updates panel. */
export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'unsupported' | 'error';
  version?: string;
  message?: string;
}

/**
 * The bridge `App.tsx` hands to every logic class. It is the ONLY channel
 * through which logic classes observe or mutate UI state — there are no hidden
 * globals. Methods receive this as their final argument.
 */
export interface AppContext {
  /** The Electron ipcRenderer, or null outside the desktop shell. */
  ipc: any | null;

  // ── live getters (always read current state via refs) ──
  getProjects(): StoredProject[];
  getChats(): StoredChat[];
  getConnectedProviders(): ProviderConnection[];
  getModelsCatalog(): ModelConfig[];
  getMcpServers(): MCPServerInfo[];
  getActiveChatId(): string | null;
  getActiveProject(): string;
  getDraftProject(): string;
  getInternetAccessLevel(): InternetAccessLevel;
  getThemeMode(): ThemeMode;
  getComposerAttachments(): ComposerAttachment[];
  getTrajectorySteps(): TrajectoryStep[];
  getLastUsedModel(): string;

  // ── setters ──
  setProjects: Dispatch<SetStateAction<StoredProject[]>>;
  setChats: Dispatch<SetStateAction<StoredChat[]>>;
  setConnectedProviders: Dispatch<SetStateAction<ProviderConnection[]>>;
  setModelsCatalog: Dispatch<SetStateAction<ModelConfig[]>>;
  setTrajectorySteps: Dispatch<SetStateAction<TrajectoryStep[]>>;
  setActiveChatId: Dispatch<SetStateAction<string | null>>;
  setActiveProject: Dispatch<SetStateAction<string>>;
  setDraftProject: Dispatch<SetStateAction<string>>;
  setActiveTab: Dispatch<SetStateAction<string>>;
  setSettingsCategory: Dispatch<SetStateAction<string>>;
  setActiveDiff: Dispatch<SetStateAction<{ filename: string; originalCode: string; modifiedCode: string } | null>>;
  setToastMessage: Dispatch<SetStateAction<string>>;
  setToastType: Dispatch<SetStateAction<'info' | 'error'>>;
  setToastOpen: Dispatch<SetStateAction<boolean>>;
  setNavigationHistory: Dispatch<SetStateAction<NavigationSnapshot[]>>;
  setNavigationIndex: Dispatch<SetStateAction<number>>;
  setMcpServers: Dispatch<SetStateAction<MCPServerInfo[]>>;
  setPluginEnabled: Dispatch<SetStateAction<Record<string, boolean>>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
  setWorkMode: Dispatch<SetStateAction<'coding' | 'everyday'>>;
  setDefaultPermissions: Dispatch<SetStateAction<boolean>>;
  setAutoReview: Dispatch<SetStateAction<boolean>>;
  setFullAccess: Dispatch<SetStateAction<boolean>>;
  setInternetAccessLevel: Dispatch<SetStateAction<InternetAccessLevel>>;
  setLastUsedModel: Dispatch<SetStateAction<string>>;
  setUpdateStatus: Dispatch<SetStateAction<UpdateStatus | null>>;
  setComposerPrompt: Dispatch<SetStateAction<string>>;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;

  // ── composite helpers owned by App.tsx ──
  /** Writes providers/models/projects/chats back to the on-disk JSON store. */
  persistStore(
    providers: ProviderConnection[],
    models: ModelConfig[],
    projects?: StoredProject[],
    chats?: StoredChat[]
  ): void;
  /** Shows a toast (auto-detects error vs info when `type` is omitted). */
  triggerToast(message: string, type?: 'info' | 'error'): void;
}
