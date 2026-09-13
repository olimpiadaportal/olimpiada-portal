"use client";

import { useState, useTransition } from "react";
import { childLinkMutationAction, childLinkStateAction } from "@/lib/auth/childLinkActions";
import type { ChildLinkMutationInput, ChildLinkState } from "@/lib/childLink";

type Dict = Record<string, string>;

export function ChildLinkPanel({ initial, dict }: { initial: ChildLinkState; dict: Dict }) {
  const [state, setState] = useState(initial);
  const [childId, setChildId] = useState("");
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState<{ code: string; childId: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const t = (key: string) => dict[key] ?? key;

  function run(input: ChildLinkMutationInput) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await childLinkMutationAction(input);
        if (!result.ok) {
          setMessage(t(result.errorKey));
          return;
        }
        if ("code" in result) setIssued({ code: result.code, childId: result.childId });
        if (input.action === "redeem") {
          setChildId("");
          setCode("");
        }
        setState(await childLinkStateAction());
        setMessage(input.action === "redeem" ? t("link.pending") : t("link.success"));
      } catch {
        setMessage(t("link.err.generic"));
      }
    });
  }

  async function copyIssuedCode() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setMessage(t("link.success"));
    } catch {
      setMessage(t("link.err.generic"));
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card stack" style={{ gap: 14 }}>
        <h2>{t("link.choice.existing")}</h2>
        <p className="muted">{t("link.subtitle")}</p>
        <label>
          <span>{t("link.childId")}</span>
          <input inputMode="numeric" autoComplete="off" maxLength={8} value={childId}
            onChange={(e) => setChildId(e.target.value.replace(/\D/g, "").slice(0, 8))} />
        </label>
        <label>
          <span>{t("link.code")}</span>
          <input autoCapitalize="characters" autoComplete="off" maxLength={24} value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </label>
        <button className="btn" disabled={pending || childId.length !== 8 || code.replace(/[\s-]/g, "").length !== 20}
          onClick={() => run({ action: "redeem", childId, code })}>{t("link.request")}</button>
        {state.pending.length > 0 ? <p className="muted">{t("link.pending")}</p> : null}
      </div>

      {state.children.map((child) => (
        <div className="card stack" style={{ gap: 12 }} key={child.id}>
          <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
            <div><h2>{child.name}</h2><p className="muted">{child.child_id}</p></div>
            <span className="pill">{child.is_creator ? t("link.owner") : t("link.linked")}</span>
          </div>
          {child.is_creator ? (
            <>
              <button className="btn secondary" disabled={pending} onClick={() => run({ action: "issue", studentId: child.id })}>
                {t("link.issue")}
              </button>
              {issued?.childId === child.child_id ? (
                <div className="notice success" role="status">
                  <strong style={{ letterSpacing: 2 }}>{issued.code}</strong>
                  <p>{t("link.codeReady")}</p>
                  <button className="btn secondary" type="button" onClick={() => void copyIssuedCode()}>
                    {t("parent.child.idCopy")}
                  </button>
                </div>
              ) : null}
              {child.invitations.map((invite) => (
                <div className="row" style={{ justifyContent: "space-between", gap: 12 }} key={invite.id}>
                  <span>{invite.status === "pending" ? `${invite.name ?? "—"} · ${invite.masked_email ?? ""}` : t("link.pending")}</span>
                  <span className="row" style={{ gap: 8 }}>
                    {invite.status === "pending" ? <button className="btn" disabled={pending} onClick={() => run({ action: "approve", invitationId: invite.id })}>{t("link.approve")}</button> : null}
                    <button className="btn secondary" disabled={pending} onClick={() => run({ action: invite.status === "pending" ? "reject" : "revokeInvite", invitationId: invite.id })}>{t("link.reject")}</button>
                  </span>
                </div>
              ))}
              {child.adults.length === 0 ? <p className="muted">{t("link.noAdults")}</p> : child.adults.map((adult) => (
                <div className="row" style={{ justifyContent: "space-between", gap: 12 }} key={adult.parent_id}>
                  <span>{adult.name ?? "—"}</span>
                  <button className="btn secondary" disabled={pending} onClick={() => run({ action: "revoke", studentId: child.id, parentId: adult.parent_id })}>{t("link.revoke")}</button>
                </div>
              ))}
            </>
          ) : (
            <button className="btn secondary" disabled={pending} onClick={() => run({ action: "leave", studentId: child.id })}>{t("link.leave")}</button>
          )}
        </div>
      ))}
      {message ? <p className="notice" role="status">{message}</p> : null}
    </div>
  );
}
