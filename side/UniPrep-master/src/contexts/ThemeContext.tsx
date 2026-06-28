// Theme Context — Elmly Design System
// Provides theme switching functionality (light/dark/system)
// Phase 0: Foundation fix - useTheme now returns defaults instead of throwing
// Stage 10.3: Branded palette aligned with design-system/colors.ts

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { Theme } from '../types/settings';
import { settingsService } from '../services/settingsService';
import { useAuthStore } from '../store/authStore';
import { lightShadows, darkShadows } from '../design-system/shadows';

// Theme colors type for better type safety
export type ThemeColors = typeof lightColors;
export type ThemeShadows = typeof lightShadows;

interface ThemeContextType {
  theme: Theme;
  activeTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  colors: ThemeColors;
  shadows: ThemeShadows;
  isDark: boolean;
}

// Light theme colors — Elmly branded palette
const lightColors = {
  // Brand colors
  primary: '#2563EB',         // Blue-600 — main CTA, navigation
  primaryDark: '#1D4ED8',     // Blue-700 — pressed state
  primaryLight: '#DBEAFE',    // Blue-100 — selection backgrounds
  secondary: '#10B981',       // Emerald-500 — success, streaks
  accent: '#8B5CF6',          // Violet-500 — AI features, premium
  
  // Backgrounds
  background: '#FFFFFF',      // Pure white
  surface: '#F8FAFC',         // Slate-50 — cards, elevated surfaces
  surfaceVariant: '#F1F5F9',  // Slate-100 — input backgrounds
  card: '#FFFFFF',            // Card backgrounds
  
  // Text
  text: '#0F172A',            // Slate-900 — primary text
  textSecondary: '#475569',   // Slate-600 — secondary text
  textTertiary: '#94A3B8',    // Slate-400 — hints, captions
  
  // Borders & Dividers
  border: '#E2E8F0',          // Slate-200
  divider: '#F1F5F9',         // Slate-100
  
  // Semantic colors
  error: '#EF4444',           // Red-500
  errorLight: '#FEF2F2',      // Red-50
  success: '#10B981',         // Emerald-500
  successLight: '#ECFDF5',    // Emerald-50
  warning: '#F59E0B',         // Amber-500
  warningLight: '#FFFBEB',    // Amber-50
  info: '#3B82F6',            // Blue-500
  infoLight: '#EFF6FF',       // Blue-50
  
  // Interactive states
  disabled: '#CBD5E1',        // Slate-300
  placeholder: '#94A3B8',     // Slate-400
  
  // Gamification
  streak: '#F59E0B',          // Amber-500
  xp: '#8B5CF6',              // Violet-500
  rank: '#F97316',            // Orange-500
  correct: '#10B981',         // Emerald-500
  incorrect: '#EF4444',       // Red-500
  
  // Overlay & Shadow
  overlay: 'rgba(0, 0, 0, 0.5)',
  shadow: '#000000',
  
  // Tab bar
  tabBar: 'rgba(255, 255, 255, 0.92)',
  tabBarBorder: '#E2E8F0',
};

