// Header shortcut to a group's HOME tab, for the screens that are PUSHED OVER
// the bottom tabs.
//
// WHY IT EXISTS. `(parent)/profile` and `(student)/profile` sit on the group
// Stack ABOVE `(tabs)`, so the tab bar is off screen for as long as either is
// open. The three back affordances — the header chevron, Android hardware back,
// the iOS edge swipe — already agree with each other and all return to the tab
// the user came FROM; that is `backBehavior="history"` in the two tab layouts,
// chosen deliberately after testers reported being thrown to Home, and none of
// it is the problem. What was missing is a route TO Home: a parent who opened
// Profile from Subscription could reach Subscription again and nothing else,
// with no tab bar on screen to offer anything better. This is that route, and
// it is purely ADDITIVE — nothing about going back changes, and no affordance
// is redirected, so the three of them still answer identically.
//
// WHY THE HEADER AND NOT THE PAGE. Both profile screens scroll (six sections on
// the student's), so a control placed in the content is on screen only at the
// top of the page — which is not where somebody hunting for a way out has
// ended up. The native header does not scroll.
//
// WHY A GLYPH AND NOT A LABELLED BUTTON. Every other control in this app's
// headers is a bare glyph carrying an accessibility label: the back chevron,
// the notification bell, the account avatar. A text button here would be the
// only one, and it would have to share the bar with a centred title — "Мой
// профиль" is the longest of the six this component serves — which a
// label-width right button truncates on a 320pt screen. The glyph is the
// TARGET TAB'S OWN ICON (TabIcon), so the button looks like the place it goes:
// the house for a parent, the arena bolt for a student.
//
// WHY IT DRAWS NO CONTAINER OF ITS OWN (changed 2026-09-17). This button used
// to paint a 34pt chip — a fill, a hairline and a 10pt radius — under the
// glyph, on the reasoning that the chip is what makes a bare glyph read as a
// control. Since iOS 26 the system draws its own rounded container behind
// every navigation-bar button, so that chip became a chip inside a chip: two
// nested shapes on the RIGHT of the bar against one system shape on the LEFT,
// which is the mismatch in the owner's report — one side a circle, the other a
// rounded square. The glyph is now bare in the shared 34pt box
// (components/iconButtonLayout.ts), which is the right answer whether or not
// the platform draws anything: where it does, both sides get the SAME
// container; where it does not (Android, older iOS), both sides are the same
// bare glyph — and the bell that sits in this very slot on the tab screens has
// always been bare.
//
// WHY goToTab(). A tab route is never pushed and never replaced in this app.
// lib/navigation.ts writes out what pushing one does: expo-router diverges at
// the group Stack, PUSHES a second `(tabs)` route, a SECOND Tabs navigator
// mounts over the first, and that one swallows the next back press. goToTab()
// POPs back to the `(tabs)` route already mounted and hands it the tab to show
// — one tab navigator ever, the profile screen gone rather than buried
// underneath it, and back from Home still leaves the app.
import React from "react";
import { Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import { TabIcon, type TabIconName } from "./TabIcon";
import {
  HEADER_BUTTON_HIT_SLOP,
  HEADER_GLYPH_SIZE,
  headerButtonBox,
} from "./iconButtonLayout";
import { goToTab } from "@/lib/navigation";

export function HeaderHomeButton({
  href,
  icon,
  label,
  color,
}: {
  /** The home tab of the group this screen belongs to. */
  href: Href;
  /** Icon of the tab being linked, so the button matches the tab bar. */
  icon: TabIconName;
  /** Accessibility label ("Ana səhifə"/"Home"/"Главная") — announced, not drawn. */
  label: string;
  /** Glyph colour: the group's header tint (theme accent / arena lime). */
  color: string;
  /**
   * ACCEPTED AND IGNORED since the chip was dropped (see the note above). The
   * eight screens that mount this button still pass them, so they stay in the
   * type — optional — and those screens keep compiling until each drops the
   * two lines the next time it is edited. Nothing reads them.
   */
  background?: string;
  borderColor?: string;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => goToTab(router, href)}
      // 34pt box + 8pt slop = 50pt of touch, past both the iOS 44pt and the
      // Material 48dp minimum, without making the header row any taller.
      hitSlop={HEADER_BUTTON_HIT_SLOP}
      style={({ pressed }) => [
        headerButtonBox,
        { marginRight: 12, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <TabIcon name={icon} color={color} size={HEADER_GLYPH_SIZE} />
    </Pressable>
  );
}
