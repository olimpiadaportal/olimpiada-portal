"use client";

// Per-row publish / unpublish / archive for a subject.
//
// Only the moves that are LEGAL FROM THE CURRENT STATUS are rendered, so the
// admin never sees a button that would be silently ignored. The server re-reads
// the status and re-checks the same whitelist before writing — this component
// decides what to SHOW, never what is allowed.
//
// Same shape as NewsLifecycle: one tiny form per action, posting to a server
// action, so it works without client-side state and survives a failed request
// by simply re-rendering the unchanged row.
import { transitionSubject } from "@/lib/admin/subject-status";
import { SubmitButton } from "@/components/ActionButton";

export function SubjectLifecycle({
  id,
  status,
  dict,
}: {
  id: string;
  status: string;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;

  const Action = ({
    action,
    label,
    danger,
  }: {
    action: string;
    label: string;
    danger?: boolean;
  }) => (
    <form action={transitionSubject} style={{ display: "inline" }}>
      <input type="hidden" name="__id" value={id} />
      <input type="hidden" name="__action" value={action} />
      <SubmitButton
        className={danger ? "btn-ghost btn-danger-ghost" : "btn-ghost"}
        pendingLabel={tt("pend.processing")}
      >
        {label}
      </SubmitButton>
    </form>
  );

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {/* active   → hide, or archive
          inactive → publish, or archive
          archived → publish (archiving is reversible; that is the whole point
                     of keeping it distinct from delete) */}
      {(status === "inactive" || status === "archived") && (
        <Action action="publish" label={tt("subj.act.publish")} />
      )}
      {status === "active" && (
        <Action action="unpublish" label={tt("subj.act.unpublish")} />
      )}
      {(status === "active" || status === "inactive") && (
        <Action action="archive" label={tt("subj.act.archive")} danger />
      )}
    </div>
  );
}
