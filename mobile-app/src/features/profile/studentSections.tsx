// Student profile section cards (mobile port of web ChildProfile +
// StickerThemePicker + PalettePicker + the read-only school-info card):
//   * identity header — Avatar (initials fallback on the shared component,
//     real picker via the BFF), name, 8-digit ID (mono, grouped "1234 5678")
//     and the "only a parent can change" hint,
//   * editable name (bffUpdateStudentName — web childUpdateOwnName twin),
//   * security — change password DIRECTLY via supabase.auth.updateUser after
//     the web childChangeOwnPassword client checks (≥8 chars, ≠ the child's
//     8-digit ID, confirm-match),
//   * read-only school info (ListRow facts: grade via formatGradeLabel, city,
//     school),
//   * character-sticker THEME picker + light-mode PALETTE picker — both write
//     on the child's own JWT (RLS self-row) and re-skin live. Palette swatches
//     are DERIVED from the ARENA_LIGHT tokens (single source of truth — no
//     inlined palette hexes).
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  GraduationCap,
  KeyRound,
  MapPin,
  Palette,
  School,
  Sticker,
  UserRound,
  X,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ChildAvatar } from "@/components/ChildAvatar";
import { ListRow } from "@/components/ListRow";
import { PasswordField, TextField } from "@/components/TextField";
import { useTheme } from "@/theme/ThemeProvider";
import {
  ARENA_LIGHT,
  ARENA_PALETTES,
  radius,
  spacing,
  type ArenaPalette,
} from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { bffUpdateStudentName } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { groupChildId } from "@/features/parent/commerce";
import { AvatarSection } from "./AvatarPicker";
import {
  studentProfileKey,
  useSetStickerTheme,
  useStickerSelection,
  useStickerThemes,
  type StudentProfile,
} from "./studentProfile";
import { useSetStudentPalette } from "./useArenaPalette";
import { useAuthStore } from "@/features/auth/authStore";

type T = (key: string) => string;

/** Section title row: soft icon chip + label (shared card header pattern). */
function SectionTitleRow({ icon, title }: { icon: React.ReactNode; title: string }) {
  const { tokens } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.sm,
          backgroundColor: tokens.chipBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <AppText variant="title" style={{ fontSize: 16, flex: 1 }} numberOfLines={1}>
        {title}
      </AppText>
    </View>
  );
}

/* ------------------------------ identity card ------------------------------ */

export function StudentIdentityCard({ profile, t }: { profile: StudentProfile; t: T }) {
  const profileId = useAuthStore((s) => s.profileId);
  return (
    <Card style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
        {/* Parent-set avatar (preset/photo, signed via the student's OWN
            session) wins over the legacy self-uploaded photo (web parity). */}
        <ChildAvatar
          row={profile.avatar}
          name={profile.name || "—"}
          seed={profileId}
          fallbackUrl={profile.avatarUrl}
          size={64}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title" numberOfLines={1}>
            {profile.name || "—"}
          </AppText>
          <AppText variant="muted" numberOfLines={1}>
            {t("child.id")}:{" "}
            <AppText variant="mono" style={{ fontSize: 14 }}>
              {profile.uniqueId ? groupChildId(profile.uniqueId) : "—"}
            </AppText>
          </AppText>
          <AppText variant="muted" style={{ fontSize: 11 }}>
            {t("prof2.idHint")}
          </AppText>
        </View>
      </View>
      <AvatarSection hasAvatar={profile.avatarUrl !== null} t={t} />
    </Card>
  );
}

/* ------------------------------ editable name ------------------------------ */

