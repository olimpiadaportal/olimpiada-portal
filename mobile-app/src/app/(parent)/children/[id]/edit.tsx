// Parent edits a child's info (web ChildInfoEditForm parity): first/last name,
// city → district (rayon) → school cascade + grade (ALL selects submit
// database UUIDs), read-only 8-digit login ID, and an optional child-password
// reset. Round-18 lessons are baked in: fully controlled state that NEVER
// clears on save, the cascade keeps a still-valid school and clears a foreign
// one, per-field required errors, and a pending double-submit guard. Round 21:
// the rayon field shows only when the city has active rayons (required then,
// narrows the school list, preselected from the student's saved
// city_district_id — read directly, RLS-scoped) and posts city_district_id
// through the ownership-checked BFF.
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Trash2, TriangleAlert } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ChildAvatar } from "@/components/ChildAvatar";
import { PasswordField, TextField } from "@/components/TextField";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { useFieldChain } from "@/lib/useFieldChain";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { checkNewPassword } from "@/lib/passwordPolicy";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { fetchChildren, type ChildRow } from "@/lib/data";
import { resolveChildAvatarSource } from "@/lib/childAvatar";
import { supabase } from "@/lib/supabase";
import { bffDeleteChild, bffEditChild, bffResetChildPassword } from "@/lib/api";
import { filterSchoolsByRayon, rayonsOfCity } from "@/features/parent/ChildInfoForm";
import {
  ChildAvatarPicker,
  applyChildAvatarChoice,
  type ChildAvatarChoice,
} from "@/features/parent/ChildAvatarPicker";
import {
  useCities,
  useCityDistricts,
  useGrades,
  useInvalidateParentData,
  useSchools,
  type SchoolRow,
} from "@/features/parent/queries";
import { SheetShell, childDisplayName } from "@/features/parent/ui";
import { SelectField, type SelectOption } from "@/features/profile/SelectField";
import { useAuthStore } from "@/features/auth/authStore";
import { showToast } from "@/features/toast/toastStore";

type FieldErrors = Partial<
  Record<"first" | "last" | "city" | "district" | "school" | "grade", string>
>;

/** The saved students row → the picker's initial selection. */
function initialAvatarChoice(child: ChildRow): ChildAvatarChoice {
  const src = resolveChildAvatarSource(child);
  if (src.type === "photo") return { kind: "photo", file: null, previewUri: null };
  if (src.type === "preset") return { kind: "preset", key: src.key };
  return { kind: "default" };
}

function choicesEqual(a: ChildAvatarChoice, b: ChildAvatarChoice): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "preset" && b.kind === "preset") return a.key === b.key;
  if (a.kind === "photo" && b.kind === "photo") return a.file === b.file;
  return true;
}

/** Avatar header + picker — applies each selection IMMEDIATELY through the
 *  ownership-checked BFF (a failed apply rolls the selection back). */
function AvatarEditor({ child }: { child: ChildRow }) {
  const { t } = useT();
  const { tokens } = useTheme();
  const queryClient = useQueryClient();
  const name =
    [child.first_name, child.last_name].filter(Boolean).join(" ").trim() || "—";

  const [choice, setChoice] = useState<ChildAvatarChoice>(() => initialAvatarChoice(child));
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(next: ChildAvatarChoice) {
    if (pending || choicesEqual(next, choice)) return;
    const prev = choice;
    setChoice(next);
    setSaved(false);
    setError(null);
    const req = applyChildAvatarChoice(child.profile_id, next);
    if (!req) return; // the existing server photo — nothing to send
    setPending(true);
    const res = await req;
    setPending(false);
    if (!res.ok) {
      setChoice(prev); // roll back — the server state did not change
      setError(t(res.error));
      return;
    }
    setSaved(true);
    void queryClient.invalidateQueries({ queryKey: ["children"] });
    void queryClient.invalidateQueries({ queryKey: ["parent", "children"] });
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
        <ChildAvatar row={child} name={name} seed={child.profile_id} size={64} />
        {/* Identity header beside a 64pt avatar: two lines, so a long az
            double-barrelled name is readable without unbalancing the avatar
            (the editable first/last name fields below carry the full value). */}
        <AppText variant="title" numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>
          {name}
        </AppText>
      </View>
      <ChildAvatarPicker
        value={choice}
        onChange={(next) => void apply(next)}
        childName={name}
        seed={child.profile_id}
        disabled={pending}
        error={error}
        existingPhotoRow={child}
        t={t}
      />
      {saved && !pending && !error ? (
        <AppText variant="muted" color={tokens.ok}>
          {t("childedit.saved")}
        </AppText>
      ) : null}
    </Card>
  );
}

