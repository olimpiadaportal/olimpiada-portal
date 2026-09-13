import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { Skeleton } from "@/components/StatusViews";
import { ScreenScroll } from "@/features/parent/ui";
import { bffChildLink, type ChildLinkState } from "@/lib/api";
import { useT } from "@/i18n/useT";
import { spacing } from "@/theme/tokens";

const EMPTY: ChildLinkState = { children: [], pending: [] };

export default function LinkChildScreen() {
  const { t } = useT();
  const [state, setState] = useState<ChildLinkState>(EMPTY);
  const [childId, setChildId] = useState("");
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState<{ code: string; childId: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await bffChildLink({ action: "state" });
    if (res.ok && "children" in res.data) setState(res.data as ChildLinkState);
    else if (!res.ok) setMessage(t(res.error));
    setLoading(false);
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  async function run(body: Record<string, unknown>) {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const res = await bffChildLink(body);
      if (!res.ok) { setMessage(t(res.error)); return; }
      if ("code" in res.data) {
        setIssued({ code: String(res.data.code), childId: String(res.data.childId) });
      }
      if (body.action === "redeem") { setChildId(""); setCode(""); }
      await load();
      setMessage(body.action === "redeem" ? t("link.pending") : t("link.success"));
    } finally { setPending(false); }
  }

  if (loading) return <ScreenScroll><Skeleton height={180} /><Skeleton height={180} /></ScreenScroll>;

  return (
    <ScreenScroll refreshing={pending} onRefresh={load}>
      <AppText variant="title">{t("link.title")}</AppText>
      <AppText variant="muted">{t("link.subtitle")}</AppText>
      <Card style={{ gap: spacing.md }}>
        <AppText variant="heading">{t("link.choice.existing")}</AppText>
        <TextField label={t("link.childId")} value={childId} keyboardType="number-pad" maxLength={8}
          autoComplete="off" importantForAutofill="no" onChangeText={(v) => setChildId(v.replace(/\D/g, "").slice(0, 8))} />
        <TextField label={t("link.code")} value={code} autoCapitalize="characters" maxLength={24}
          autoComplete="off" importantForAutofill="no" onChangeText={(v) => setCode(v.toUpperCase())} />
        <Button title={t("link.request")} pending={pending}
          disabled={childId.length !== 8 || code.replace(/[\s-]/g, "").length !== 20}
          onPress={() => void run({ action: "redeem", child_id: childId, code })} />
        {state.pending.length > 0 ? <AppText variant="muted">{t("link.pending")}</AppText> : null}
      </Card>

      {state.children.map((child) => (
        <Card key={child.id} style={{ gap: spacing.md }}>
          <AppText variant="heading">{child.name}</AppText>
          <AppText variant="muted">{child.child_id ?? ""}</AppText>
          <AppText variant="label">{child.is_creator ? t("link.owner") : t("link.linked")}</AppText>
          {child.is_creator ? (
            <>
              <Button title={t("link.issue")} variant="ghost" pending={pending}
                onPress={() => void run({ action: "issue", student_id: child.id })} />
              {issued?.childId === child.child_id ? (
                <View style={{ gap: spacing.sm }}>
                  <AppText variant="title" style={{ letterSpacing: 2 }}>{issued.code}</AppText>
                  <AppText variant="muted">{t("link.codeReady")}</AppText>
                  <Button title={t("parent.child.idCopy")} variant="ghost" onPress={() => void Clipboard.setStringAsync(issued.code)} />
                </View>
              ) : null}
              {child.invitations.map((invite) => (
                <View key={invite.id} style={{ gap: spacing.sm }}>
                  <AppText>{invite.status === "pending" ? `${invite.name ?? "—"} · ${invite.masked_email ?? ""}` : t("link.pending")}</AppText>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                    {invite.status === "pending" ? <Button title={t("link.approve")} pending={pending} onPress={() => void run({ action: "approve", invitation_id: invite.id })} /> : null}
                    <Button title={t("link.reject")} variant="ghost" pending={pending} onPress={() => void run({ action: invite.status === "pending" ? "reject" : "revokeInvite", invitation_id: invite.id })} />
                  </View>
                </View>
              ))}
              {child.adults.length === 0 ? <AppText variant="muted">{t("link.noAdults")}</AppText> : child.adults.map((adult) => (
                <View key={adult.parent_id} style={{ gap: spacing.sm }}>
                  <AppText>{adult.name ?? "—"}</AppText>
                  <Button title={t("link.revoke")} variant="ghost" pending={pending}
                    onPress={() => void run({ action: "revoke", student_id: child.id, parent_id: adult.parent_id })} />
                </View>
              ))}
            </>
          ) : (
            <Button title={t("link.leave")} variant="ghost" pending={pending}
              onPress={() => void run({ action: "leave", student_id: child.id })} />
          )}
        </Card>
      ))}
      {message ? <Card><AppText>{message}</AppText></Card> : null}
    </ScreenScroll>
  );
}
