// Existing-child access for a second adult (web /children/link parity).
//
// THIS USED TO NOMINATE. The parent typed the child's 8-digit id plus a
// one-time code the creating parent had generated, which raised a request that
// parent then approved. The owner removed approval on 2026-09-16 (migration
// 177) after the flow completed ZERO links in production — issuing a second
// code revoked the redemption already waiting for approval, so a parent who
// retried destroyed their own request. A parent now proves they may reach the
// child by entering that CHILD's own credentials, and the grant is immediate.
//
// WHAT WENT WITH THE APPROVAL STEP: issue-code, approve and reject are dead
// concepts and their UI is gone. Revoke and leave are NOT — a creator must
// still be able to take access away, and a linked adult must still be able to
// walk away — so both remain on the manage_child_link RPC they always used.
//
// THE PASSWORD IS A CHILD'S CREDENTIAL, NOT A FORM VALUE. It is cleared in a
// `finally`, so EVERY outcome clears it: success, rejection, and a throw alike.
// A wrong entry must not sit in the field waiting to be resubmitted, and a
// correct one has done its job. Nothing about this pair is autofilled either —
// `purpose="none"` plus ChildIdField's own exclusion — because it is a MINOR's
// account number and the PARENT's password filed against the same app domain as
// the parent's real credential; the full reasoning is in PASSWORD_AUTOFILL,
// components/TextField.tsx.
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ChildIdField, PasswordField } from "@/components/TextField";
import { Skeleton } from "@/components/StatusViews";
import { Pill, ScreenScroll, SectionTitle } from "@/features/parent/ui";
import {
  bffChildAccessAdults,
  bffChildLinkByCredentials,
  bffChildLinkManage,
  bffChildLinkState,
  type ChildAccessAdult,
  type ChildLinkState,
} from "@/lib/api";
import { formatShortDate } from "@/lib/formatDate";
import { useFieldChain } from "@/lib/useFieldChain";
import { useT } from "@/i18n/useT";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";

const EMPTY: ChildLinkState = { children: [] };

/** How an adult is named in the access list: the structured parts when we have
 *  them, else the display name migration 177 derived them from. */
function adultLabel(adult: ChildAccessAdult): string {
  const parts = [adult.first_name, adult.last_name].filter(Boolean).join(" ").trim();
  return parts || adult.display_name || "—";
}