function EditForm({
  child,
  initialCityDistrictId,
}: {
  child: ChildRow;
  /** The student's saved rayon (students.city_district_id) — preselection. */
  initialCityDistrictId: string;
}) {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState(child.first_name ?? "");
  const [lastName, setLastName] = useState(child.last_name ?? "");
  const [districtId, setDistrictId] = useState(child.district_id ?? ""); // the CITY
  const [cityDistrictId, setCityDistrictId] = useState(initialCityDistrictId); // the rayon
  const [schoolId, setSchoolId] = useState(child.school_id ?? "");
  const [gradeId, setGradeId] = useState(child.grade_id ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const citiesQ = useCities();
  const gradesQ = useGrades();
  const districtsQ = useCityDistricts();
  const schoolsQ = useSchools(districtId);

  const cityRayons = rayonsOfCity(districtsQ.data, districtId);
  const hasDistricts = cityRayons.length > 0;

  // The rayon narrows the school list to its schools + the NULL-rayon ones.
  const citySchools = useMemo(
    () =>
      filterSchoolsByRayon(
        (schoolsQ.data ?? []) as SchoolRow[],
        hasDistricts,
        cityDistrictId,
      ),
    [schoolsQ.data, hasDistricts, cityDistrictId],
  );

  // Cascade rule (web handleCityChange parity): a school AND a rayon belong to
  // exactly one city, so changing to a DIFFERENT city always clears both — a
  // stale/foreign UUID can never be posted. Re-selecting the same city keeps
  // the still-valid selections. Submit re-checks membership below.
  function handleCityChange(nextCityId: string) {
    if (nextCityId !== districtId) {
      setSchoolId("");
      setCityDistrictId("");
    }
    setDistrictId(nextCityId);
  }

  // Changing the rayon may orphan the chosen school — clear a foreign one.
  function handleRayonChange(nextRayonId: string) {
    setCityDistrictId(nextRayonId);
    if (schoolId && nextRayonId) {
      const all = (schoolsQ.data ?? []) as SchoolRow[];
      const still = all.find((s) => s.id === schoolId);
      if (still && still.city_district_id != null && still.city_district_id !== nextRayonId) {
        setSchoolId("");
      }
    }
  }

  const cityOptions: SelectOption[] = ((citiesQ.data ?? []) as { id: string; name: string }[]).map(
    (c) => ({ id: String(c.id), label: String(c.name) }),
  );
  const rayonOptions: SelectOption[] = cityRayons.map((d) => ({ id: d.id, label: d.name }));
  const hasPrivate = citySchools.some((s) => s.is_private === true);
  const schoolOptions: SelectOption[] = citySchools.map((s) => ({
    id: s.id,
    label: s.name,
    section: hasPrivate
      ? s.is_private === true
        ? t("addchild.field.privateSchools")
        : t("addchild.field.publicSchools")
      : undefined,
  }));
  const gradeOptions: SelectOption[] = ((gradesQ.data ?? []) as {
    id: string;
    level: number;
    name: string;
  }[]).map((g) => ({ id: String(g.id), label: formatGradeLabel(g.level, locale, g.name) }));

  async function submit() {
    if (pending) return; // double-submit guard
    setSaved(false);
    setError(null);

    const errs: FieldErrors = {};
    if (!firstName.trim()) errs.first = t("auth.child.err.firstNameRequired");
    if (!lastName.trim()) errs.last = t("auth.child.err.lastNameRequired");
    if (!districtId) errs.city = t("addchild.err.cityRequired");
    if (districtId && hasDistricts && !cityDistrictId)
      errs.district = t("addchild.err.districtRequired");
    if (!schoolId || (schoolsQ.isSuccess && !citySchools.some((s) => s.id === schoolId)))
      errs.school = t("addchild.err.schoolRequired");
    if (!gradeId) errs.grade = t("addchild.err.gradeRequired");
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setPending(true);
    const res = await bffEditChild(child.profile_id, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      grade_id: gradeId,
      district_id: districtId,
      city_district_id: cityDistrictId,
      school_id: schoolId,
      // Display-name fallbacks derived from the selections (web parity).
      city: cityOptions.find((c) => c.id === districtId)?.label ?? "",
      school_name: citySchools.find((s) => s.id === schoolId)?.name ?? "",
      class_grade:
        ((gradesQ.data ?? []) as { id: string; name: string }[]).find(
          (g) => String(g.id) === gradeId,
        )?.name ?? "",
    });
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setSaved(true);
    void queryClient.invalidateQueries({ queryKey: ["children"] });
    void queryClient.invalidateQueries({ queryKey: ["parent", "children"] });
    void queryClient.invalidateQueries({
      queryKey: ["child-rayon", child.profile_id],
    });
  }

  // The names are a run of their own: four required selects follow, and the
  // only other input on this screen (the password reset) belongs to a DIFFERENT
  // form with a different submit — so this run ends by dismissing, never by
  // jumping across the Save button.
  const nameChain = useFieldChain(2);

  return (
    <View style={{ gap: spacing.lg }}>
      <AvatarEditor child={child} />
      <AppText variant="muted">{t("childedit.intro")}</AppText>

      <TextField
        {...nameChain.field(0)}
        label={`${t("parent.child.first")} *`}
        value={firstName}
        onChangeText={setFirstName}
        maxLength={80}
        error={fieldErrors.first}
      />
      <TextField
        {...nameChain.field(1)}
        label={`${t("parent.child.last")} *`}
        value={lastName}
        onChangeText={setLastName}
        maxLength={80}
        error={fieldErrors.last}
      />

      <SelectField
        label={`${t("addchild.field.city")} *`}
        value={districtId}
        options={cityOptions}
        placeholder={t("addchild.field.selectCity")}
        onChange={handleCityChange}
        error={fieldErrors.city}
      />
      {hasDistricts ? (
        <SelectField
          label={`${t("addchild.field.district")} *`}
          value={cityDistrictId}
          options={rayonOptions}
          placeholder={t("addchild.field.selectDistrict")}
          onChange={handleRayonChange}
          error={fieldErrors.district}
        />
      ) : null}
      <SelectField
        label={`${t("addchild.field.school")} *`}
        value={schoolId}
        options={schoolOptions}
        placeholder={districtId ? t("addchild.field.selectSchool") : t("addchild.field.cityFirst")}
        onChange={setSchoolId}
        disabled={!districtId || schoolsQ.isPending}
        error={fieldErrors.school}
      />
      <SelectField
        label={`${t("addchild.field.grade")} *`}
        value={gradeId}
        options={gradeOptions}
        placeholder={t("addchild.field.selectGrade")}
        onChange={setGradeId}
        error={fieldErrors.grade}
      />

      {/* Read-only identifiers — display only, never editable. */}
      <Card style={{ gap: spacing.sm }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: spacing.md,
          }}
        >
          {/* The label shrinks; the ID is a number and never compresses. */}
          <AppText variant="muted" style={{ flexShrink: 1 }}>
            {t("parent.child.idLabel")}
          </AppText>
          <AppText variant="mono" style={{ fontWeight: "700" }}>
            {child.child_unique_id ?? t("parent.dash.idPending")}
          </AppText>
        </View>
        <AppText variant="muted" style={{ fontSize: 12 }}>
          {t("childedit.idNote")}
        </AppText>
      </Card>

      {saved && !pending ? (
        <AppText variant="muted" color={tokens.ok}>
          {t("childedit.saved")}
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}

      <Button
        title={t("childedit.save")}
        pendingTitle={t("childedit.saving")}
        pending={pending}
        onPress={() => void submit()}
      />

      <PasswordReset childId={child.profile_id} />
      <DeleteChild child={child} />
    </View>
  );
}

