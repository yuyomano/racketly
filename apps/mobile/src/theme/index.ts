export const colors = {
  primary50:  '#ecfdf5',
  primary100: '#d1fae5',
  primary200: '#a7f3d0',
  primary300: '#6ee7b7',
  primary400: '#34d399',
  primary500: '#10b981',
  primary600: '#059669',
  primary700: '#047857',
  primary800: '#065f46',
  primary900: '#064e3b',
  primaryDark: '#042b22',

  amber50:  '#fffbeb',
  amber100: '#fef3c7',
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  amber600: '#d97706',
  amber700: '#b45309',

  red50:  '#fef2f2',
  red100: '#fee2e2',
  red500: '#ef4444',
  red600: '#dc2626',

  blue50: '#eff6ff',
  blue600: '#2563eb',

  violet50: '#f5f3ff',
  violet600: '#7c3aed',
  violet700: '#6d28d9',

  white: '#ffffff',
  gray50:  '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',

  // Semánticos
  bg:           '#f9fafb',
  surface:      '#ffffff',
  textPrimary:  '#111827',
  textSecondary:'#6b7280',
  textMuted:    '#9ca3af',
  border:       '#e5e7eb',
}

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32, '4xl': 40,
}

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, full: 999,
}

export const fontSize = {
  xs: 11, sm: 13, base: 15, lg: 17, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36,
}

export const shadow = {
  sm: {
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  md: {
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  lg: {
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 24, elevation: 8,
  },
}

export type SportTone = 'padel' | 'pickleball'

export const sportColors: Record<SportTone, { bg: string; text: string; icon: string }> = {
  padel:      { bg: colors.primary100, text: colors.primary700, icon: '🎾' },
  pickleball: { bg: colors.amber100,   text: colors.amber700,   icon: '🏸' },
}
