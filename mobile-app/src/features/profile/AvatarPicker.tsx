// Shared avatar actions (parent + student profiles): pick an image with
// expo-image-picker and push it through the audited BFF avatar endpoint
// (bffUploadAvatar / bffRemoveAvatar — parent AND student bearers). Client
// checks (type whitelist, 2MB cap) are UX only and reuse the exact web error
// keys; the SERVER magic-byte sniff remains the authority — its error keys
// come back through the BFF envelope and are translated here too.
import React, { useState } from "react";
import { View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { bffRemoveAvatar, bffUploadAvatar } from "@/lib/api";

type T = (key: string) => string;

/** Mirror of the web ALLOWED_AVATAR_MIME + the 2MB profile-avatars bucket cap. */
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function mimeOf(asset: ImagePicker.ImagePickerAsset): string | null {
  if (asset.mimeType && asset.mimeType.length > 0) return asset.mimeType.toLowerCase();
  const ext = (asset.uri.split(".").pop() ?? "").toLowerCase();
  return MIME_BY_EXT[ext] ?? null;
}

export function AvatarSection({ hasAvatar, t }: { hasAvatar: boolean; t: T }) {
  const { tokens } = useTheme();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Both profile reads resolve the avatar through their own query — refresh
  // whichever is mounted (parent "own-profile" / student "student-profile").
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["own-profile"] });
    void queryClient.invalidateQueries({ queryKey: ["student-profile"] });
  };

  async function pickAndUpload() {
    if (pending) return;
    setError(null);
    setDone(false);
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
    } catch {
      setError(t("profile.err.uploadFailed"));
      return;
    }
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    const mime = mimeOf(asset);
    if (!mime || !ALLOWED_MIME.has(mime)) {
      setError(t("profile.err.fileType"));
      return;
    }
    if (typeof asset.fileSize === "number" && asset.fileSize > MAX_AVATAR_BYTES) {
      setError(t("profile.err.fileTooLarge"));
      return;
    }

    setPending("upload");
    const res = await bffUploadAvatar({
      uri: asset.uri,
      name: asset.fileName ?? `avatar.${EXT_BY_MIME[mime] ?? "jpg"}`,
      type: mime,
    });
    setPending(null);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setDone(true);
    invalidate();
  }

  async function remove() {
    if (pending) return;
    setError(null);
    setDone(false);
    setPending("remove");
    const res = await bffRemoveAvatar();
    setPending(null);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setDone(true);
    invalidate();
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Button
          title={hasAvatar ? t("profile.changeAvatar") : t("profile.uploadAvatar")}
          variant="ghost"
          pending={pending === "upload"}
          disabled={pending === "remove"}
          style={{ flex: 1, minHeight: 42, paddingVertical: spacing.sm }}
          onPress={() => void pickAndUpload()}
        />
        {hasAvatar ? (
          <Button
            title={t("profile.removeAvatar")}
            variant="ghost"
            pending={pending === "remove"}
            disabled={pending === "upload"}
            style={{ flex: 1, minHeight: 42, paddingVertical: spacing.sm }}
            onPress={() => void remove()}
          />
        ) : null}
      </View>
      <AppText variant="muted" style={{ fontSize: 12, textAlign: "center" }}>
        {t("profile.avatarHint")}
      </AppText>
      {error ? (
        <AppText variant="muted" color={tokens.danger} style={{ textAlign: "center" }}>
          {error}
        </AppText>
      ) : null}
      {done && !error ? (
        <AppText variant="muted" color={tokens.ok} style={{ textAlign: "center" }}>
          {t("profile.saved")}
        </AppText>
      ) : null}
    </View>
  );
}
