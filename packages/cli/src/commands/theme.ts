import { Theme, SessionContext, CLICommandResult } from '../types.js';
import { SettingsStorage } from '@superagent/core';

/** Map of built-in theme name to Theme definition. */
export const BUILTIN_THEMES: Record<string, Theme> = {
  dark: {
    name: 'dark',
    description: 'Classic dark terminal interface with cyan accents',
    primaryColor: '#00ffff',
    secondaryColor: '#5f87ff',
    accentColor: '#ff00ff',
    errorColor: '#ff5555',
    successColor: '#50fa7b',
    warningColor: '#f1fa8c',
    textColor: '#f8f8f2',
    borderColor: '#6272a4',
    backgroundColor: '#282a36'
  },
  light: {
    name: 'light',
    description: 'Clean high-contrast light background theme',
    primaryColor: '#005f87',
    secondaryColor: '#0087af',
    accentColor: '#d75f00',
    errorColor: '#d70000',
    successColor: '#008700',
    warningColor: '#af5f00',
    textColor: '#1c1c1c',
    borderColor: '#bcbcbc',
    backgroundColor: '#ffffff'
  },
  dracula: {
    name: 'dracula',
    description: 'Popular vampire theme with purple and pink highlights',
    primaryColor: '#bd93f9',
    secondaryColor: '#ff79c6',
    accentColor: '#8be9fd',
    errorColor: '#ff5555',
    successColor: '#50fa7b',
    warningColor: '#f1fa8c',
    textColor: '#f8f8f2',
    borderColor: '#44475a',
    backgroundColor: '#282a36'
  },
  nord: {
    name: 'nord',
    description: 'Arctic, north-bluish clean aesthetic theme',
    primaryColor: '#88c0d0',
    secondaryColor: '#81a1c1',
    accentColor: '#b48ead',
    errorColor: '#bf616a',
    successColor: '#a3be8c',
    warningColor: '#ebcb8b',
    textColor: '#eceff4',
    borderColor: '#4c566a',
    backgroundColor: '#2e3440'
  },
  cyberpunk: {
    name: 'cyberpunk',
    description: 'High-energy neon yellow and magenta synthwave aesthetic',
    primaryColor: '#fcee0a',
    secondaryColor: '#ff0055',
    accentColor: '#00ff9f',
    errorColor: '#ff003c',
    successColor: '#00ff9f',
    warningColor: '#fcee0a',
    textColor: '#ffffff',
    borderColor: '#ff0055',
    backgroundColor: '#050505'
  },
  matrix: {
    name: 'matrix',
    description: 'Digital rain monochrome green on black background',
    primaryColor: '#00ff00',
    secondaryColor: '#00cc00',
    accentColor: '#33ff33',
    errorColor: '#ff3333',
    successColor: '#00ff00',
    warningColor: '#ffff00',
    textColor: '#00ff00',
    borderColor: '#008800',
    backgroundColor: '#000000'
  }
};

/** Registry that stores and retrieves available themes. */
export class ThemeRegistry {
  private themes: Map<string, Theme> = new Map();

  constructor() {
    for (const key of Object.keys(BUILTIN_THEMES)) {
      this.themes.set(key, BUILTIN_THEMES[key]);
    }
  }

  /** Returns a theme by name (case-insensitive), or undefined if not found. */
  public getTheme(name: string): Theme | undefined {
    return this.themes.get(name.toLowerCase());
  }

  /** Returns all registered themes as an array. */
  public getAllThemes(): Theme[] {
    return Array.from(this.themes.values());
  }

  /** Registers a new theme in the registry (overwrites if name exists). */
  public registerTheme(theme: Theme): void {
    this.themes.set(theme.name.toLowerCase(), theme);
  }
}

/** Static helper for listing and switching visual themes. */
export class ThemeSwitcher {
  private static registry = new ThemeRegistry();

  /** Returns a formatted string listing all themes with the current one marked. */
  public static listThemes(context: SessionContext): string {
    const themes = this.registry.getAllThemes();
    const lines: string[] = ['=== Terminal Visual Themes ==='];
    for (const t of themes) {
      const isCurrent = t.name.toLowerCase() === context.activeTheme.name.toLowerCase();
      const prefix = isCurrent ? '-> * ' : '   * ';
      lines.push(`${prefix}${t.name.toUpperCase()} — ${t.description}`);
    }
    lines.push(`\nCurrent Active Theme: ${context.activeTheme.name}`);
    return lines.join('\n');
  }

  /** Switches the active theme by name and persists the selection. */
  public static switchTheme(context: SessionContext, themeName: string): CLICommandResult {
    const found = this.registry.getTheme(themeName);
    if (!found) {
      return {
        success: false,
        message: `Theme '${themeName}' not found. Use '/theme list' to view available themes.`
      };
    }

    context.activeTheme = found;
    SettingsStorage.saveSettings({
      theme: {
        cli: found.name
      }
    });
    return {
      success: true,
      message: `Visual theme switched to '${found.name.toUpperCase()}'.`,
      data: found
    };
  }
}

/** Handles `/theme` slash command: lists or switches themes. */
export function handleThemeCommand(args: string[], context: SessionContext): CLICommandResult {
  if (args.length === 0 || args[0] === 'list') {
    return {
      success: true,
      message: ThemeSwitcher.listThemes(context)
    };
  }

  return ThemeSwitcher.switchTheme(context, args[0]);
}