/**
 * Child password reset — a COLLAPSED disclosure, and that is the fix, not a
 * style choice.
 *
 * THE BUG: the field used to be permanently visible in a card that sits BELOW
 * the details form's big filled "Save". A parent typed a new password, pressed
 * the only primary button on the screen, and was told the save succeeded —
 * while the password had never been transmitted. Nothing about the layout said
 * the field belonged to the small ghost button further down.
 *
 * THE RULE THIS RESTORES: a password input never exists on screen unless its
 * OWN submit is the next action under it. Closed, there is nothing to lose;
 * open, the field and its Update button are one block with no other submit
 * between them. This is the same shape the two self-service password sections
 * already use (features/profile/sections.tsx, studentSections.tsx).
 */
function PasswordReset({ childId }: { childId: string }) {
  const { t } = useT();
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pending, setPending] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    // Never leave a typed password behind a collapsed card: reopening it would
    // show a filled field the parent no longer remembers choosing.
    setPw("");
    setError(null);
    setOpen(false);
  }

  async function submit() {
    if (pending) return;
    setOk(false);
    // FEEDBACK ONLY — the BFF re-runs the identical rule and is authoritative.
    // `tooShort` keeps its existing message; the strength dimensions the old
    // length test never covered share the one passwordWeak string.
    const problem = checkNewPassword(pw);
    if (problem) {
      setError(
        t(
          problem === "tooShort"
            ? "auth.child.err.passwordTooShort"
            : "auth.child.err.passwordWeak",
        ),
      );
      return;
    }
    setError(null);
    setPending(true);
    // The ≠8-digit-ID rule is enforced server-side by the BFF/service.
    const res = await bffResetChildPassword(childId, pw);
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setPw("");
    setOk(true);
    setOpen(false);
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <AppText variant="title" style={{ fontSize: 16 }}>
        {t("child.resetPw")}
      </AppText>
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("parent.child.passwordHint")}
      </AppText>
      {ok && !pending ? (
        <AppText variant="muted" color={tokens.ok}>
          {t("auth.child.passwordReset")}
        </AppText>
      ) : null}
      {!open ? (
        <Button
          title={t("profile.changePassword")}
          variant="ghost"
          onPress={() => {
            setOk(false);
            setOpen(true);
          }}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {/* A run of one, in its own card with its own submit: the return key
              only closes the keyboard — a password reset is never fired by it. */}
          <PasswordField
            label={t("parent.child.password")}
            value={pw}
            onChangeText={setPw}
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            showLabel={t("mob.pw.show")}
            hideLabel={t("mob.pw.hide")}
            error={error}
          />
          {/* The FILLED button is this field's own submit, directly under it.
              Both buttons flex so the two az/ru labels share the width at
              320pt instead of one of them truncating. */}
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Button
              title={t("child.resetPwSubmit")}
              pending={pending}
              style={{ flex: 1 }}
              onPress={() => void submit()}
            />
            <Button
              title={t("profile.cancel")}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={close}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

/**
 * DANGER ZONE — delete this child (web `deleteChild` action parity).
 *
 * WHY IT IS HERE AND NOT ON THE HOME CARD. The web keeps it on the dashboard
 * card because the web has nowhere else to put it. Mobile does: this screen is
 * where child management already lives, and the card's OTHER secondary action —
 * the password reset above — was moved here for the same reason. The Home card
 * ends in a two-up flex row whose az labels ("Fənlər", "Məlumatı redaktə et")
 * already use their width at 320pt; a third button turns that row into three
 * wrapped columns and puts an IRREVERSIBLE action one mis-tap away on the
 * screen a parent opens most. The app's own destructive precedent is a danger
 * card at the bottom of a detail screen (features/profile/sections.tsx →
 * DangerZone), and this is that shape. Reaching it still costs one tap from the
 * card ("Məlumatı redaktə et"), which is the web's flow with the confirmation
 * step given room.
 *
 * HIDDEN FROM A PARENT WHO IS KNOWN NOT TO HAVE CREATED THE CHILD.
 * `students_select` also shows a row to a merely LINKED parent, but
 * `students_write` and the web action both require the CREATOR — for anyone
 * else the web button silently returns having deleted nothing, which is worse
 * than no button. Note the direction: the gate hides on a KNOWN mismatch, not
 * on an unresolved identity (see the check itself). The BFF re-verifies
 * authorship server-side; this decides what is OFFERED, never what is allowed.
 */
function DeleteChild({ child }: { child: ChildRow }) {
  const { t } = useT();
  const { tokens } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const invalidateParentData = useInvalidateParentData();
  const myProfileId = useAuthStore((s) => s.profileId);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    // The backdrop tap and Android back both land here, so the sheet is modal
    // in the strict sense while the request is deciding: a dialog that vanishes
    // mid-delete reads as "nothing happened" and invites a second attempt.
    if (pending) return;
    setError(null);
    setConfirmOpen(false);
  }

  async function submit() {
    if (pending) return; // double-submit guard
    setPending(true);
    setError(null);
    const res = await bffDeleteChild(child.profile_id);
    // "No such child" IS the success answer on this one path, and treating it
    // as a failure is what a slow delete looks like: the request times out
    // client-side while the server finishes the cascade, the parent presses
    // Delete again, and the second call finds the row already gone. The
    // endpoint answers `childNotFound` for exactly one situation — the student
    // row is ABSENT — whether its ownership gate or the core discovers it, and
    // the only thing that empties a row reached from this screen is this very
    // flow. Refusing here would leave a stale card on Home and tell a parent
    // their completed deletion had failed. Note the key is NOT `notYourChild`:
    // that one still means refused (a linked, non-creating parent), and still
    // reports as an error — and a malformed id gets its own key rather than
    // borrowing this one, so a bad request can never read as a deletion.
    if (!res.ok && res.error !== "auth.child.err.childNotFound") {
      setPending(false);
      // An i18n KEY the BFF chose — never a server sentence.
      setError(t(res.error));
      return;
    }
    // Invalidate BEFORE navigating: the Home list this screen returns to must
    // have dropped the card, not re-render a child that no longer exists. Both
    // keys, because this screen reads ["children"] while the parent surface
    // reads ["parent", "children"] — the same split the edit save already
    // handles above.
    invalidateParentData();
    void queryClient.invalidateQueries({ queryKey: ["children"] });
    showToast(t("mob.child.delete.done"), "ok");
    // replace(), not back(): this screen edits a profile that is gone and must
    // not stay in the back stack. `pending` deliberately stays true across the
    // transition, so nothing here can be fired twice on the way out.
    router.replace("/(parent)/(tabs)/home");
  }

  // KNOWN AND DIFFERENT hides the zone; UNRESOLVED does not. `profileId` is
  // read once at boot through `current_profile_id`, and that read SWALLOWS its
  // failures and answers null (features/auth/authStore.ts) — so a single
  // transient RPC hiccup used to hide this action for the whole session, with
  // no error and nothing to retry. The server is the authority either way: the
  // BFF re-checks authorship before it deletes anything and the core checks it
  // again, so rendering the zone on an unknown profile risks a refusal the
  // parent can read, while hiding it removes a legitimate action silently.
  if (myProfileId && child.created_by_parent_profile_id !== myProfileId) return null;

  return (
    <Card
      variant="flat"
      style={{
        gap: spacing.md,
        borderColor: tokens.danger,
        // Soft danger wash (6-digit hex + alpha byte) so the zone reads as
        // danger in both themes — the DangerZone construction, not a new colour.
        backgroundColor: /^#[0-9a-fA-F]{6}$/.test(tokens.danger)
          ? `${tokens.danger}12`
          : tokens.surface,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <TriangleAlert size={18} color={tokens.danger} strokeWidth={2} />
        <AppText
          variant="title"
          color={tokens.danger}
          style={{ flex: 1, minWidth: 0, fontSize: 16 }}
        >
          {t("prof2.danger")}
        </AppText>
      </View>
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("mob.child.delete.hint")}
      </AppText>
      <Button
        title={t("child.deleteChild")}
        variant="danger"
        icon={<Trash2 size={18} color="#ffffff" strokeWidth={2} />}
        onPress={() => setConfirmOpen(true)}
      />

      {/* The confirmation uses the sheet shell every parent sheet already uses.
          There is no Alert.alert anywhere in this app to mark an action
          "destructive" on, so the destructive weight is carried the way the
          rest of the app carries it: the danger Button variant and the
          danger-tinted heading. Cancel left, Delete right — the order of the
          web ConfirmModal this mirrors. */}
      <SheetShell visible={confirmOpen} onClose={close} closeLabel={t("profile.cancel")}>
        <AppText variant="title" color={tokens.danger}>
          {t("child.deleteChild")}
        </AppText>
        <AppText>{t("child.deleteConfirm")}</AppText>
        {/* Which child — the sheet covers the screen that said so. */}
        <AppText variant="muted">{childDisplayName(child)}</AppText>
        {error ? (
          <AppText accessibilityLiveRegion="polite" variant="muted" color={tokens.danger}>
            {error}
          </AppText>
        ) : null}
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Button
            title={t("profile.cancel")}
            variant="ghost"
            disabled={pending}
            style={{ flex: 1 }}
            onPress={close}
          />
          <Button
            title={t("child.deleteChild")}
            pendingTitle={t("mob.child.delete.pending")}
            variant="danger"
            pending={pending}
            style={{ flex: 1 }}
            onPress={() => void submit()}
          />
        </View>
      </SheetShell>
    </Card>
  );
}

export default function EditChildScreen() {
  const { t } = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const queryClient = useQueryClient();

  const childrenQ = useQuery({ queryKey: ["children"], queryFn: fetchChildren });
  const child = (childrenQ.data ?? []).find((c) => c.profile_id === id) ?? null;

  // The saved rayon is not part of the children list read — fetch it directly
  // (RLS scopes the row to the linked parent) so the field preselects.
  const rayonQ = useQuery({
    queryKey: ["child-rayon", id],
    enabled: !!child,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from("students")
        .select("city_district_id")
        .eq("profile_id", id)
        .maybeSingle();
      if (error) throw error;
      const v = (data as { city_district_id?: string | null } | null)?.city_district_id;
      return typeof v === "string" ? v : "";
    },
  });

  // Same gap as Add-Child: the four catalogs behind the selects are
  // admin-managed and cached for ten minutes, and this screen offered no way
  // to re-read them. The catalog hooks are observed HERE as well as inside the
  // form — one query key, one request — because the pull can only refetch what
  // it is handed.
  const citiesQ = useCities();
  const gradesQ = useGrades();
  const rayonsQ = useCityDistricts();
  const { refreshing, onRefresh } = usePullRefresh([
    childrenQ,
    child ? rayonQ : null,
    citiesQ,
    gradesQ,
    rayonsQ,
    // The school list is keyed by the city SELECTED INSIDE the form, which
    // this component does not hold. `type: "active"` refetches exactly the
    // mounted one instead of guessing the key.
    () => queryClient.refetchQueries({ queryKey: ["catalog", "schools"], type: "active" }),
  ]);

  if (childrenQ.isSuccess && !child) {
    // Unknown/foreign id — never render a form for someone else's child.
    return <Redirect href="/(parent)/(tabs)/home" />;
  }

  return (
    <Screen scroll refreshing={refreshing} onRefresh={onRefresh}>
      {childrenQ.isPending || (child && rayonQ.isPending) ? (
        <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
          <Skeleton height={20} width="70%" />
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : childrenQ.isError || rayonQ.isError ? (
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={() => {
            void childrenQ.refetch();
            void rayonQ.refetch();
          }}
        />
      ) : child ? (
        <View style={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}>
          <EditForm
            key={child.profile_id}
            child={child}
            initialCityDistrictId={rayonQ.data ?? ""}
          />
          <Button
            title={t("childedit.back")}
            variant="ghost"
            style={{ marginTop: spacing.lg }}
            onPress={() => router.back()}
          />
        </View>
      ) : null}
    </Screen>
  );
}
