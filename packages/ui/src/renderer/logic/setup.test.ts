import { describe, it, expect } from 'vitest';
import { SetupService } from './setup';
import { AuthStatus } from '../services/AuthService';

describe('SetupService - Application Readiness & Adaptive Setup', () => {
  const baseAuthStatus: AuthStatus = {
    authRequired: true,
    passwordSet: false,
    authenticated: false,
  };

  it('detects unconfigured new install (password and providers missing)', () => {
    const readiness = SetupService.evaluateReadiness({
      authStatus: baseAuthStatus,
      setupCompleted: false,
      ownerName: '',
      providers: [],
      models: [],
    });

    expect(readiness.isPasswordSet).toBe(false);
    expect(readiness.isAuthenticated).toBe(false);
    expect(readiness.isSetupCompleted).toBe(false);
    expect(readiness.missingItems).toContain('password');
    expect(readiness.missingItems).toContain('name');
    expect(readiness.missingItems).toContain('providers');
    expect(readiness.missingItems).toContain('models');
  });

  it('detects authenticated user with missing provider or models', () => {
    const readiness = SetupService.evaluateReadiness({
      authStatus: {
        authRequired: true,
        passwordSet: true,
        authenticated: true,
      },
      setupCompleted: true,
      ownerName: 'Aninda',
      providers: [],
      models: [],
    });

    expect(readiness.isPasswordSet).toBe(true);
    expect(readiness.isAuthenticated).toBe(true);
    expect(readiness.hasOwnerName).toBe(true);
    expect(readiness.missingItems).toEqual(['providers', 'models']);
  });

  it('correctly gates lock screen and onboarding wizard visibility', () => {
    // 1. First run, password not set -> LockScreen shows, Wizard waits
    const showLock = SetupService.shouldShowLockScreen(baseAuthStatus);
    const showWizard = SetupService.shouldShowOnboardingWizard({
      bootstrapping: false,
      setupCompleted: false,
      onboardingDismissed: false,
      authStatus: baseAuthStatus,
    });
    expect(showLock).toBe(true);
    expect(showWizard).toBe(false);

    // 2. Unlocked, setup not completed -> LockScreen hides, Wizard shows
    const unlockedAuth: AuthStatus = {
      authRequired: true,
      passwordSet: true,
      authenticated: true,
    };
    expect(SetupService.shouldShowLockScreen(unlockedAuth)).toBe(false);
    expect(
      SetupService.shouldShowOnboardingWizard({
        bootstrapping: false,
        setupCompleted: false,
        onboardingDismissed: false,
        authStatus: unlockedAuth,
      })
    ).toBe(true);

    // 3. Setup completed -> Wizard hides
    expect(
      SetupService.shouldShowOnboardingWizard({
        bootstrapping: false,
        setupCompleted: true,
        onboardingDismissed: false,
        authStatus: unlockedAuth,
      })
    ).toBe(false);

    // 4. Backend offline -> LockScreen, Wizard, and Setup MUST NOT show
    const offlineAuth: AuthStatus = {
      authRequired: true,
      passwordSet: false,
      authenticated: false,
      backendConnected: false,
    };
    expect(SetupService.shouldShowLockScreen(offlineAuth)).toBe(false);
    expect(
      SetupService.shouldShowOnboardingWizard({
        bootstrapping: false,
        setupCompleted: false,
        onboardingDismissed: false,
        authStatus: offlineAuth,
      })
    ).toBe(false);
    expect(
      SetupService.shouldShowHostSetupPrompt({
        bootstrapping: false,
        authStatus: offlineAuth,
        onboardingVisible: false,
        hostSetupDismissed: false,
      })
    ).toBe(false);
  });

  it('provides recommended step based on missing items', () => {
    expect(SetupService.getRecommendedStep(['name', 'providers'])).toBe(1);
    expect(SetupService.getRecommendedStep(['providers', 'models'])).toBe(2);
  });

  describe('shouldShowHostSetupPrompt', () => {
    const unlockedAuth: AuthStatus = {
      authRequired: true,
      passwordSet: true,
      authenticated: true,
    };

    it('returns false during bootstrapping', () => {
      expect(
        SetupService.shouldShowHostSetupPrompt({
          bootstrapping: true,
          authStatus: unlockedAuth,
          onboardingVisible: false,
          hostSetupDismissed: false,
          ownerName: undefined,
        })
      ).toBe(false);
    });

    it('returns false when locked behind master lock screen', () => {
      expect(
        SetupService.shouldShowHostSetupPrompt({
          bootstrapping: false,
          authStatus: baseAuthStatus,
          onboardingVisible: false,
          hostSetupDismissed: false,
          ownerName: undefined,
        })
      ).toBe(false);
    });

    it('returns false when onboarding wizard is visible', () => {
      expect(
        SetupService.shouldShowHostSetupPrompt({
          bootstrapping: false,
          authStatus: unlockedAuth,
          onboardingVisible: true,
          hostSetupDismissed: false,
          ownerName: undefined,
        })
      ).toBe(false);
    });

    it('returns false when dismissed for current session', () => {
      expect(
        SetupService.shouldShowHostSetupPrompt({
          bootstrapping: false,
          authStatus: unlockedAuth,
          onboardingVisible: false,
          hostSetupDismissed: true,
          ownerName: undefined,
        })
      ).toBe(false);
    });

    it('returns false when ownerName is already configured in params or authStatus', () => {
      expect(
        SetupService.shouldShowHostSetupPrompt({
          bootstrapping: false,
          authStatus: unlockedAuth,
          onboardingVisible: false,
          hostSetupDismissed: false,
          ownerName: 'Aninda',
        })
      ).toBe(false);

      expect(
        SetupService.shouldShowHostSetupPrompt({
          bootstrapping: false,
          authStatus: { ...unlockedAuth, ownerName: 'Aninda' },
          onboardingVisible: false,
          hostSetupDismissed: false,
          ownerName: undefined,
        })
      ).toBe(false);
    });

    it('returns true when authenticated, not onboarding, not dismissed, and ownerName is missing or default', () => {
      // Completely empty / undefined
      expect(
        SetupService.shouldShowHostSetupPrompt({
          bootstrapping: false,
          authStatus: unlockedAuth,
          onboardingVisible: false,
          hostSetupDismissed: false,
          ownerName: '',
        })
      ).toBe(true);

      // Default placeholder name
      expect(
        SetupService.shouldShowHostSetupPrompt({
          bootstrapping: false,
          authStatus: unlockedAuth,
          onboardingVisible: false,
          hostSetupDismissed: false,
          ownerName: 'SuperAgent User',
        })
      ).toBe(true);
    });
  });

  describe('shouldShowMissingModelBanner', () => {
    it('returns false during bootstrapping or before setup is completed', () => {
      expect(
        SetupService.shouldShowMissingModelBanner({
          bootstrapping: true,
          setupCompleted: true,
          modelsCatalog: [],
          dismissed: false,
        })
      ).toBe(false);

      expect(
        SetupService.shouldShowMissingModelBanner({
          bootstrapping: false,
          setupCompleted: false,
          modelsCatalog: [],
          dismissed: false,
        })
      ).toBe(false);
    });

    it('returns false when dismissed', () => {
      expect(
        SetupService.shouldShowMissingModelBanner({
          bootstrapping: false,
          setupCompleted: true,
          modelsCatalog: [],
          dismissed: true,
        })
      ).toBe(false);
    });

    it('returns false when at least one model is enabled', () => {
      expect(
        SetupService.shouldShowMissingModelBanner({
          bootstrapping: false,
          setupCompleted: true,
          modelsCatalog: [{ id: 'm1', name: 'Model 1', providerId: 'openai', enabled: true }],
          dismissed: false,
        })
      ).toBe(false);
    });

    it('returns true when models list is empty or all models are disabled', () => {
      expect(
        SetupService.shouldShowMissingModelBanner({
          bootstrapping: false,
          setupCompleted: true,
          modelsCatalog: [],
          dismissed: false,
        })
      ).toBe(true);

      expect(
        SetupService.shouldShowMissingModelBanner({
          bootstrapping: false,
          setupCompleted: true,
          modelsCatalog: [{ id: 'm1', name: 'Model 1', providerId: 'openai', enabled: false }],
          dismissed: false,
        })
      ).toBe(true);
    });
  });

  describe('shouldShowDaemonOfflineBanner', () => {
    it('returns false while loading or when dismissed', () => {
      expect(
        SetupService.shouldShowDaemonOfflineBanner({
          loading: true,
          authStatus: { authenticated: false, authRequired: true, passwordSet: false, isDaemonOnline: false },
          dismissed: false,
        })
      ).toBe(false);

      expect(
        SetupService.shouldShowDaemonOfflineBanner({
          loading: false,
          authStatus: { authenticated: false, authRequired: true, passwordSet: false, isDaemonOnline: false },
          dismissed: true,
        })
      ).toBe(false);
    });

    it('returns true when daemon is offline after loading screen', () => {
      expect(
        SetupService.shouldShowDaemonOfflineBanner({
          loading: false,
          authStatus: { authenticated: false, authRequired: true, passwordSet: false, isDaemonOnline: false },
          dismissed: false,
        })
      ).toBe(true);
    });

    it('returns false when daemon is online', () => {
      expect(
        SetupService.shouldShowDaemonOfflineBanner({
          loading: false,
          authStatus: { authenticated: true, authRequired: true, passwordSet: true, isDaemonOnline: true, version: '0.44.0' },
          dismissed: false,
        })
      ).toBe(false);
    });
  });

  describe('shouldShowDefaultPasswordAlert', () => {
    const unlockedAuth: AuthStatus = {
      authRequired: true,
      passwordSet: true,
      authenticated: true,
      isDefaultPassword: true,
    };

    it('returns false when bootstrapping, warning is ignored, dismissed, or onboarding visible', () => {
      expect(
        SetupService.shouldShowDefaultPasswordAlert({
          bootstrapping: true,
          authStatus: unlockedAuth,
          ignoreWarning: false,
          dismissed: false,
          onboardingVisible: false,
        })
      ).toBe(false);

      expect(
        SetupService.shouldShowDefaultPasswordAlert({
          bootstrapping: false,
          authStatus: unlockedAuth,
          ignoreWarning: true,
          dismissed: false,
          onboardingVisible: false,
        })
      ).toBe(false);

      expect(
        SetupService.shouldShowDefaultPasswordAlert({
          bootstrapping: false,
          authStatus: unlockedAuth,
          ignoreWarning: false,
          dismissed: true,
          onboardingVisible: false,
        })
      ).toBe(false);

      expect(
        SetupService.shouldShowDefaultPasswordAlert({
          bootstrapping: false,
          authStatus: unlockedAuth,
          ignoreWarning: false,
          dismissed: false,
          onboardingVisible: true,
        })
      ).toBe(false);
    });

    it('returns true when authenticated and default password is in use without ignore flag', () => {
      expect(
        SetupService.shouldShowDefaultPasswordAlert({
          bootstrapping: false,
          authStatus: unlockedAuth,
          ignoreWarning: false,
          dismissed: false,
          onboardingVisible: false,
        })
      ).toBe(true);
    });

    it('returns false when custom password is in use', () => {
      expect(
        SetupService.shouldShowDefaultPasswordAlert({
          bootstrapping: false,
          authStatus: { ...unlockedAuth, isDefaultPassword: false },
          ignoreWarning: false,
          dismissed: false,
          onboardingVisible: false,
        })
      ).toBe(false);
    });
  });
});

