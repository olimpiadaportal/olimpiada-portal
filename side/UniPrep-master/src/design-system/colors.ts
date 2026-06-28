// Elmly Design System — Color Tokens
// Single source of truth for all colors across the app
// Both light and dark palettes are defined here and consumed by ThemeContext

export const brandColors = {
  blue: {
    50:  '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A5F',
  },
  emerald: {
    50:  '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
  },
  violet: {
    50:  '#F5F3FF',
    100: '#EDE9FE',
    200: '#DDD6FE',
    300: '#C4B5FD',
    400: '#A78BFA',
    500: '#8B5CF6',
    600: '#7C3AED',
    700: '#6D28D9',
    800: '#5B21B6',
    900: '#4C1D95',
  },
  amber: {
    50:  '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  red: {
    50:  '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },
  orange: {
    400: '#FB923C',
    500: '#F97316',
  },
  slate: {
    50:  '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
};

// Gamification color tokens
export const gamificationColors = {
  light: {
    streak:    brandColors.amber[500],
    xp:        brandColors.violet[500],
    rank:      brandColors.orange[500],
    correct:   brandColors.emerald[500],
    incorrect: brandColors.red[500],
  },
  dark: {
    streak:    brandColors.amber[400],
    xp:        brandColors.violet[400],
    rank:      brandColors.orange[400],
    correct:   brandColors.emerald[400],
    incorrect: brandColors.red[400],
  },
};

// Gradient definitions
export const gradients = {
  brand:   ['#2563EB', '#8B5CF6'] as const,
  success: ['#10B981', '#06B6D4'] as const,
  warm:    ['#F59E0B', '#EF4444'] as const,
  cool:    ['#3B82F6', '#8B5CF6'] as const,
  streak:  ['#F59E0B', '#F97316'] as const,
};
