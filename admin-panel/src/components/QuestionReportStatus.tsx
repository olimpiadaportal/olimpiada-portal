"use client";

// Status controls for one question report — modelled on NewsLifecycle: one
// bare <form> per action so SubmitButton can read useFormStatus and show a
// pending label, with the whitelisted action name in a hidden field. The server
// action maps that name to an enum value; nothing here is trusted.
//
// THREE OF THESE BUTTONS WRITE TO THE STUDENT. Since migration 117 an UPDATE
// that lands question_reports.status on in_review, resolved or dismissed fires
// a database trigger that notifies the reporter in the language they filed in.
// Nothing in this file sends it — a second, app-side emitter would be a second
// insert path and would double-notify. The UI's whole job here is to make sure
// the admin knows: the natural next move is the PRIMARY button, everything else
// is ghost, and the line underneath names which clicks are heard outside.
//
// TWO OF THEM NOW OPEN A COMPOSER FIRST (migration 122). Closing a report —
// "Həll olundu" or "Rədd et" — sends the student an answer the ADMIN writes, so
// those two buttons no longer act on click: they open the dialog below, where
// the body is typed and the finished message is previewed before anything is
// submitted. "Baxışa götür" and "Yenidən aç" are unchanged.
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  replyQuestionReport,
  transitionQuestionReport,
} from "@/lib/admin/questionReports";
import { ActionButton, SubmitButton } from "@/components/ActionButton";
import { Modal } from "@/components/Modal";
import {
  REPLY_MAX_LENGTH,
  buildReportReply,
  normalizeReportLocale,
  reportReplyClosing,
  reportReplyOpening,
  replyLength,
  trimReplyBody,
  validateReplyBody,
  type ReportReplyState,
} from "@/lib/admin/question-report-reply";

/** The two closing transitions, and the dialog title each one gets. */
type ReplyMode = "resolve" | "dismiss";

/** Every failure the dialog can show, mapped to its translated sentence. */
const ERROR_KEYS: Record<"too_short" | "too_long" | "already" | "failed", string> = {
  too_short: "report.reply.tooShort",
  too_long: "report.reply.tooLong",
  // The report moved to this status while the composer was open (a second
  // admin, or a double submit). The typed reply was NOT stored or sent, so
  // say so and name the way forward — reopen, then answer again.
  already: "report.reply.already",
  failed: "report.reply.failed",
};

