import React from 'react';
import { ThemeMode } from '../types';

export interface ProviderConnection {
  id: string;
  name: string;
  type: 'env' | 'key' | 'custom';
  apiKey: string;
  baseUrl: string;
}

export interface ModelPricing {
  inputPer1M?: string;
  outputPer1M?: string;
  cachedInputPer1M?: string;
}

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
  type?: string; // legacy single-string field
}

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
  workMode: 'coding' | 'everyday';
  onWorkModeChange: (mode: 'coding' | 'everyday') => void;
  confirmShellCommands: boolean;
  onConfirmShellCommandsChange: (val: boolean) => void;
  autoReviewPlan: boolean;
  onAutoReviewPlanChange: (val: boolean) => void;
  unsandboxedActions: boolean;
  onUnsandboxedActionsChange: (val: boolean) => void;
}
