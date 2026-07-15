// Entry: route by session role (RootGate guarantees restore has finished).
// Unknown role (network hiccup / role-less account) gets a retry + logout
// escape instead of a dead spinner. Signed-out users see the onboarding only
// on first launch (olympiq.seenWelcome — plan §3); afterwards they land on
// Login directly, including after every logout.
import React, { useState } from "react";
import { Redirect } from "expo-router";
import { useAuthStore } from "@/features/auth/authStore";
import { useSeenWelcome } from "@/features/boot/seenWelcome";
import { UnknownRoleScreen } from "@/features/boot/screens";

export default function Index() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const resolveRole = useAuthStore((s) => s.resolveRole);
  const signOut = useAuthStore((s) => s.signOut);
  const seenWelcome = useSeenWelcome((s) => s.seen);
  const [, setNonce] = useState(0);

  if (status !== "signedIn") {
    return <Redirect href={seenWelcome ? "/(public)/login" : "/(public)/welcome"} />;
  }
  if (role === "parent") return <Redirect href="/(parent)/(tabs)/home" />;
  if (role === "student") return <Redirect href="/(student)/(tabs)/home" />;

  return (
    <UnknownRoleScreen
      onRetry={() => {
        void resolveRole().then(() => setNonce((n) => n + 1));
      }}
      onSignOut={() => void signOut()}
    />
  );
}
