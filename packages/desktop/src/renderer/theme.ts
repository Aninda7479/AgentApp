import { useEffect, useState } from 'react';
import { ThemeMode } from './types';

const THEME_STORAGE_KEY = 'superagent.theme';

export const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'dark';
};

export const useThemeMode = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  return { themeMode, setThemeMode };
};
