export interface PPTColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  mutedText: string;
  cardBg: string;
}

export interface PPTTheme {
  name: string;
  displayName: string;
  palette: PPTColorPalette;
  fontHeader: string;
  fontBody: string;
}

export const ModernCorporateTheme: PPTTheme = {
  name: 'modern-corporate',
  displayName: 'Modern Corporate',
  palette: {
    primary: '0F172A',
    secondary: '2563EB',
    accent: 'F59E0B',
    background: 'FFFFFF',
    text: '1E293B',
    mutedText: '64748B',
    cardBg: 'F8FAFC'
  },
  fontHeader: 'Helvetica',
  fontBody: 'Helvetica'
};

export const TechMinimalistTheme: PPTTheme = {
  name: 'tech-minimalist',
  displayName: 'Tech Minimalist',
  palette: {
    primary: '18181B',
    secondary: '0EA5E9',
    accent: '10B981',
    background: 'FAFAFA',
    text: '09090B',
    mutedText: '71717A',
    cardBg: 'F4F4F5'
  },
  fontHeader: 'Arial',
  fontBody: 'Arial'
};

export const DarkCreativeTheme: PPTTheme = {
  name: 'dark-creative',
  displayName: 'Dark Creative',
  palette: {
    primary: '0F172A',
    secondary: '8B5CF6',
    accent: 'EC4899',
    background: '020617',
    text: 'F8FAFC',
    mutedText: '94A3B8',
    cardBg: '1E293B'
  },
  fontHeader: 'Calibri',
  fontBody: 'Calibri'
};

export const VibrantStartupTheme: PPTTheme = {
  name: 'vibrant-startup',
  displayName: 'Vibrant Startup',
  palette: {
    primary: '4338CA',
    secondary: '06B6D4',
    accent: 'F43F5E',
    background: 'FFFFFF',
    text: '111827',
    mutedText: '4B5563',
    cardBg: 'F3F4F6'
  },
  fontHeader: 'Trebuchet MS',
  fontBody: 'Trebuchet MS'
};

const registeredThemes: Record<string, PPTTheme> = {
  [ModernCorporateTheme.name]: ModernCorporateTheme,
  [TechMinimalistTheme.name]: TechMinimalistTheme,
  [DarkCreativeTheme.name]: DarkCreativeTheme,
  [VibrantStartupTheme.name]: VibrantStartupTheme
};

export function getThemeByName(name?: string): PPTTheme {
  if (!name) return ModernCorporateTheme;
  const normalized = name.toLowerCase().trim();
  return registeredThemes[normalized] || ModernCorporateTheme;
}

export function createPPTTheme(customProps: Partial<PPTTheme> & { name: string; displayName: string }): PPTTheme {
  const base = getThemeByName(customProps.name) || ModernCorporateTheme;
  const theme: PPTTheme = {
    name: customProps.name,
    displayName: customProps.displayName,
    palette: {
      ...base.palette,
      ...(customProps.palette || {})
    },
    fontHeader: customProps.fontHeader || base.fontHeader,
    fontBody: customProps.fontBody || base.fontBody
  };
  registeredThemes[theme.name.toLowerCase()] = theme;
  return theme;
}

export function listAvailableThemes(): PPTTheme[] {
  return Object.values(registeredThemes);
}
