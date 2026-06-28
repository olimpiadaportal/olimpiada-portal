// Elmly Theme — Backward-compatible color bridge
// Stage 10.3: Values updated to match new branded palette
// For new code, prefer: import { useTheme } from '../contexts/ThemeContext'
// This file is kept for the 118+ files that import { colors, spacing, ... } from here
export const colors = {
  // Brand Colors (aligned with ThemeContext lightColors)
  primary: '#2563EB',      // Blue-600
  secondary: '#10B981',    // Emerald-500
  accent: '#8B5CF6',       // Violet-500
  
  // UI Colors
  background: '#FFFFFF',
  surface: '#F8FAFC',      // Slate-50
  card: '#FFFFFF',
  
  // Text Colors
  text: '#0F172A',         // Slate-900
  textSecondary: '#475569', // Slate-600
  textLight: '#94A3B8',    // Slate-400
  
  // Status Colors
  success: '#10B981',      // Emerald-500
  error: '#EF4444',        // Red-500
  warning: '#F59E0B',      // Amber-500
  info: '#3B82F6',         // Blue-500
  
  // Neutral Colors
  white: '#FFFFFF',
  black: '#000000',
  gray: {
    50: '#F8FAFC',
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
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const typography = {
  fontSizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  fontWeights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
};

export const theme = {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
};

export type Theme = typeof theme;
