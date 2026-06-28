// Elmly Design System — Shadows
// Platform-aware shadow presets for light and dark modes
// Dark mode uses subtle glow instead of dark shadows

import { Platform, ViewStyle } from 'react-native';

type ShadowStyle = Pick<ViewStyle, 'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'>;

const createShadow = (
  offsetY: number,
  opacity: number,
  radius: number,
  elevation: number,
  color: string = '#000000',
): ShadowStyle => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: offsetY },
  shadowOpacity: Platform.OS === 'ios' ? opacity : 0,
  shadowRadius: radius,
  elevation,
});

export const lightShadows = {
  none: createShadow(0, 0, 0, 0),
  sm:   createShadow(1, 0.05, 2, 1),
  md:   createShadow(2, 0.08, 6, 3),
  lg:   createShadow(4, 0.12, 10, 5),
  xl:   createShadow(8, 0.15, 16, 8),
  // Tab bar specific — soft upward shadow
  tabBar: createShadow(-4, 0.06, 12, 8),
  // Card hover/press feedback
  cardPressed: createShadow(1, 0.03, 2, 1),
  cardRaised:  createShadow(6, 0.12, 14, 6),
};

export const darkShadows = {
  none: createShadow(0, 0, 0, 0),
  sm:   createShadow(1, 0.2, 3, 1, '#000000'),
  md:   createShadow(2, 0.25, 8, 3, '#000000'),
  lg:   createShadow(4, 0.3, 12, 5, '#000000'),
  xl:   createShadow(8, 0.35, 20, 8, '#000000'),
  // Tab bar — subtle glow on dark
  tabBar: createShadow(-2, 0.4, 8, 8, '#000000'),
  cardPressed: createShadow(1, 0.15, 2, 1, '#000000'),
  cardRaised:  createShadow(4, 0.3, 12, 6, '#000000'),
};

export type ShadowPreset = keyof typeof lightShadows;
