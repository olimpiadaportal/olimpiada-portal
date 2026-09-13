import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";

/**
 * Reassert the product's portrait-up contract for the lifetime of the app.
 *
 * app.json supplies the native launch declaration. This runtime layer handles
 * returning from system UI and native modules that may have changed the
 * requested orientation while the process stayed alive. The Android 16 tablet
 * compatibility property is written separately by the local config plugin.
 */
export function usePortraitOrientation(): void {
  useEffect(() => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;

    const lock = () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
        () => undefined,
      );
    };

    lock();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") lock();
    });
    return () => subscription.remove();
  }, []);
}
