import React from "react";
import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/features/auth/authStore";

export default function PublicLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);

  // Signed-in users never see the public stack (web parity).
  if (status === "signedIn" && role === "parent") return <Redirect href="/(parent)/home" />;
  if (status === "signedIn" && role === "student") return <Redirect href="/(student)/arena" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
