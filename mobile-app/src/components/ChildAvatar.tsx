// Shared child-avatar renderer (web ChildAvatar parity, mobile shape):
//   photo  → short-lived SIGNED URL created with the VIEWER'S OWN session
//            client (private `child-avatars` bucket; storage RLS decides who
//            can read — creator/linked parent + the student itself),
//   preset → the bundled boy/girl PNG,
//   default / any failure → the existing initials Avatar bubble.
// Signed URLs live in a small module-level TTL cache so lists don't re-sign
// the same object on every render; the path changes on every re-upload, so a
// changed avatar naturally misses the cache. Leaderboards/rankings stay on the
// plain initials Avatar — never render photos there.
import React, { useEffect, useState } from "react";
import { View, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { supabase } from "@/lib/supabase";
import {
  CHILD_AVATAR_BUCKET,
  CHILD_AVATAR_SIGNED_TTL_SECONDS,
  resolveChildAvatarSource,
  type ChildAvatarFields,
  type ChildAvatarPreset,
} from "@/lib/childAvatar";
import { Avatar } from "./Avatar";

export const CHILD_AVATAR_PRESET_ASSETS: Record<ChildAvatarPreset, number> = {
  boy: require("../../assets/avatars/child-boy.png"),
  girl: require("../../assets/avatars/child-girl.png"),
};

// ---- signed-URL TTL cache (module-level, in-memory) ---------------------------

// Re-sign well before the 1h URL expiry so a cached URL is never handed out
// with only seconds of life left.
const CACHE_TTL_MS = (CHILD_AVATAR_SIGNED_TTL_SECONDS - 10 * 60) * 1000;
const cache = new Map<string, { url: string; expiresAt: number }>();

async function signedChildAvatarUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  try {
    const { data, error } = await supabase.storage
      .from(CHILD_AVATAR_BUCKET)
      .createSignedUrl(path, CHILD_AVATAR_SIGNED_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
    return data.signedUrl;
  } catch {
    return null; // initials fallback — a broken avatar must never break a list
  }
}

/** A signed display URL for a photo path (null while loading / on failure). */
function useSignedChildAvatarUrl(path: string | null): string | null {
  const cached = path ? cache.get(path) : undefined;
  const [url, setUrl] = useState<string | null>(
    cached && cached.expiresAt > Date.now() ? cached.url : null,
  );
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let live = true;
    void signedChildAvatarUrl(path).then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [path]);
  return path ? url : null;
}

// ---- renderer ---------------------------------------------------------------------

export function ChildAvatar({
  row,
  name,
  seed,
  size = 40,
  style,
  /** Legacy self-uploaded profile avatar URL (public bucket) — used only when
   *  the parent-set avatar is absent (web child-header priority parity). */
  fallbackUrl = null,
}: {
  row: ChildAvatarFields | null | undefined;
  name: string | null | undefined;
  seed?: string | null;
  size?: number;
  style?: ViewStyle;
  fallbackUrl?: string | null;
}) {
  const source = resolveChildAvatarSource(row);
  const signedUrl = useSignedChildAvatarUrl(source.type === "photo" ? source.path : null);

  if (source.type === "preset") {
    return (
      <View
        style={[
          { width: size, height: size, borderRadius: size / 2, overflow: "hidden" },
          style,
        ]}
      >
        <Image
          source={CHILD_AVATAR_PRESET_ASSETS[source.key]}
          contentFit="cover"
          accessible
          accessibilityLabel={name ?? undefined}
          style={{ width: size, height: size }}
        />
      </View>
    );
  }

  if (source.type === "photo" && signedUrl) {
    return <Avatar name={name} seed={seed} url={signedUrl} size={size} style={style} />;
  }

  // default, legacy fallback, or a photo that failed to sign / is still loading
  return (
    <Avatar
      name={name}
      seed={seed}
      url={source.type === "default" ? fallbackUrl : null}
      size={size}
      style={style}
    />
  );
}
