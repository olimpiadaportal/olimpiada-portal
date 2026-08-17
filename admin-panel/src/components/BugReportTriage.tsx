"use client";

// Triage controls for one bug report — modelled on QuestionReportStatus, which
// is in turn modelled on NewsLifecycle: one bare <form> per control so
// SubmitButton can read useFormStatus and show a pending label for the control
// the admin actually pressed. The whitelisted action name travels in a hidden
// field and the server action maps it to an enum value; nothing here is
// trusted, and nothing here can move a column the freeze trigger protects.
import { updateBugReport } from "@/lib/admin/bugReports";
import { SubmitButton } from "@/components/ActionButton";
import { BUG_PRIORITIES } from "@/lib/admin/bug-report-meta";

export function BugReportTriage({
  id,
  status,
  priority,
  note,
  dict,
}: {
  id: string;
  status: string;
  priority: string;
  note: string | null;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;

  const Action = ({ action, label }: { action: string; label: string }) => (
    <form action={updateBugReport} style={{ display: "inline" }}>
      <input type="hidden" name="__id" value={id} />
      <input type="hidden" name="__action" value={action} />
      <SubmitButton className="btn-ghost" pendingLabel={tt("pend.processing")}>
        {label}
      </SubmitButton>
    </form>
  );

  return (
    <div className="brep-triage">
      <div className="brep-triage-row">
        {/* Only the moves that make sense from here: an already-resolved report
            offers Reopen, never Resolve again. */}
        {status === "new" && <Action action="in_review" label={tt("brep.act.in_review")} />}
        {(status === "new" || status === "in_review") && (
          <>
            <Action action="resolve" label={tt("brep.act.resolve")} />
            <Action action="dismiss" label={tt("brep.act.dismiss")} />
          </>
        )}
        {(status === "resolved" || status === "dismissed") && (
          <Action action="reopen" label={tt("brep.act.reopen")} />
        )}
      </div>

      {/* Priority is the ADMIN's triage value, always born 'normal'. The
          reporter's own severity claim is displayed above and is not editable
          here — the freeze trigger would restore it anyway. */}
      <form action={updateBugReport} className="brep-triage-row">
        <input type="hidden" name="__id" value={id} />
        <input type="hidden" name="__action" value="priority" />
        <label className="brep-triage-label" htmlFor={`prio-${id}`}>
          {tt("brep.field.priority")}
        </label>
        <select id={`prio-${id}`} name="priority" defaultValue={priority}>
          {BUG_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {tt(`brep.priority.${p}`)}
            </option>
          ))}
        </select>
        <SubmitButton className="btn-ghost" pendingLabel={tt("pend.processing")}>
          {tt("brep.act.savePriority")}
        </SubmitButton>
      </form>

      <form action={updateBugReport} className="brep-triage-note">
        <input type="hidden" name="__id" value={id} />
        <input type="hidden" name="__action" value="note" />
        <label className="brep-triage-label" htmlFor={`note-${id}`}>
          {tt("brep.field.adminNote")}
        </label>
        <textarea
          id={`note-${id}`}
          name="admin_note"
          rows={4}
          maxLength={2000}
          defaultValue={note ?? ""}
          placeholder={tt("brep.detail.notePlaceholder")}
        />
        <SubmitButton className="btn-ghost" pendingLabel={tt("pend.processing")}>
          {tt("brep.act.saveNote")}
        </SubmitButton>
      </form>
    </div>
  );
}
