import { getIpc } from '../lib/ipc';
import { AuthStatus } from '../services/AuthService';
import { ProviderConnection, ModelConfig } from '../pages/Settings/types';

export interface SystemReadiness {
  /** Whether the master password has been configured */
  isPasswordSet: boolean;
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;
  /** Whether the first-run onboarding setup wizard has been completed */
  isSetupCompleted: boolean;
  /** Whether the developer / owner name has been set */
  hasOwnerName: boolean;
  /** Whether at least one AI provider is configured */
  hasConnectedProviders: boolean;
  /** Whether at least one AI model is enabled for reasoning */
  hasEnabledModels: boolean;
  /** Specific missing setup components */
  missingItems: Array<'password' | 'name' | 'providers' | 'models'>;
}

/**
 * `SetupService` — Dedicated service for evaluating application readiness,
 * first-run onboarding status, and adaptive setup prompts.
 * 
 * Separates setup lifecycle and readiness evaluation from day-to-day workspace execution.
 */
export class SetupService {
  /**
   * Evaluates the complete readiness state of the SuperAgent system.
   */
  static evaluateReadiness(params: {
    authStatus: AuthStatus;
    setupCompleted: boolean;
    ownerName?: string;
    providers: ProviderConnection[];
    models: ModelConfig[];
  }): SystemReadiness {
    const { authStatus, setupCompleted, ownerName, providers, models } = params;

    const isPasswordSet = Boolean(authStatus.passwordSet);
    const isAuthenticated = !authStatus.authRequired || Boolean(authStatus.authenticated);
    const isSetupCompleted = Boolean(setupCompleted);
    const hasOwnerName = Boolean(ownerName && ownerName.trim().length > 0 && ownerName.trim() !== 'SuperAgent User');
    const hasConnectedProviders = Array.isArray(providers) && providers.length > 0;
    const hasEnabledModels = Array.isArray(models) && models.some((m) => m.enabled !== false);

    const missingItems: Array<'password' | 'name' | 'providers' | 'models'> = [];

    if (!isPasswordSet) {
      missingItems.push('password');
    }
    if (!hasOwnerName) {
      missingItems.push('name');
    }
    if (!hasConnectedProviders) {
      missingItems.push('providers');
    }
    if (!hasEnabledModels) {
      missingItems.push('models');
    }

    return {
      isPasswordSet,
      isAuthenticated,
      isSetupCompleted,
      hasOwnerName,
      hasConnectedProviders,
      hasEnabledModels,
      missingItems,
    };
  }

  /**
   * Determines whether the Master Password Lock / Setup screen should be rendered.
   */
  static shouldShowLockScreen(authStatus: AuthStatus): boolean {
    return Boolean(authStatus.authRequired && !authStatus.authenticated);
  }

  /**
   * Determines whether the full Onboarding Setup Wizard should be rendered.
   */
  static shouldShowOnboardingWizard(params: {
    bootstrapping: boolean;
    setupCompleted: boolean;
    onboardingDismissed: boolean;
    authStatus: AuthStatus;
  }): boolean {
    const { bootstrapping, setupCompleted, onboardingDismissed, authStatus } = params;
    if (bootstrapping) return false;
    if (setupCompleted) return false;
    if (onboardingDismissed) return false;
    // Only display onboarding once unlocked or after setting master password
    if (authStatus.authRequired && !authStatus.authenticated) return false;
    return true;
  }

  /**
   * Returns the recommended starting step of OnboardingWizard based on what is missing.
   * Step 1: Welcome & Developer Name
   * Step 2: Providers & Models Catalog
   * Step 3: Telegram Remote Control
   * Step 4: Permissions & Preferences
   */
  static getRecommendedStep(missingItems: Array<'password' | 'name' | 'providers' | 'models'>): number {
    if (missingItems.includes('name')) return 1;
    if (missingItems.includes('providers') || missingItems.includes('models')) return 2;
    return 1;
  }

  /**
   * Saves setup state as completed across settings and local storage.
   */
  static async completeSetup(patch?: Record<string, any>): Promise<void> {
    const ipc = getIpc();
    if (ipc) {
      try {
        const currentSettings = (await ipc.invoke('settings-read')) || {};
        const general = currentSettings.general || {};
        const updatedGeneral = {
          ...general,
          setupState: {
            completed: true,
            version: 1,
            completedAt: new Date().toISOString(),
          },
        };
        await ipc.invoke('settings-write', {
          ...currentSettings,
          ...patch,
          general: updatedGeneral,
        });
      } catch (e) {
        console.warn('SetupService.completeSetup failed to write settings', e);
      }
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('superagent_setup_completed', 'true');
      }
    } catch {}
  }
}
