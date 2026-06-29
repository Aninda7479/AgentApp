import { BYOKProviderManager, ModelCapabilityRegistry, SkillStore, LearningLoopEngine, AgentMessage } from '@superagent/core';

export interface KeyInput {
  name?: string;
  tab?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  sequence?: string;
}

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

export interface SessionTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface CLICommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

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

export function createSessionContext(provider: string = 'openai', model: string = 'gpt-4o'): SessionContext {
  const byokManager = new BYOKProviderManager();
  const capabilityRegistry = new ModelCapabilityRegistry();
  const skillStore = new SkillStore();
  const learningEngine = new LearningLoopEngine();
  const activeTheme: Theme = {
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
  return {
    activeProvider: provider,
    activeModel: model,
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

