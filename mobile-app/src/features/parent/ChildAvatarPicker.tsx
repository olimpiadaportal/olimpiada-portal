// Parent-managed child avatar picker (add-child + edit-child): Default
// (initials) / Boy / Girl preset tiles + a photo tile fed by expo-image-picker
// (preview + replace + remove). The component is CONTROLLED — callers own the
// choice and decide when to apply it through the BFF (edit applies instantly,
// add applies AFTER the child exists, best-effort). Client mime/size checks
// are UX only; the server byte-sniff (png/jpeg/webp ≤2MB) is the authority
// and its error keys surface through the BFF envelope.
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Camera } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { CHILD_AVATAR_PRESET_ASSETS, ChildAvatar } from "@/components/ChildAvatar";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import {
  CHILD_AVATAR_ALLOWED_MIME,
  CHILD_AVATAR_EXT_BY_MIME,
  CHILD_AVATAR_MIME_BY_EXT,
  MAX_CHILD_AVATAR_BYTES,
  type ChildAvatarFields,
  type ChildAvatarPreset,
} from "@/lib/childAvatar";
import { bffSetChildAvatar, type BffResult, type ChildAvatarState } from "@/lib/api";

type T = (key: string) => string;

export type PickedAvatarFile = { uri: string; name: string; type: string };

export type ChildAvatarChoice =
  | { kind: "default" }
  | { kind: "preset"; key: ChildAvatarPreset }
  /** file=null → the EXISTING server photo (edit mode; nothing new to send). */
  | { kind: "photo"; file: PickedAvatarFile | null; previewUri: string | null };

/** Apply a picker choice through the BFF (null = nothing to send). */
export function applyChildAvatarChoice(
  childId: string,
  choice: ChildAvatarChoice,
): Promise<BffResult<ChildAvatarState>> | null {
  if (choice.kind === "preset") return bffSetChildAvatar(childId, { preset: choice.key });
  if (choice.kind === "photo")
    return choice.file ? bffSetChildAvatar(childId, { file: choice.file }) : null;
  return bffSetChildAvatar(childId, { remove: true });
}

function mimeOf(asset: ImagePicker.ImagePickerAsset): string | null {
  if (asset.mimeType && asset.mimeType.length > 0) return asset.mimeType.toLowerCase();
  const ext = (asset.uri.split(".").pop() ?? "").toLowerCase();
  return CHILD_AVATAR_MIME_BY_EXT[ext] ?? null;
}

function Tile({
  label,
  selected,
  disabled,
  onPress,
  selectedNote,
  children,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  selectedNote: string;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={selected ? `${label} — ${selectedNote}` : label}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        width: "23%",
        minWidth: 76,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: selected ? tokens.accent : tokens.border,
        backgroundColor: tokens.surface,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xs,
        gap: spacing.sm,
        alignItems: "center",
        opacity: disabled ? 0.6 : pressed ? 0.8 : 1,
      })}
    >
      {children}
      <AppText
        variant="label"
        numberOfLines={1}
        color={selected ? tokens.accent : tokens.text}
        style={{ fontSize: 12 }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChildAvatarPicker({
  value,
  onChange,
  childName,
  seed,
  disabled = false,
  error = null,
  existingPhotoRow = null,
  t,
}: {
  value: ChildAvatarChoice;
  onChange: (choice: ChildAvatarChoice) => void;
  /** Feeds the Default tile's initials preview. */
  childName: string;
  /** Stable pastel seed for the initials preview (profile id when known). */
  seed?: string | null;
  disabled?: boolean;
  /** Apply error from the caller (BFF key already translated). */
  error?: string | null;
  /** Edit mode: the student's saved avatar columns — previews the EXISTING
   *  server photo (signed URL) when no new photo was picked yet. */
  existingPhotoRow?: ChildAvatarFields | null;
  t: T;
}) {
  const { tokens } = useTheme();
  const [pickError, setPickError] = useState<string | null>(null);

  async function pickPhoto() {
    if (disabled) return;
    setPickError(null);
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
    } catch {
      setPickError(t("profile.err.uploadFailed"));
      return;
    }
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    const mime = mimeOf(asset);
    if (!mime || !CHILD_AVATAR_ALLOWED_MIME.has(mime)) {
      setPickError(t("profile.err.fileType"));
      return;
    }
    if (typeof asset.fileSize === "number" && asset.fileSize > MAX_CHILD_AVATAR_BYTES) {
      setPickError(t("profile.err.fileTooLarge"));
      return;
    }
    onChange({
      kind: "photo",
      file: {
        uri: asset.uri,
        name: asset.fileName ?? `avatar.${CHILD_AVATAR_EXT_BY_MIME[mime] ?? "jpg"}`,
        type: mime,
      },
      previewUri: asset.uri,
    });
  }

  const isPhoto = value.kind === "photo";
  const photoPreview = isPhoto ? value.previewUri : null;
  const selectedNote = t("addchild.avatar.photoSelected");

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="label">{t("addchild.avatar.title")}</AppText>
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("addchild.avatar.hint")}
      </AppText>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Tile
          label={t("addchild.avatar.default")}
          selected={value.kind === "default"}
          disabled={disabled}
          onPress={() => onChange({ kind: "default" })}
          selectedNote={selectedNote}
        >
          <Avatar name={childName || "—"} seed={seed} size={44} />
        </Tile>
        {(["boy", "girl"] as const).map((key) => (
          <Tile
            key={key}
            label={t(`addchild.avatar.${key}`)}
            selected={value.kind === "preset" && value.key === key}
            disabled={disabled}
            onPress={() => onChange({ kind: "preset", key })}
            selectedNote={selectedNote}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, overflow: "hidden" }}>
              <Image
                source={CHILD_AVATAR_PRESET_ASSETS[key]}
                contentFit="cover"
                accessibilityLabel={t(`addchild.avatar.${key}`)}
                style={{ width: 44, height: 44 }}
              />
            </View>
          </Tile>
        ))}
        <Tile
          label={isPhoto ? t("addchild.avatar.photoSelected") : t("addchild.avatar.upload")}
          selected={isPhoto}
          disabled={disabled}
          onPress={() => void pickPhoto()}
          selectedNote={selectedNote}
        >
          {photoPreview ? (
            <View style={{ width: 44, height: 44, borderRadius: 22, overflow: "hidden" }}>
              <Image
                source={{ uri: photoPreview }}
                contentFit="cover"
                accessibilityLabel={t("addchild.avatar.photoSelected")}
                style={{ width: 44, height: 44 }}
              />
            </View>
          ) : isPhoto && existingPhotoRow ? (
            <ChildAvatar row={existingPhotoRow} name={childName || "—"} seed={seed} size={44} />
          ) : (
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: tokens.chipBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Camera size={20} color={tokens.accent} strokeWidth={2} />
            </View>
          )}
        </Tile>
      </View>

      {isPhoto ? (
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Button
            title={t("addchild.avatar.replace")}
            variant="ghost"
            disabled={disabled}
            style={{ flex: 1, minHeight: 40, paddingVertical: spacing.sm }}
            onPress={() => void pickPhoto()}
          />
          <Button
            title={t("addchild.avatar.removePhoto")}
            variant="ghost"
            disabled={disabled}
            style={{ flex: 1, minHeight: 40, paddingVertical: spacing.sm }}
            onPress={() => onChange({ kind: "default" })}
          />
        </View>
      ) : null}

      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("addchild.avatar.requirements")}
      </AppText>
      {pickError || error ? (
        <AppText variant="muted" color={tokens.danger}>
          {pickError ?? error}
        </AppText>
      ) : null}
    </View>
  );
}
