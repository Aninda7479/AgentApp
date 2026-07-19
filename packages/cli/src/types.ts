import { BYOKProviderManager, ModelCapabilityRegistry, SkillStore, LearningLoopEngine, AgentMessage, SettingsStorage, resolveConnection } from '@superagent/core';
import { BUILTIN_THEMES } from './commands/theme.js';

/** Represents a terminal keyboard input event with key modifiers. */
export interface KeyInput {
  name?: string;
  tab?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  sequence?: string;
}

/** Defines the color palette for a visual terminal theme. */
export interface Theme {
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  errorColor: string;
  successColor: string;
  warningColor: string;
  textColor: string;
  borderColor: string;
  backgroundColor: string;
}

/** Statistics for token consumption in the current session. */
export interface SessionTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

/** Result returned by CLI command handlers. */
export interface CLICommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/** Holds all runtime state for an active CLI session. */
export interface SessionContext {
  activeProvider: string;
  activeModel: string;
  byokManager: BYOKProviderManager;
  capabilityRegistry: ModelCapabilityRegistry;
  skillStore: SkillStore;
  learningEngine: LearningLoopEngine;
  activeTheme: Theme;
  startTime: number;
  tokenUsage: SessionTokenUsage;
  messages: AgentMessage[];
}

/**
 * Creates and initializes a new session context with saved settings.
 * @param provider - AI provider name (e.g. 'openai')
 * @param model - Model identifier (e.g. 'gpt-4o')
 */
export function createSessionContext(provider: string = 'openai', model: string = 'gpt-4o'): SessionContext {
  const byokManager = new BYOKProviderManager();
  const capabilityRegistry = new ModelCapabilityRegistry();
  const skillStore = new SkillStore();
  const learningEngine = new LearningLoopEngine();

  // Load saved settings
  const savedSettings = SettingsStorage.loadSettings();
  const rawProvider = savedSettings.lastUsedModel?.provider || provider;
  const rawModel = savedSettings.lastUsedModel?.model || model;
  const conn = resolveConnection(rawProvider, rawModel);
  const activeProvider = conn.provider || rawProvider;
  const activeModel = conn.model || rawModel;

  // Load saved API keys from settings.json into byokManager
  if (savedSettings.providers) {
    for (const p of savedSettings.providers) {
      if (p.apiKey) {
        try {
          byokManager.registerKey({
            provider: p.id as any,
            apiKey: p.apiKey,
            baseUrl: p.baseUrl
          });
        } catch {
          // ignore registration errors for incomplete provider configs
        }
      }
    }
  }

  const defaultTheme: Theme = {
    name: 'DARK',
    description: 'Default dark theme',
    primaryColor: '#00ffff',
    secondaryColor: '#ff00ff',
    accentColor: '#ffff00',
    errorColor: '#ff0000',
    successColor: '#00ff00',
    warningColor: '#ffaa00',
    textColor: '#ffffff',
    borderColor: '#444444',
    backgroundColor: '#000000'
  };

  // Restore last-used provider and model from persisted settings
  const savedThemeName = (savedSettings.theme?.cli || 'dark').toLowerCase();
  const activeTheme = BUILTIN_THEMES[savedThemeName] || defaultTheme;

  return {
    activeProvider,
    activeModel,
    byokManager,
    capabilityRegistry,
    skillStore,
    learningEngine,
    activeTheme,
    startTime: Date.now(),
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 },
    messages: []
  };
}

