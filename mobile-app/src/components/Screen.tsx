import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { scrollPaddingBottom } from "./keyboardLayout";
import {
  KeyboardFocusProvider,
  useKeyboardAwareScroll,
  useKeyboardViewInset,
} from "@/lib/useKeyboardAware";

type ScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  background?: string;
  /** Pull-to-refresh (scroll screens only — a non-scroll Screen hosts its own
   *  list, which carries its own RefreshControl). */
  refreshing?: boolean;
  onRefresh?: () => void;
};

/**
 * Base screen container: themed background, safe-area padding, optional
 * scrolling with keyboard avoidance (every FORM screen uses scroll=true).
 *
 * Keyboard behaviour lives in `@/lib/useKeyboardAware` and is shared with the
 * other two scroll bodies (`ScreenScroll`, `ArenaScroll`). Notably there is no
 * KeyboardAvoidingView and no `keyboardVerticalOffset` here any more: the
 * container measures its own overlap with the keyboard in window coordinates,
 * which is correct under a navigator header, under a tab bar, on iOS, and in
 * both Android soft-input modes without a per-screen constant. See the header
 * comment in components/keyboardLayout.ts.
 */
export function Screen(props: ScreenProps) {
  // Split so only the branch in use mounts keyboard listeners.
  return props.scroll ? <ScrollScreen {...props} /> : <StaticScreen {...props} />;
}

function StaticScreen({ children, padded = true, background }: ScreenProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { keyboardInset, viewProps } = useKeyboardViewInset();
  const bg = background ?? tokens.bg;
  const pad = padded ? spacing.lg : 0;

  return (
    <View
      {...viewProps}
      style={{
        flex: 1,
        backgroundColor: bg,
        paddingTop: insets.top,
        // The keyboard inset is 0 unless a keyboard is actually covering this
        // view, so a closed keyboard leaves the original layout untouched.
        paddingBottom: scrollPaddingBottom(insets.bottom, keyboardInset),
        paddingLeft: pad + insets.left,
        paddingRight: pad + insets.right,
      }}
    >
      {children}
    </View>
  );
}

function ScrollScreen({
  children,
  padded = true,
  background,
  refreshing = false,
  onRefresh,
}: ScreenProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { keyboardInset, scrollProps, focusApi } = useKeyboardAwareScroll();
  const bg = background ?? tokens.bg;
  const pad = padded ? spacing.lg : 0;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <KeyboardFocusProvider value={focusApi}>
        <ScrollView
          {...scrollProps}
          contentContainerStyle={{
            paddingTop: insets.top + pad,
            // Grow the CONTENT by the keyboard overlap rather than shrinking the
            // container: the scroll range stays long enough to bring the last
            // field's action button above the keyboard. Back to exactly
            // `insets.bottom + pad` the moment the keyboard closes.
            paddingBottom: scrollPaddingBottom(insets.bottom + pad, keyboardInset),
            paddingLeft: pad + insets.left,
            paddingRight: pad + insets.right,
          }}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={tokens.accent}
                colors={[tokens.accent]}
                // The content is padded by the top inset, so the Android spinner
                // has to start below it too.
                progressViewOffset={insets.top}
                accessibilityLabel={t("mob.refreshing")}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </KeyboardFocusProvider>
    </View>
  );
}
