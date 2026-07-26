// The OS "reduce motion" preference as a hook (iOS: Settings → Accessibility →
// Motion → Reduce Motion; Android: Settings → Accessibility → Remove
// animations). Reads the current value on mount AND stays subscribed, so a user
// flipping the switch while the app is open takes effect on the next
// interaction rather than after a restart.
//
// Animated controls SNAP to their end state when this is true. Reanimated's own
// `ReduceMotion.System` default backs this up on the UI thread, but the hook is
// what lets a component decide between "animate" and "place instantly" in JS.
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {
        // The platform could not answer (older Android surfaces reject here);
        // motion stays enabled, which is the safe default for a visual hint.
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReduceMotion(enabled),
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
