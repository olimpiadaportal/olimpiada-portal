import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useContentGutter } from "@/lib/useContentWidth";
import { ActionArea, ActionAreaShell } from "./ActionArea";
import { scrollBodyBottomInset } from "./actionAreaLayout";
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
  /**
   * The screen's primary action(s). Given here rather than at the end of the
   * children, they are laid out in the shared ActionArea BELOW the body: a
   * non-scrolling, safe-area-padded row the body can never push off the bottom
   * edge of a short phone. See components/actionAreaLayout.ts for the bug this
   * answers and why the reservation is structural rather than a padding.
   */
  actions?: React.ReactNode;
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

function StaticScreen({ children, padded = true, background, actions }: ScreenProps) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { keyboardInset, viewProps } = useKeyboardViewInset();
  // 0 on every phone; on a tablet it centres the content column instead of
  // letting a layout drawn for 390pt stretch across 1024. See useContentWidth.
  const gutter = useContentGutter();
  const bg = background ?? tokens.bg;
  const pad = padded ? spacing.lg : 0;
  const hasActions = Boolean(actions);

  const bodyPadding = {
    paddingTop: insets.top,
    // The keyboard inset is 0 unless a keyboard is actually covering this
    // view, so a closed keyboard leaves the original layout untouched. With an
    // action area below, the bottom inset belongs to the BAR — adding it here
    // too would float the body a navigation bar's height above it.
    paddingBottom: scrollPaddingBottom(
      scrollBodyBottomInset(insets.bottom, hasActions),
      hasActions ? 0 : keyboardInset,
    ),
    paddingLeft: pad + insets.left + gutter,
    paddingRight: pad + insets.right + gutter,
  } as const;

  // This View is `flex: 1`, so its measured frame does not move when the bar
  // below grows for the keyboard — which is what keeps that measurement from
  // feeding back on itself. Same node in both branches, so a screen without
  // actions renders exactly the tree it always did.
  return (
    <View {...viewProps} style={{ flex: 1, backgroundColor: bg }}>
      <View style={[{ flex: 1 }, bodyPadding]}>{children}</View>
      {hasActions ? (
        <ActionArea
          background={bg}
          borderColor={tokens.border}
          keyboardInset={keyboardInset}
        >
          {actions}
        </ActionArea>
      ) : null}
    </View>
  );
}

function ScrollScreen({
  children,
  padded = true,
  background,
  refreshing = false,
  onRefresh,
  actions,
}: ScreenProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { keyboardInset, scrollProps, focusApi } = useKeyboardAwareScroll();
  // 0 on every phone; centres the content column on a tablet.
  const gutter = useContentGutter();
  const bg = background ?? tokens.bg;
  const pad = padded ? spacing.lg : 0;
  const hasActions = Boolean(actions);

  const body = (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        {...scrollProps}
        contentContainerStyle={{
          paddingTop: insets.top + pad,
          // Grow the CONTENT by the keyboard overlap rather than shrinking the
          // container: the scroll range stays long enough to bring the last
          // field's action button above the keyboard. Back to exactly
          // `insets.bottom + pad` the moment the keyboard closes.
          paddingBottom: scrollPaddingBottom(
            scrollBodyBottomInset(insets.bottom, hasActions) + pad,
            keyboardInset,
          ),
          paddingLeft: pad + insets.left + gutter,
          paddingRight: pad + insets.right + gutter,
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
    </View>
  );

  return (
    <KeyboardFocusProvider value={focusApi}>
      {hasActions ? (
        <ActionAreaShell background={bg} borderColor={tokens.border} actions={actions}>
          {body}
        </ActionAreaShell>
      ) : (
        body
      )}
    </KeyboardFocusProvider>
  );
}
