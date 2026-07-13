import { useEffect, useState } from 'react';
import { ThemeMode } from './types';

const THEME_STORAGE_KEY = 'superagent.theme';

/** Reads the persisted theme from localStorage, defaulting to 'dark'. */
export const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
};

function resolveTheme(themeMode: ThemeMode): 'light' | 'dark' {
  if (themeMode === 'system') {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return themeMode;
}

/** React hook that manages theme state and syncs it with localStorage. */
export const useThemeMode = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(themeMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  return { themeMode, setThemeMode };
};