// Dark theme colors — Elmly branded palette (OLED-optimized)
const darkColors: ThemeColors = {
  // Brand colors (brighter for dark backgrounds)
  primary: '#3B82F6',         // Blue-500
  primaryDark: '#2563EB',     // Blue-600
  primaryLight: '#1E3A5F',    // Custom dark blue — selection backgrounds
  secondary: '#10B981',       // Emerald-500
  accent: '#A78BFA',          // Violet-400
  
  // Backgrounds — deeper navy for OLED screens
  background: '#0B1120',      // Deep navy-black
  surface: '#141B2D',         // Dark navy — cards, elevated surfaces
  surfaceVariant: '#1E293B',  // Slate-800 — input backgrounds
  card: '#141B2D',            // Card backgrounds
  
  // Text
  text: '#F1F5F9',            // Slate-100 — primary text
  textSecondary: '#94A3B8',   // Slate-400 — secondary text
  textTertiary: '#64748B',    // Slate-500 — hints, captions
  
  // Borders & Dividers
  border: '#1E293B',          // Slate-800
  divider: '#141B2D',         // Matches surface
  
  // Semantic colors (brighter for dark backgrounds)
  error: '#F87171',           // Red-400 — brighter for contrast
  errorLight: '#7F1D1D',      // Red-900
  success: '#34D399',         // Emerald-400
  successLight: '#064E3B',    // Emerald-900
  warning: '#FBBF24',         // Amber-400
  warningLight: '#78350F',    // Amber-900
  info: '#60A5FA',            // Blue-400
  infoLight: '#1E3A5F',       // Custom dark blue
  
  // Interactive states
  disabled: '#475569',        // Slate-600
  placeholder: '#64748B',     // Slate-500
  
  // Gamification (brighter for dark mode)
  streak: '#FBBF24',          // Amber-400
  xp: '#A78BFA',              // Violet-400
  rank: '#FB923C',            // Orange-400
  correct: '#34D399',         // Emerald-400
  incorrect: '#F87171',       // Red-400
  
  // Overlay & Shadow
  overlay: 'rgba(0, 0, 0, 0.7)',
  shadow: '#000000',
  
  // Tab bar
  tabBar: 'rgba(11, 17, 32, 0.92)',
  tabBarBorder: '#1E293B',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const { user } = useAuthStore();
  // Default to 'light' theme instead of 'system'
  const [theme, setThemeState] = useState<Theme>('light');
  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>('light');

  // Load theme from settings on mount
  useEffect(() => {
    loadTheme();
  }, [user]);

  // Update active theme when system theme or selected theme changes
  useEffect(() => {
    if (theme === 'system') {
      setActiveTheme(systemColorScheme === 'dark' ? 'dark' : 'light');
    } else {
      setActiveTheme(theme);
    }
  }, [theme, systemColorScheme]);

  const loadTheme = async () => {
    try {
      const settings = await settingsService.getSettings(user?.id);
      setThemeState(settings.theme);
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  };

  const setTheme = (newTheme: Theme) => {
    // Update state immediately (synchronous) for instant UI feedback
    setThemeState(newTheme);
    
    // Save to database in background (fire and forget)
    if (user?.id) {
      settingsService.updateSettings({ theme: newTheme }, user.id)
        .then(() => console.log('✅ Theme saved:', newTheme))
        .catch((error) => console.error('Error saving theme:', error));
    }
  };

  const colors = activeTheme === 'dark' ? darkColors : lightColors;
  const shadows = activeTheme === 'dark' ? darkShadows : lightShadows;
  const isDark = activeTheme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, activeTheme, setTheme, colors, shadows, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Default theme context value - prevents crashes when used outside provider
const defaultThemeContext: ThemeContextType = {
  theme: 'light',
  activeTheme: 'light',
  setTheme: () => {
    console.warn('setTheme called outside ThemeProvider');
  },
  colors: lightColors,
  shadows: lightShadows,
  isDark: false,
};

/**
 * Hook to access theme context
 * CRITICAL: Returns default light theme instead of throwing if used outside provider
 * This prevents "Cannot convert undefined value to object" crashes
 */
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  
  // Return default instead of throwing - prevents crashes
  if (!context) {
    if (__DEV__) {
      console.warn(
        'useTheme: Called outside ThemeProvider, using default light theme. ' +
        'Wrap your app with <ThemeProvider> to enable theme switching.'
      );
    }
    return defaultThemeContext;
  }
  
  return context;
};

/**
 * Utility function to get contrasting text color for any background
 * Ensures text is always readable regardless of background
 */
export const getContrastText = (backgroundColor: string): string => {
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#111827' : '#F8FAFC';
};

/**
 * Utility function to get selection background color
 * Uses low opacity to ensure text remains visible
 */
export const getSelectionBackground = (isDark: boolean): string => {
  return isDark ? '#1E3A5F' : '#DBEAFE';
};

// Export colors for use in styles
export { lightColors, darkColors };
