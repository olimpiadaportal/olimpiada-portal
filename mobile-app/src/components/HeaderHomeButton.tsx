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
// label-width right button truncates on a 320pt screen. The chip background is
// what makes it read as a control rather than as decoration, and the glyph is
// the TARGET TAB'S OWN ICON (TabIcon), so the button looks like the place it
// goes: the house for a parent, the arena bolt for a student.
//
// WHY goToTab(). A tab route is never pushed and never replaced in this app.
// lib/navigation.ts writes out what pushing one does: expo-router diverges at
// the group Stack, PUSHES a second `(tabs)` route, a SECOND Tabs navigator
// mounts over the first, and that one swallows the next back press. goToTab()
// POPs back to the `(tabs)` route already mounted and hands it the tab to show
// — one tab navigator ever, the profile screen gone rather than buried
// underneath it, and back from Home still leaves the app.
import React from "react";
import { Pressable, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { TabIcon, type TabIconName } from "./TabIcon";
import { radius } from "@/theme/tokens";
import { goToTab } from "@/lib/navigation";

export function HeaderHomeButton({
  href,
  icon,
  label,
  color,
  background,
  borderColor,
}: {
  /** The home tab of the group this screen belongs to. */
  href: Href;
  /** Icon of the tab being linked, so the button matches the tab bar. */
  icon: TabIconName;
  /** Accessibility label ("Ana səhifə"/"Home"/"Главная") — announced, not drawn. */
  label: string;
  /** Glyph colour: the group's header tint (theme accent / arena lime). */
  color: string;
  /** Chip fill under the glyph. */
  background: string;
  /** Chip hairline. */
  borderColor: string;
}) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => goToTab(router, href)}
      // 34pt chip + 8pt slop clears both the iOS 44pt and the Material 48dp
      // minimum without making the header row any taller.
      hitSlop={8}
      style={({ pressed }) => ({ marginRight: 12, opacity: pressed ? 0.7 : 1 })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.sm,
          backgroundColor: background,
          borderWidth: 1,
          borderColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TabIcon name={icon} color={color} size={20} />
      </View>
    </Pressable>
  );
}
