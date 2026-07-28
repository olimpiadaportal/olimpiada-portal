// The app-wide keyboard contract. Three pieces, all built on stock React Native
// primitives (Keyboard, measureInWindow, ScrollView.scrollTo, LayoutAnimation) —
// nothing here needs a native module, so it runs in Expo Go.
//
//   useKeyboardAwareScroll()  — for a scroll container (Screen scroll,
//                               ScreenScroll, ArenaScroll). Gives the scroll
//                               props, the live keyboard inset to add to the
//                               content's bottom padding, and the focus API.
//   useKeyboardViewInset()    — for a NON-scrolling container: the same measured
//                               overlap as plain bottom padding, so a list or a
//                               footer resizes above the keyboard.
//   useFieldKeyboardFocus()   — consumed by the input primitives. Reports focus
//                               up to whichever container is above them, so no
//                               screen has to wire anything per field.
//
// The geometry itself lives in components/keyboardLayout.ts (pure + tested).
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type View,
} from "react-native";
import {
  FOCUS_EXTRA_OFFSET,
  focusScrollDelta,
  keyboardOverlap,
  keyboardTopFromFrame,
  nextScrollOffset,
  type Rect,
} from "@/components/keyboardLayout";
import { useReduceMotion } from "./useReduceMotion";

/** Anything RN can measure in window coordinates (View, TextInput, native scroll ref). */
export type Measurable = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

const EMPTY_RECT: Rect = { top: 0, height: 0 };

// ---------------------------------------------------------------------------
// Keyboard frame
// ---------------------------------------------------------------------------

/**
 * Window Y of the keyboard's top edge, or `null` while it is closed.
 *
 * iOS listens to the `will*` events so the inset is ready before the keyboard
 * has finished sliding in; Android only reports usable metrics on `did*`.
 *
 * Deliberately no `LayoutAnimation`: the only thing this drives is the scroll
 * content's BOTTOM padding, which grows below the fold where nobody can see it,
 * while the motion the user does see (the scroll to the focused field) is
 * animated on its own. `LayoutAnimation.configureNext` is global — it would
 * animate every unrelated layout change committed in the same tick, e.g. a
 * validation message appearing.
 */
export function useKeyboardTop(): number | null {
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);

  useEffect(() => {
    const ios = Platform.OS === "ios";

    const onFrame = (event: KeyboardEvent) => {
      setKeyboardTop(
        keyboardTopFromFrame({
          screenY: event.endCoordinates?.screenY,
          height: event.endCoordinates?.height,
          windowHeight: Dimensions.get("window").height,
        }),
      );
    };

    const onHide = () => setKeyboardTop(null);

    const subs = [
      Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", onFrame),
      Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", onHide),
    ];
    // Split keyboards, the autocorrect bar appearing, a language switch: the
    // frame moves without a show/hide pair. `keyboardTopFromFrame` reads a
    // parked-at-the-bottom frame as closed, so this stays self-consistent.
    if (ios) subs.push(Keyboard.addListener("keyboardWillChangeFrame", onFrame));

    return () => subs.forEach((s) => s.remove());
  }, []);

  return keyboardTop;
}

// ---------------------------------------------------------------------------
// Measured overlap (shared by both containers)
// ---------------------------------------------------------------------------

type OverlapState = {
  /** Live keyboard overlap in points; 0 whenever the keyboard is closed. */
  inset: number;
  /** Latest keyboard top, for callbacks that must not close over stale state. */
  keyboardTopRef: React.RefObject<number | null>;
  containerRect: React.RefObject<Rect>;
  /** Re-measure the container and recompute the inset. */
  resync: () => void;
  keyboardTop: number | null;
};

