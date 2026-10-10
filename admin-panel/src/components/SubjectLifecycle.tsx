"use client";

// Per-row publish / unpublish (Hide) / archive for a subject.
//
// Only the moves that are LEGAL FROM THE CURRENT STATUS are rendered, so the
// admin never sees a button that would be silently ignored. The server re-reads
// the status and re-checks the same whitelist before writing — this component
// decides what to SHOW, never what is allowed.
//
// EVERY OUTCOME IS SHOWN IN PLACE (2026-10-10). This used to be one plain form
// posting transitionSubject per button, and the action answered every
// refusal by returning nothing — so the only failure an admin could ever see
// was a crash into the panel's generic "an unexpected error occurred" page,
// which is what the owner hit when hiding a subject. Now:
//   * a refusal (stale row, publish without prices, failed write) comes back
//     as a translated message under the buttons;
//   * a request that cannot reach the server action at all — the classic case
//     is a tab opened before a deploy, whose action ids no longer exist on the
//     server — is caught here and answered with "reload the page", instead of
//     unmounting the whole screen;
//   * a success says what it means for families.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  transitionSubjectAction,
  type SubjectStatusState,
} from "@/lib/admin/subject-status";
import { ActionButton } from "@/components/ActionButton";

type Msg = { tone: "ok" | "error"; key: string; reload?: boolean } | null;

export function SubjectLifecycle({
  id,
  status,
  dict,
  sellable,
  returnTo = "list",
}: {
  id: string;
  status: string;
  dict: Record<string, string>;
  /**
   * Whether the subject has all three subjects_pricing rows.
   *
   * PUBLISHING AN UNPRICED SUBJECT PUBLISHES IT NOWHERE: /services, /register,
   * Add-Child and the subscribe screens all build their list from PRICED rows,
   * so an 'active' subject with no price is invisible to every family and says
   * so nowhere. The server refuses that publish (subject-status.ts); disabling
   * the button is only how the admin finds out BEFORE clicking. Left optional
   * so a caller that has not loaded pricing renders the button as before and
   * relies on the server's refusal.
   */
  sellable?: boolean;
  /** Which screen the buttons sit on (kept for the server's return paths). */
  returnTo?: "list" | "edit";
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  function run(action: string) {
    const fd = new FormData();
    fd.set("__id", id);
    fd.set("__action", action);
    fd.set("__return", returnTo);
    setMsg(null);
    setRunning(action);
    startTransition(async () => {
      let res: SubjectStatusState = null;
      try {
        res = await transitionSubjectAction(null, fd);
      } catch {
        // The action could not be reached or crashed on the way. The most
        // common cause is a page loaded before the latest deploy; a reload
        // fetches the current one. Nothing was written in that case.
        setMsg({ tone: "error", key: "subj.act.reload", reload: true });
        setRunning(null);
        return;
      }
      setRunning(null);
      if (res?.ok) {
        setMsg({ tone: "ok", key: `subj.act.done.${res.to}` });
        router.refresh();
      } else {
        setMsg({ tone: "error", key: res?.error ?? "subj.act.failed" });
        // A stale row means the page is out of date: show the current state.
        if (res?.error === "subj.act.stale") router.refresh();
      }
    });
  }

  const Action = ({
    action,
    label,
    danger,
    disabled,
    title,
  }: {
    action: string;
    label: string;
    danger?: boolean;
    disabled?: boolean;
    title?: string;
  }) => (
    <ActionButton
      type="button"
      className={danger ? "btn-ghost btn-danger-ghost" : "btn-ghost"}
      pending={pending && running === action}
      pendingLabel={tt("pend.processing")}
      disabled={disabled || pending}
      title={title}
      onClick={() => run(action)}
    >
      {label}
    </ActionButton>
  );

  const blockPublish = sellable === false;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {/* active   → hide, or archive
            inactive → publish, or archive
            archived → publish (archiving is reversible; that is the whole
                       point of keeping it distinct from delete) */}
        {(status === "inactive" || status === "archived") && (
          <Action
            action="publish"
            label={tt("subj.act.publish")}
            disabled={blockPublish}
            title={blockPublish ? tt("subj.publishNeedsPrices") : undefined}
          />
        )}
        {status === "active" && <Action action="unpublish" label={tt("subj.act.unpublish")} />}
        {(status === "active" || status === "inactive") && (
          <Action action="archive" label={tt("subj.act.archive")} danger />
        )}
      </div>
      {msg ? (
        <p
          className={msg.tone === "ok" ? "form-ok" : "form-error"}
          role={msg.tone === "ok" ? "status" : "alert"}
          style={{ margin: 0, whiteSpace: "normal", maxWidth: 360 }}
        >
          {tt(msg.key)}{" "}
          {msg.reload ? (
            <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>
              {tt("subj.act.reloadBtn")}
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
