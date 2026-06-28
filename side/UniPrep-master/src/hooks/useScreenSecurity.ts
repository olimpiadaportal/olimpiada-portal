/**
 * useScreenSecurity hook
 *
 * Prevents screenshots and screen recording on screens with sensitive content
 * (exam taking, practice sessions). Uses expo-screen-capture when available,
 * falls back to a no-op on unsupported platforms.
 *
 * Usage:
 *   useScreenSecurity(true)  // Enable protection when component mounts
 *   useScreenSecurity(false) // Disable (default)
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';

let ScreenCapture: typeof import('expo-screen-capture') | null = null;

// Lazy import — won't crash if the package isn't installed yet
try {
  ScreenCapture = require('expo-screen-capture');
} catch {
  // expo-screen-capture not installed — protection disabled
}

export const useScreenSecurity = (enabled: boolean = true) => {
  useEffect(() => {
    if (!enabled || !ScreenCapture) return;

    // Prevent screenshots while this screen is mounted
    ScreenCapture.preventScreenCaptureAsync('secure-screen');

    return () => {
      // Re-allow screenshots when leaving this screen
      ScreenCapture.allowScreenCaptureAsync('secure-screen');
    };
  }, [enabled]);
};