function useMeasuredOverlap(getNode: () => Measurable | null): OverlapState {
  const keyboardTop = useKeyboardTop();
  const keyboardTopRef = useRef<number | null>(null);
  const containerRect = useRef<Rect>(EMPTY_RECT);
  const [inset, setInset] = useState(0);

  const resync = useCallback(() => {
    const apply = (rect: Rect) => {
      const next = keyboardOverlap({ container: rect, keyboardTop: keyboardTopRef.current });
      // Sub-point churn would re-render the whole screen on every scroll frame.
      setInset((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    };
    const node = getNode();
    if (!node) {
      apply(containerRect.current);
      return;
    }
    node.measureInWindow((_x, y, _w, height) => {
      if (Number.isFinite(y) && Number.isFinite(height) && height > 0) {
        containerRect.current = { top: y, height };
      }
      apply(containerRect.current);
    });
  }, [getNode]);

  useEffect(() => {
    keyboardTopRef.current = keyboardTop;
    resync();
  }, [keyboardTop, resync]);

  return { inset, keyboardTop, keyboardTopRef, containerRect, resync };
}

// ---------------------------------------------------------------------------
// Field -> container focus channel
// ---------------------------------------------------------------------------

export type KeyboardFocusApi = {
  onFieldFocus: (node: Measurable | null) => void;
  onFieldBlur: (node: Measurable | null) => void;
};

const KeyboardFocusContext = createContext<KeyboardFocusApi | null>(null);

export function KeyboardFocusProvider({
  value,
  children,
}: {
  value: KeyboardFocusApi | null;
  children: React.ReactNode;
}) {
  return <KeyboardFocusContext.Provider value={value}>{children}</KeyboardFocusContext.Provider>;
}

/**
 * Cuts the field -> container focus channel.
 *
 * REQUIRED around any `<Modal>` that hosts a text input. React Native's Modal
 * is an ordinary React child — it does NOT break the React tree — so context
 * reaches straight through it and an input inside the modal would otherwise
 * register with the SCREEN's scroll container behind it. That container would
 * then measure a rect taken in the MODAL's window, compare it against its own
 * window rect, and scroll the page underneath the sheet (and grow its bottom
 * padding) while the user types in the sheet. `onFieldBlur` would never arrive
 * either, because the input unmounts with the modal.
 *
 * A modal is its own window and avoids the keyboard with its own
 * `KeyboardAvoidingView`, so it needs nothing from the screen.
 */
export function KeyboardFocusBoundary({ children }: { children: React.ReactNode }) {
  return <KeyboardFocusContext.Provider value={null}>{children}</KeyboardFocusContext.Provider>;
}

/**
 * Used by TextField / PasswordField / ChildIdField. `null` when there is no
 * keyboard-aware container above the field — either because the screen has none
 * or because a `KeyboardFocusBoundary` cut the channel (see above). Every call
 * site therefore stays optional, and a field with no container behaves exactly
 * as it did before.
 */
export function useFieldKeyboardFocus(): KeyboardFocusApi | null {
  return useContext(KeyboardFocusContext);
}

// ---------------------------------------------------------------------------
// Scroll container
// ---------------------------------------------------------------------------

export type KeyboardScrollProps = {
  ref: (instance: ScrollView | null) => void;
  onLayout: () => void;
  /**
   * Re-reveals the focused field when the FORM GROWS under it while the
   * keyboard is up. That is not a corner case: tapping the submit button with
   * `keyboardShouldPersistTaps="handled"` deliberately keeps the keyboard up and
   * the input focused, and the validation message that appears is inserted
   * BETWEEN the last field and the action button — pushing the button down,
   * under the keyboard, with the keyboard frame and the container rect both
   * unchanged, so nothing else in this hook would fire.
   */
  onContentSizeChange: (width: number, height: number) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
  /**
   * "handled" is the value the owner's brief needs on both counts: a tap on an
   * inert area (card padding, screen gutter) dismisses the keyboard, while a tap
   * on a Pressable — the submit Button, the password eye toggle, a select
   * trigger — activates it in ONE tap instead of being swallowed.
   *
   * Deliberately NOT paired with `keyboardDismissMode="on-drag"`: that closes the
   * keyboard the instant the user drags, which contradicts "the form stays
   * scrollable while the keyboard is open".
   */
  keyboardShouldPersistTaps: "handled";
};

export type KeyboardAwareScroll = {
  /** Add to the content container's bottom padding. Exactly 0 when closed. */
  keyboardInset: number;
  scrollProps: KeyboardScrollProps;
  focusApi: KeyboardFocusApi;
};

/**
 * Keyboard behaviour for a ScrollView-based screen body.
 *
 * @param options.extraBelow points kept clear below a focused field, on top of
 *   the field itself — defaults to one validation line plus the main action
 *   button (see keyboardLayout.FOCUS_EXTRA_OFFSET).
 */
export function useKeyboardAwareScroll(options?: { extraBelow?: number }): KeyboardAwareScroll {
  const extraBelow = options?.extraBelow ?? FOCUS_EXTRA_OFFSET;
  const reduceMotion = useReduceMotion();

  const scrollRef = useRef<ScrollView | null>(null);
  const offsetY = useRef(0);
  const contentHeight = useRef(0);
  const focusedNode = useRef<Measurable | null>(null);

  const getNode = useCallback<() => Measurable | null>(
    () => scrollRef.current?.getNativeScrollRef() ?? null,
    [],
  );
  const { inset, keyboardTop, keyboardTopRef, containerRect, resync } = useMeasuredOverlap(getNode);

  const scrollToNode = useCallback(
    (node: Measurable | null) => {
      if (!node || !scrollRef.current) return;
      node.measureInWindow((_x, y, _w, height) => {
        const delta = focusScrollDelta({
          field: { top: y, height },
          container: containerRect.current,
          keyboardTop: keyboardTopRef.current,
          extraBelow,
        });
        if (Math.abs(delta) < 1) return;
        scrollRef.current?.scrollTo({
          y: nextScrollOffset(offsetY.current, delta),
          animated: !reduceMotion,
        });
      });
    },
    [containerRect, extraBelow, keyboardTopRef, reduceMotion],
  );

  // The keyboard usually arrives AFTER onFocus, and the bottom padding that
  // creates the scroll range lands a commit later still. Re-run the scroll once
  // both are in — one frame after the inset is applied.
  useEffect(() => {
    if (keyboardTop == null || !focusedNode.current) return;
    const frame = requestAnimationFrame(() => scrollToNode(focusedNode.current));
    return () => cancelAnimationFrame(frame);
  }, [keyboardTop, inset, scrollToNode]);

  const focusApi = useMemo<KeyboardFocusApi>(
    () => ({
      onFieldFocus: (node) => {
        focusedNode.current = node;
        scrollToNode(node);
      },
      onFieldBlur: (node) => {
        if (focusedNode.current === node) focusedNode.current = null;
      },
    }),
    [scrollToNode],
  );

  const scrollProps = useMemo<KeyboardScrollProps>(
    () => ({
      ref: (instance: ScrollView | null) => {
        scrollRef.current = instance;
      },
      // Fires on mount, on rotation, and on the Android window resize that
      // `adjustResize` performs — the three moments the measured rect changes.
      onLayout: resync,
      onContentSizeChange: (_width, height) => {
        // GROWTH only: a shrink (the message clearing, a section collapsing)
        // never pushes the action button under the keyboard, and reacting to
        // every keystroke-sized relayout would fight the user's own scrolling.
        const grew = height > contentHeight.current + 1;
        contentHeight.current = height;
        if (!grew || keyboardTopRef.current == null || !focusedNode.current) return;
        // One frame later, so the new layout is committed before we measure it.
        // `focusScrollDelta` returns 0 when the field is still comfortably
        // placed, so a growth that changed nothing relevant costs one no-op.
        requestAnimationFrame(() => scrollToNode(focusedNode.current));
      },
      onScroll: (event) => {
        // Ref write only — no state, no re-render. This is the live offset
        // `scrollToNode` turns its relative delta into an absolute target with.
        offsetY.current = event.nativeEvent.contentOffset.y;
      },
      scrollEventThrottle: 16,
      keyboardShouldPersistTaps: "handled",
    }),
    [keyboardTopRef, resync, scrollToNode],
  );

  return { keyboardInset: inset, scrollProps, focusApi };
}

// ---------------------------------------------------------------------------
// Non-scrolling container
// ---------------------------------------------------------------------------

export type KeyboardViewInset = {
  /** Add to the container's bottom padding. Exactly 0 when the keyboard is closed. */
  keyboardInset: number;
  viewProps: {
    ref: (instance: View | null) => void;
    onLayout: () => void;
  };
};

/**
 * Same measured overlap for a container that does NOT scroll, applied as plain
 * bottom padding so its content (a list, a footer, a fixed action row) resizes
 * above the keyboard instead of hiding under it.
 *
 * This makes a non-scrolling screen SAFE, not ideal: a static form squeezed into
 * the remaining height can still run out of room. Forms belong in a scrolling
 * container.
 */
export function useKeyboardViewInset(): KeyboardViewInset {
  const viewRef = useRef<View | null>(null);
  const getNode = useCallback<() => Measurable | null>(() => viewRef.current, []);
  const { inset, resync } = useMeasuredOverlap(getNode);

  const viewProps = useMemo(
    () => ({
      ref: (instance: View | null) => {
        viewRef.current = instance;
      },
      onLayout: resync,
    }),
    [resync],
  );

  return { keyboardInset: inset, viewProps };
}
