// `<Redirect>` for targets that must not be DUPLICATED.
//
// expo-router's own `<Redirect>` is `router.replace()` in a focus effect, and
// replace() is exactly the call that must never carry a tab route: from a
// screen stacked above the tabs it REPLACES that screen with a second copy of
// the tab navigator, leaving the original underneath, and the next back press
// is swallowed by the copy and lands on Home. The full mechanism is in
// lib/navigation.ts; these components are the redirect-shaped door into the
// same hole, so they get the same fix.
//
// Reachability is why they exist rather than being waved off as guards nobody
// hits: the child-edit screen redirects here the moment its child disappears
// from the list, which is what a successful DELETE does — a re-render between
// the delete's own navigation and the unmount would otherwise re-introduce the
// duplicate on the one path a parent actually walks. `GroupRedirect` guards the
// same defect one level up, on the root stack (see below).
//
// Everything else matches `<Redirect>`: renders nothing, runs on focus, and
// SWALLOWS a throw from the navigation call after logging it. That last part is
// not decoration — expo-router's Redirect wraps its `router.replace` in
// try/catch for a reason: `linkTo` throws outright when the navigator is not
// ready ("Attempted to link to route when no routes are present") or when a
// route resolves to nothing. Uncaught inside a focus effect that runs during a
// render pass, it takes the screen down with a red box instead of leaving the
// user on the page they were already looking at.
import React from "react";
import { useFocusEffect, useRouter, type Href, type Router } from "expo-router";
import { goToTab, popToOrReplace } from "@/lib/navigation";

function useRedirect(href: Href, go: (router: Router, href: Href) => void): void {
  const router = useRouter();
  useFocusEffect(() => {
    try {
      go(router, href);
    } catch (error) {
      console.error(error);
    }
  });
}

/** Redirect to a BOTTOM-TAB screen without mounting a second tab navigator. */
export function TabRedirect({ href }: { href: Href }): React.ReactElement | null {
  useRedirect(href, goToTab);
  return null;
}

/**
 * Redirect ACROSS ROOT GROUPS — `(public)` bouncing a signed-in user back to
 * their own surface — without minting a second copy of that group.
 *
 * A plain `<Redirect>` here is a replace on the ROOT stack, and a replace mints
 * a new route key: the `(parent)` the user was already in stays below and a
 * second `(parent)` lands on top. popToOrReplace() pops back to the one that is
 * already there, and still collapses the whole `(public)` group when there is
 * none — which is what makes it safe on the LOGIN path, where the reset is
 * deliberate and non-negotiable.
 */
export function GroupRedirect({ href }: { href: Href }): React.ReactElement | null {
  useRedirect(href, popToOrReplace);
  return null;
}