export default function LinkChildScreen() {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const [state, setState] = useState<ChildLinkState>(EMPTY);
  // studentProfileId -> the adults who can reach that child.
  const [access, setAccess] = useState<Record<string, ChildAccessAdult[]>>({});
  const [childId, setChildId] = useState("");
  const [password, setPassword] = useState("");
  // i18n KEYS, not rendered sentences — the locale can change while a message
  // is on screen and the message has to follow it (login.tsx does the same).
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await bffChildLinkState();
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    const next = res.data;
    setState(next);
    // One caller-scoped call per child. Issued together rather than in
    // sequence: four children on a slow connection is four round-trips either
    // way, but only one wait. A child whose list fails simply shows none —
    // never a reason to fail the whole screen.
    const lists = await Promise.all(next.children.map((c) => bffChildAccessAdults(c.id)));
    const map: Record<string, ChildAccessAdult[]> = {};
    next.children.forEach((child, i) => {
      const row = lists[i];
      if (row?.ok) map[child.id] = row.data.adults;
    });
    setAccess(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCredentials() {
    if (pending) return;
    // Client-side shape only — the BFF re-validates both fields before any
    // privileged call and is the boundary that counts.
    if (childId.length !== 8) {
      setError("auth.child.err.idFormat");
      return;
    }
    if (!password) {
      setError("auth.child.err.passwordRequired");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await bffChildLinkByCredentials(childId, password);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setChildId("");
      await load();
      setNotice("link.linkedNotice");
    } finally {
      // EVERY outcome, a throw included: this field must not still hold a
      // child's password when this function returns.
      setPassword("");
      setPending(false);
    }
  }

  async function manage(body: Record<string, unknown>) {
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await bffChildLinkManage(body);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await load();
      setNotice("link.success");
    } finally {
      setPending(false);
    }
  }

  // ONE contiguous run of text inputs, so "Done" on the password submits. The
  // iOS number pad has no return key, so the 8th digit landing is what advances
  // to the password (ChildIdField's rising-edge `onComplete`).
  const chain = useFieldChain(2, {
    onLast: () => {
      if (!pending) void submitCredentials();
    },
  });

  if (loading) {
    return (
      <ScreenScroll>
        <Skeleton height={220} />
        <Skeleton height={180} />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll refreshing={pending} onRefresh={load}>
      <AppText variant="muted">{t("mob.link.intro")}</AppText>

      <Card style={{ gap: spacing.lg }}>
        <ChildIdField
          {...chain.field(0)}
          label={t("link.childId")}
          placeholder={t("mob.childIdPh")}
          value={childId}
          onChangeDigits={setChildId}
          onComplete={() => chain.focus(1)}
        />
        <PasswordField
          {...chain.field(1)}
          label={t("link.childPassword")}
          value={password}
          onChangeText={setPassword}
          showLabel={t("mob.pw.show")}
          hideLabel={t("mob.pw.hide")}
          purpose="none"
        />
        <AppText variant="muted">{t("link.credentialsHint")}</AppText>
        {error ? (
          <AppText variant="muted" color={tokens.danger}>
            {t(error)}
          </AppText>
        ) : null}
        {notice ? (
          <AppText variant="muted" color={tokens.ok}>
            {t(notice)}
          </AppText>
        ) : null}
        <Button
          title={t("link.request")}
          variant="gradient"
          pending={pending}
          disabled={childId.length !== 8 || password.length === 0}
          onPress={() => void submitCredentials()}
        />
      </Card>

      {state.children.length > 0 ? <SectionTitle>{t("link.manage")}</SectionTitle> : null}

      {state.children.map((child) => {
        const adults = access[child.id] ?? [];
        return (
          <Card key={child.id} style={{ gap: spacing.md }}>
            {/* Identity row: the name cell grows and wraps, the pill shrinks —
                never the other way round on a 320pt screen. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="subtitle" numberOfLines={2}>
                  {child.name}
                </AppText>
                {child.child_id ? <AppText variant="mono">{child.child_id}</AppText> : null}
              </View>
              <Pill
                label={child.is_creator ? t("link.owner") : t("link.linked")}
                tone={child.is_creator ? "accent" : "muted"}
              />
            </View>

            <AppText variant="label">{t("link.access.title")}</AppText>
            {adults.length === 0 ? (
              <AppText variant="muted">{t("link.noAdults")}</AppText>
            ) : (
              adults.map((adult) => (
                <View key={adult.profile_id} style={{ gap: spacing.xs }}>
                  <AppText numberOfLines={2}>{adultLabel(adult)}</AppText>
                  {adult.email ? (
                    // Middle ellipsis: a truncated address keeps its domain,
                    // which is what tells two adults apart at a glance.
                    <AppText variant="muted" numberOfLines={1} ellipsizeMode="middle">
                      {adult.email}
                    </AppText>
                  ) : null}
                  <AppText variant="muted">
                    {adult.role === "creator" ? t("link.access.creator") : t("link.access.linked")}
                    {adult.since ? ` · ${t("link.access.since")} ${formatShortDate(adult.since, locale)}` : ""}
                  </AppText>
                  {/* Only the creator revokes, and never the creator's own row:
                      manage_child_link refuses both anyway, so this keeps the UI
                      from offering a button the server will decline. */}
                  {child.is_creator && adult.role === "linked" ? (
                    <Button
                      title={t("link.revoke")}
                      variant="ghost"
                      pending={pending}
                      onPress={() =>
                        void manage({
                          action: "revoke",
                          student_id: child.id,
                          parent_id: adult.profile_id,
                        })
                      }
                    />
                  ) : null}
                </View>
              ))
            )}

            {child.is_creator ? null : (
              <Button
                title={t("link.leave")}
                variant="ghost"
                pending={pending}
                onPress={() => void manage({ action: "leave", student_id: child.id })}
              />
            )}
          </Card>
        );
      })}
    </ScreenScroll>
  );
}
