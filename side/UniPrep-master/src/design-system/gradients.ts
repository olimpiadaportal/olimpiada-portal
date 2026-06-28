// Elmly Design System — Gradient Definitions
// Used with expo-linear-gradient for branded gradient backgrounds

export const gradients = {
  // Primary brand gradient — headers, CTAs, onboarding
  brand: {
    colors: ['#2563EB', '#8B5CF6'] as const,
    start: { x: 0, y: 0 },
    end:   { x: 1, y: 1 },
  },
  // Success gradient — completion, correct answers
  success: {
    colors: ['#10B981', '#06B6D4'] as const,
    start: { x: 0, y: 0 },
    end:   { x: 1, y: 1 },
  },
  // Warm gradient — streaks, urgency, warnings
  warm: {
    colors: ['#F59E0B', '#EF4444'] as const,
    start: { x: 0, y: 0 },
    end:   { x: 1, y: 1 },
  },
  // Cool gradient — AI features, analytics
  cool: {
    colors: ['#3B82F6', '#8B5CF6'] as const,
    start: { x: 0, y: 0 },
    end:   { x: 1, y: 1 },
  },
  // Streak gradient — streak indicators, fire effects
  streak: {
    colors: ['#F59E0B', '#F97316'] as const,
    start: { x: 0, y: 0 },
    end:   { x: 1, y: 1 },
  },
  // Dark overlay gradient — for image overlays, bottom fade
  darkOverlay: {
    colors: ['transparent', 'rgba(0,0,0,0.6)'] as const,
    start: { x: 0, y: 0 },
    end:   { x: 0, y: 1 },
  },
  // Tab bar frosted glass (light mode)
  tabBarLight: {
    colors: ['rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)'] as const,
    start: { x: 0, y: 0 },
    end:   { x: 0, y: 1 },
  },
  // Tab bar frosted glass (dark mode)
  tabBarDark: {
    colors: ['rgba(11,17,32,0.92)', 'rgba(11,17,32,0.98)'] as const,
    start: { x: 0, y: 0 },
    end:   { x: 0, y: 1 },
  },
};
