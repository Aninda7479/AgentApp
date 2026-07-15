import React from 'react';
import { ThemeMode } from '../types';

/** Internet access governance level shown in settings. */
export type InternetAccessLevel = 'all' | 'observation' | 'none';

/** Status returned by the main-process update check. */
export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'unsupported' | 'error';
  version?: string;
  message?: string;
}

/** Persisted AI provider connection with API key and base URL. */
export interface ProviderConnection {
  id: string;
  name: string;
  type: 'env' | 'key' | 'custom';
  apiKey: string;
  baseUrl: string;
}

/** Per-token pricing for a model (per 1M tokens). */
export interface ModelPricing {
  inputPer1M?: string;
  outputPer1M?: string;
  cachedInputPer1M?: string;
}

/** Model catalog entry with capabilities, pricing, and enable state. */
export interface ModelConfig {
  id: string;
  name: string;
  providerId: string;
  enabled: boolean;
  description?: string;
  contextLimit?: string;   // e.g. "2M" or "128k"
  outputLimit?: string;    // max output tokens
  inputModalities?: string[];  // ['text','image','audio','video']
  outputModalities?: string[]; // ['text','image','audio']
  pricing?: ModelPricing;
  caching?: boolean;
  /** True when the model is free to use (detected from pricing or provider metadata). */
  free?: boolean;
  type?: string; // legacy single-string field
}

/** Props for the top-level SettingsView component. */
export interface SettingsViewProps {
  activeCategory: string;
  onSelectCategory: (category: string) => void;
  onBackToApp: () => void;
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  mcpDashboard: React.ReactNode;
  connectedProviders: ProviderConnection[];
  modelsCatalog: ModelConfig[];
  onConnectProvider: (provider: ProviderConnection, models: ModelConfig[]) => void;
  onDisconnectProvider: (providerId: string) => void;
  onToggleModel: (modelId: string) => void;
  skills: import('./IntegrationsSettings').IntegrationsSkill[];
  onToggleSkill: (id: string, enabled: boolean) => void;
  pluginCatalog: import('./IntegrationsSettings').IntegrationsPlugin[];
  pluginEnabled: Record<string, boolean>;
  onTogglePlugin: (id: string, enabled: boolean) => void;
  workMode: 'coding' | 'everyday';
  onWorkModeChange: (mode: 'coding' | 'everyday') => void;
  confirmShellCommands: boolean;
  onConfirmShellCommandsChange: (val: boolean) => void;
  autoReviewPlan: boolean;
  onAutoReviewPlanChange: (val: boolean) => void;
  unsandboxedActions: boolean;
  onUnsandboxedActionsChange: (val: boolean) => void;
  internetAccessLevel: InternetAccessLevel;
  onInternetAccessLevelChange: (level: InternetAccessLevel) => void;
  appVersion?: string;
  onCheckForUpdates?: () => void;
  updateStatus?: UpdateStatus | null;
}
