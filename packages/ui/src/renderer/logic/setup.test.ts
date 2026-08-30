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
  });

  it('provides recommended step based on missing items', () => {
    expect(SetupService.getRecommendedStep(['name', 'providers'])).toBe(1);
    expect(SetupService.getRecommendedStep(['providers', 'models'])).toBe(2);
  });
});
