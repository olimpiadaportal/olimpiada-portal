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
//
// A signed URL is a WASTING asset: it expires, the object can be deleted from
// under it, and the device can be offline. Every one of those must land on the
// initials bubble, never on a broken image — so a load failure drops the cache
// entry, re-signs ONCE, and gives up to initials if that fails too.
import React, { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * A signed display URL for a photo path (null while loading / on failure), plus
 * the `onError` the <Image> calls when that URL does not load: it clears the
 * cached URL so the whole app stops handing out a dead link, falls back to
 * initials immediately, and re-signs the path once (an expired link is the
 * common case and re-signing fixes it silently).
 */
function useSignedChildAvatarUrl(path: string | null): {
  url: string | null;
  onError: () => void;
} {
  const cached = path ? cache.get(path) : undefined;
  const [url, setUrl] = useState<string | null>(
    cached && cached.expiresAt > Date.now() ? cached.url : null,
  );
  // Re-sign trigger. Holds the path it already retried, so the one retry is
  // per-path and resets by itself when the avatar changes.
  const [attempt, setAttempt] = useState(0);
  const retriedPath = useRef<string | null>(null);

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
  }, [path, attempt]);

  const onError = useCallback(() => {
    if (!path) return;
    cache.delete(path);
    setUrl(null); // initials right now, rather than a broken image
    if (retriedPath.current === path) return; // one retry per path
    retriedPath.current = path;
    setAttempt((n) => n + 1);
  }, [path]);

  return { url: path ? url : null, onError };
}

// ---- renderer ---------------------------------------------------------------------

export function ChildAvatar({
  row,
  name,
  seed,
  size = 40,
  style,
  /** PARENT self-avatar URL (the public `profile-avatars` bucket) for the
   *  shared header trigger, used only when there is no students row at all.
   *  NEVER pass a URL for a student: a child's photograph is private, comes
   *  from `row` and is signed above. */
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
  const { url: signedUrl, onError } = useSignedChildAvatarUrl(
    source.type === "photo" ? source.path : null,
  );

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
    return (
      <Avatar
        name={name}
        seed={seed}
        url={signedUrl}
        size={size}
        style={style}
        onError={onError}
      />
    );
  }

  // default, parent fallback, or a photo that failed to sign / is still loading
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