export function StudentNameSection({ profile, t }: { profile: StudentProfile; t: T }) {
  const { tokens } = useTheme();
  const profileId = useAuthStore((s) => s.profileId);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(profile.firstName);
  const [last, setLast] = useState(profile.lastName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    if (pending) return;
    const f = first.trim().slice(0, 80);
    const l = last.trim().slice(0, 80);
    if (!f || !l) {
      setError(t("profile.err.nameRequired"));
      return;
    }
    setError(null);
    setPending(true);
    const res = await bffUpdateStudentName(f, l);
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setDone(true);
    setOpen(false);
    void queryClient.invalidateQueries({ queryKey: studentProfileKey(profileId) });
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <SectionTitleRow
        icon={<UserRound size={18} color={tokens.accent} strokeWidth={2} />}
        title={t("prof2.accountInfo")}
      />
      {!open ? (
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <View style={{ gap: 2, flexShrink: 1 }}>
            <AppText variant="muted" style={{ fontSize: 12 }}>
              {t("prof2.name")}
            </AppText>
            <AppText variant="label" numberOfLines={1}>
              {profile.name || "—"}
            </AppText>
          </View>
          <Button
            title={t("profile.editName")}
            variant="ghost"
            style={{ minHeight: 40, paddingVertical: spacing.sm }}
            onPress={() => {
              setFirst(profile.firstName);
              setLast(profile.lastName);
              setDone(false);
              setError(null);
              setOpen(true);
            }}
          />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <TextField
            label={t("profile.firstNameLabel")}
            value={first}
            onChangeText={setFirst}
            maxLength={80}
            autoCapitalize="words"
          />
          <TextField
            label={t("profile.lastNameLabel")}
            value={last}
            onChangeText={setLast}
            maxLength={80}
            autoCapitalize="words"
          />
          {error ? (
            <AppText variant="muted" color={tokens.danger}>
              {error}
            </AppText>
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Button
              title={t("profile.save")}
              pendingTitle={t("profile.saving")}
              pending={pending}
              style={{ flex: 1 }}
              onPress={() => void save()}
            />
            <Button
              title={t("profile.cancel")}
              variant="ghost"
              disabled={pending}
              style={{ flex: 1 }}
              onPress={() => {
                setOpen(false);
                setError(null);
              }}
            />
          </View>
        </View>
      )}
      {done && !open ? (
        <AppText variant="muted" color={tokens.ok}>
          {t("profile.saved")}
        </AppText>
      ) : null}
    </Card>
  );
}

/* ----------------------- change password (child rules) ---------------------- */

export function StudentPasswordSection({ uniqueId, t }: { uniqueId: string; t: T }) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (pending) return;
    setDone(false);
    // Web childChangeOwnPassword contract: min 8, never the 8-digit login ID.
    if (pw.length < 8) {
      setError(t("profile.err.passwordShort"));
      return;
    }
    if (uniqueId && pw === uniqueId) {
      setError(t("profile.err.passwordEqualsId"));
      return;
    }
    if (pw !== confirm) {
      setError(t("mob.prof.passwordMismatch"));
      return;
    }
    setError(null);
    setPending(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setPending(false);
    if (err) {
      setError(t("profile.err.updateFailed"));
      return;
    }
    setPw("");
    setConfirm("");
    setDone(true);
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <SectionTitleRow
        icon={<KeyRound size={18} color={tokens.accent} strokeWidth={2} />}
        title={t("prof2.security")}
      />
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("prof2.securityHint")}
      </AppText>
      {!open ? (
        <Button title={t("profile.changePassword")} variant="ghost" onPress={() => setOpen(true)} />
      ) : (
        <View style={{ gap: spacing.md }}>
          <PasswordField
            label={t("profile.newPassword")}
            value={pw}
            onChangeText={setPw}
            showLabel={t("mob.pw.show")}
            hideLabel={t("mob.pw.hide")}
          />
          <PasswordField
            label={t("mob.prof.confirmPassword")}
            value={confirm}
            onChangeText={setConfirm}
            showLabel={t("mob.pw.show")}
            hideLabel={t("mob.pw.hide")}
          />
          {error ? (
            <AppText variant="muted" color={tokens.danger}>
              {error}
            </AppText>
          ) : null}
          {done ? (
            <AppText variant="muted" color={tokens.ok}>
              {t("profile.passwordChanged")}
            </AppText>
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Button
              title={t("profile.save")}
              pendingTitle={t("profile.saving")}
              pending={pending}
              style={{ flex: 1 }}
              onPress={() => void submit()}
            />
            <Button
              title={t("profile.cancel")}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => {
                setOpen(false);
                setError(null);
                setDone(false);
                setPw("");
                setConfirm("");
              }}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

/* --------------------------- read-only school info -------------------------- */

export function SchoolInfoCard({ profile, t }: { profile: StudentProfile; t: T }) {
  const { tokens } = useTheme();
  const { locale } = useT();
  const gradeInfo = profile.grade
    ? formatGradeLabel(profile.grade.level, locale, profile.grade.name)
    : profile.classGrade ?? "—";
  return (
    <Card style={{ gap: spacing.sm }}>
      <SectionTitleRow
        icon={<School size={18} color={tokens.accent} strokeWidth={2} />}
        title={t("prof2.schoolInfo")}
      />
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("prof2.schoolInfoHint")}
      </AppText>
      <ListRow
        icon={<GraduationCap size={18} color={tokens.muted} strokeWidth={2} />}
        title={t("prof2.grade")}
        value={gradeInfo}
      />
      <ListRow
        icon={<MapPin size={18} color={tokens.muted} strokeWidth={2} />}
        title={t("prof2.city")}
        value={profile.city ?? "—"}
      />
      <ListRow
        icon={<School size={18} color={tokens.muted} strokeWidth={2} />}
        title={t("prof2.school")}
        value={profile.school ?? "—"}
      />
    </Card>
  );
}

/* ------------------------- selectable card scaffold ------------------------- */

function SelectableCard({
  label,
  selected,
  pending,
  disabled,
  onPress,
  selectedNote,
  children,
}: {
  label: string;
  selected: boolean;
  pending: boolean;
  disabled: boolean;
  onPress: () => void;
  selectedNote: string;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled, busy: pending }}
      accessibilityLabel={selected ? `${label} — ${selectedNote}` : label}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        width: "31%",
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: selected ? tokens.accent : tokens.border,
        backgroundColor: tokens.surface,
        padding: spacing.sm,
        gap: spacing.xs,
        alignItems: "center",
        opacity: disabled && !pending ? 0.6 : pressed ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
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
      {selected ? (
        <View
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: tokens.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={12} color={tokens.surface} strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

/* --------------------------- sticker theme picker --------------------------- */

export function StickerThemeSection({ t }: { t: T }) {
  const { tokens } = useTheme();
  const themesQ = useStickerThemes();
  const selectionQ = useStickerSelection();
  const setTheme = useSetStickerTheme();
  const [pendingId, setPendingId] = useState<string | null>(null); // "" = off card
  const [error, setError] = useState<string | null>(null);

  const themes = themesQ.data ?? [];
  const selectedId = selectionQ.data ?? null;

  async function choose(themeId: string | null) {
    if (pendingId !== null) return;
    setError(null);
    setPendingId(themeId ?? "");
    const ok = await setTheme(themeId);
    setPendingId(null);
    if (!ok) setError(t("stk.err.generic"));
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <SectionTitleRow
        icon={<Sticker size={18} color={tokens.accent} strokeWidth={2} />}
        title={t("stk.sectionTitle")}
      />
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("stk.sectionDesc")}
      </AppText>
      {themesQ.isPending || selectionQ.isPending ? null : themes.length === 0 ? (
        <AppText variant="muted">{t("stk.empty")}</AppText>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {/* Off-card first (stickers must be easy to disable). */}
          <SelectableCard
            label={t("stk.none")}
            selected={selectedId === null}
            pending={pendingId === ""}
            disabled={pendingId !== null}
            onPress={() => void choose(null)}
            selectedNote={t("prof2.selected")}
          >
            <View
              style={{
                width: "100%",
                aspectRatio: 1.5,
                borderRadius: radius.sm,
                backgroundColor: tokens.chipBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={20} color={tokens.muted} strokeWidth={2} />
            </View>
          </SelectableCard>

          {themes.map((th) => (
            <SelectableCard
              key={th.id}
              label={th.name}
              selected={selectedId === th.id}
              pending={pendingId === th.id}
              disabled={pendingId !== null}
              onPress={() => void choose(th.id)}
              selectedNote={t("prof2.selected")}
            >
              <View
                style={{
                  width: "100%",
                  aspectRatio: 1.5,
                  borderRadius: radius.sm,
                  backgroundColor: tokens.chipBg,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  overflow: "hidden",
                  padding: 4,
                }}
              >
                {th.samples.length === 0 ? (
                  <Sticker size={20} color={tokens.muted} strokeWidth={2} />
                ) : (
                  th.samples.map((url, i) => (
                    <Image
                      key={i}
                      source={{ uri: url }}
                      style={{ flex: 1, height: "100%" }}
                      contentFit="contain"
                      accessibilityLabel={th.name}
                    />
                  ))
                )}
                {th.count > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 3,
                      right: 3,
                      backgroundColor: tokens.pillBg,
                      borderRadius: 999,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                    }}
                  >
                    <AppText
                      variant="label"
                      color={tokens.pillText}
                      style={{ fontSize: 10 }}
                      accessibilityLabel={t("stk.countTitle")}
                    >
                      {th.count}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </SelectableCard>
          ))}
        </View>
      )}
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}
    </Card>
  );
}

/* ------------------------------ palette picker ------------------------------ */

// Preview swatches DERIVED from the arena light tokens (redesign §4-Student):
// each palette previews its own background + its two leading accents. One
// source of truth — when ARENA_LIGHT changes, the picker follows automatically.
const PREVIEWS: { id: ArenaPalette; bg: string; a: string; b: string }[] =
  ARENA_PALETTES.map((id) => ({
    id,
    bg: ARENA_LIGHT[id].bg,
    a: ARENA_LIGHT[id].lime,
    b: ARENA_LIGHT[id].blue,
  }));

export function PaletteSection({ current, t }: { current: ArenaPalette; t: T }) {
  const { tokens } = useTheme();
  const setPalette = useSetStudentPalette();
  const [pendingId, setPendingId] = useState<ArenaPalette | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The saved palette lives in the shared query cache (useArenaPalette): the
  // successful write updates it there, so `current` — and the arena chrome,
  // once the layout hook consumes the same cache — re-skins live.
  const selected = current;

  async function choose(p: ArenaPalette) {
    if (pendingId !== null) return;
    setError(null);
    setPendingId(p);
    const ok = await setPalette(p);
    setPendingId(null);
    if (!ok) setError(t("profile.err.updateFailed"));
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <SectionTitleRow
        icon={<Palette size={18} color={tokens.accent} strokeWidth={2} />}
        title={t("pal.title")}
      />
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("pal.hint")}
      </AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {PREVIEWS.map((p) => (
          <SelectableCard
            key={p.id}
            label={t(`pal.${p.id}`)}
            selected={selected === p.id}
            pending={pendingId === p.id}
            disabled={pendingId !== null}
            onPress={() => void choose(p.id)}
            selectedNote={t("prof2.selected")}
          >
            <View
              style={{
                width: "100%",
                aspectRatio: 1.5,
                borderRadius: radius.sm,
                backgroundColor: p.bg,
                borderWidth: 1,
                borderColor: tokens.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.sm,
              }}
            >
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: p.a }} />
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: p.b }} />
            </View>
          </SelectableCard>
        ))}
      </View>
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}
    </Card>
  );
}
