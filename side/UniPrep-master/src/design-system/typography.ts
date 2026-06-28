// Elmly Design System — Typography
// Centralized font sizes, weights, and line heights

export const fontSizes = {
  caption:  12,   // Helper text, timestamps, badges
  body2:    13,   // Dense lists, small labels
  body:     15,   // Default body text
  subtitle: 16,   // Card titles, section labels
  title:    20,   // Screen titles
  headline: 24,   // Hero numbers, key stats
  display:  32,   // Large feature numbers (streaks, scores)
};

export const fontWeights = {
  regular:  '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
};

export const lineHeights = {
  tight:    1.25,  // Headlines, display numbers
  normal:   1.5,   // Body text, descriptions
  relaxed:  1.75,  // Long-form reading content
};

export const typography = {
  fontSizes,
  fontWeights,
  lineHeights,
};