export function QuestionReportStatus({
  id,
  status,
  /** false = anonymous or deleted reporter: nothing can be delivered. */
  notifiesReporter,
  /** question_reports.locale — the language the OPENING and CLOSING lines use. */
  reportLocale,
  /** question_reports.created_at — the filing moment named in the opening line. */
  createdAt,
  dict,
}: {
  id: string;
  status: string;
  notifiesReporter: boolean;
  reportLocale: string;
  createdAt: string;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [mode, setMode] = useState<ReplyMode | null>(null);
  const [busy, setBusy] = useState(false);

  const Action = ({
    action,
    label,
    primary = false,
  }: {
    action: string;
    label: string;
    primary?: boolean;
  }) => (
    <form action={transitionQuestionReport} style={{ display: "inline" }}>
      <input type="hidden" name="__id" value={id} />
      <input type="hidden" name="__action" value={action} />
      <SubmitButton
        className={primary ? "btn" : "btn-ghost"}
        pendingLabel={tt("pend.processing")}
      >
        {label}
      </SubmitButton>
    </form>
  );

  const OpenReply = ({
    replyMode,
    label,
    primary = false,
  }: {
    replyMode: ReplyMode;
    label: string;
    primary?: boolean;
  }) => (
    <button
      type="button"
      className={primary ? "btn" : "btn-ghost"}
      onClick={() => setMode(replyMode)}
    >
      {label}
    </button>
  );

  return (
    <div className="qrep-triage">
      <span className="qrep-triage-label">{tt("qrep.detail.actionsHeading")}</span>
      <div className="qrep-triage-row">
        {/* Only the moves that make sense from here, and the expected one first:
            an untouched report is picked up before it is closed, so "Start
            review" leads while it exists and "Mark resolved" leads after. An
            already-resolved report offers Reopen, never Resolve again. */}
        {status === "new" && (
          <Action action="in_review" label={tt("qrep.act.in_review")} primary />
        )}
        {(status === "new" || status === "in_review") && (
          <>
            <OpenReply
              replyMode="resolve"
              label={tt("qrep.act.resolve")}
              primary={status === "in_review"}
            />
            <OpenReply replyMode="dismiss" label={tt("qrep.act.dismiss")} />
          </>
        )}
        {(status === "resolved" || status === "dismissed") && (
          <Action action="reopen" label={tt("qrep.act.reopen")} />
        )}
      </div>
      <p className="hint">
        {notifiesReporter ? tt("qrep.notify.hint") : tt("qrep.notify.none")}
      </p>

      <Modal
        isOpen={mode !== null}
        onClose={() => setMode(null)}
        title={
          mode === "dismiss"
            ? tt("report.reply.titleRejected")
            : tt("report.reply.titleResolved")
        }
        closeLabel={tt("modal.close")}
        busy={busy}
        wide
      >
        {/* Keyed by mode and mounted only while the dialog is open, so the
            action state and the typed body reset on every open. A stale "too
            short" error, or a body left over from the report before this one,
            is not a message anybody meant to send. */}
        {mode && (
          <ReplyForm
            key={mode}
            id={id}
            mode={mode}
            reportLocale={reportLocale}
            createdAt={createdAt}
            dict={dict}
            onPendingChange={setBusy}
            onDone={() => setMode(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function ReplyForm({
  id,
  mode,
  reportLocale,
  createdAt,
  dict,
  onPendingChange,
  onDone,
}: {
  id: string;
  mode: ReplyMode;
  reportLocale: string;
  createdAt: string;
  dict: Record<string, string>;
  onPendingChange: (pending: boolean) => void;
  onDone: () => void;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [body, setBody] = useState("");
  const [state, formAction, pending] = useActionState<ReportReplyState, FormData>(
    replyQuestionReport,
    null,
  );

  // The frame is generated in the language of the REPORT, never the admin's
  // interface language: the student reads it, and they wrote to us in theirs.
  const locale = useMemo(() => normalizeReportLocale(reportLocale), [reportLocale]);
  const opening = useMemo(
    () => reportReplyOpening(locale, createdAt),
    [locale, createdAt],
  );
  const closing = reportReplyClosing(locale);
  // Assembled by the SAME module the server action validates with and the SQL
  // function is pinned to — see lib/admin/question-report-reply.ts.
  const preview = useMemo(
    () => buildReportReply({ locale, createdAt, body }),
    [locale, createdAt, body],
  );

  const check = validateReplyBody(body);
  // replyLength, not .length: the counter the admin watches must count the
  // same units the database enforces, or an emoji-bearing reply looks long
  // enough here and is rejected there.
  const trimmedLength = replyLength(check.ok ? check.body : trimReplyBody(body));
  // Only nag once the admin has actually started writing — an empty box that
  // shouts "too short" before the first keystroke is noise, not guidance.
  const localError = !check.ok && trimmedLength > 0 ? check.reason : null;
  const errorKey = localError ?? (state && !state.ok ? state.error : null);

  // `onPendingChange` is a useState setter (stable). The modal has to know:
  // while the reply is in flight it must not be dismissable by Escape, by the
  // overlay or by the × — the transaction behind it is already running.
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  useEffect(() => {
    if (state?.ok) onDone();
    // onDone is an inline arrow in the parent; depending on it would close the
    // dialog again on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="__id" value={id} />
      <input type="hidden" name="__action" value={mode} />

      {/* READ-ONLY, and static text rather than a disabled input: there is
          nothing here to edit, and a greyed-out field invites the attempt. */}
      {opening && <p className="qrep-reply-frame">{opening}</p>}

      <label className="field">
        <span className="field-label">{tt("report.reply.bodyLabel")}</span>
        <textarea
          name="__message"
          rows={6}
          value={body}
          maxLength={REPLY_MAX_LENGTH}
          placeholder={tt("report.reply.bodyPlaceholder")}
          disabled={pending}
          onChange={(e) => setBody(e.target.value)}
        />
        <span className="qrep-reply-count muted">
          {tt("report.reply.charCount")
            .split("{n}")
            .join(String(trimmedLength))
            .split("{max}")
            .join(String(REPLY_MAX_LENGTH))}
        </span>
      </label>

      <p className="qrep-reply-frame">{closing}</p>
      <small className="muted">{tt("report.reply.autoNote")}</small>

      {/* What the student will actually receive, assembled the same way the
          database assembles it. Rendered as a text child — React escapes it —
          with pre-wrap so the blank lines between the three parts are visible. */}
      {preview && trimmedLength > 0 && (
        <div className="qrep-reply-preview">
          <span className="qrep-reply-preview-label">{tt("report.reply.preview")}</span>
          <p>{preview}</p>
        </div>
      )}

      {errorKey && (
        <span className="form-error" role="alert">
          {tt(ERROR_KEYS[errorKey])}
        </span>
      )}

      <div className="row-actions" style={{ justifyContent: "flex-start" }}>
        <ActionButton
          className="btn"
          pending={pending}
          pendingLabel={tt("pend.sending")}
          disabled={!check.ok}
        >
          {tt("report.reply.send")}
        </ActionButton>
        <button
          type="button"
          className="btn-ghost"
          onClick={onDone}
          disabled={pending}
        >
          {tt("report.reply.cancel")}
        </button>
      </div>
    </form>
  );
}
