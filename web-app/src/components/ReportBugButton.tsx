"use client";

// "Report a bug" (migration 116) — ONE control + dialog, mounted a single time
// inside <ContactInfo>. Because that component is the shared contact body, this
// lands on the public /contact page, the parent /help/contact page and the
// student /child/help/contact page with no per-surface code.
//
// Modelled on ReportQuestionButton (migration 115) so the two report dialogs
// behave identically: the shared <Modal> primitive (portal, Escape, focus trap,
// scroll lock, arena palette mirroring), an `inFlight` ref latch rather than the
// pending STATE as the double-submit guard, and success as an in-place
// transition inside the same dialog instead of a toast the app has no
// infrastructure for.
//
// MODAL FOCUS TRAP, the bug that shipped here before: <Modal>'s effect depends
// on [isOpen, onClose], and every re-render of this component would create a new
// onClose identity, tearing the effect down and re-running `panel.focus()` —
// which steals focus from the field after the FIRST keystroke. `close` is
// therefore a useCallback with an empty dep list and reads the latch through a
// ref. Do not inline an arrow into onClose, and do not add state to its deps.
import { useCallback, useId, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { submitBugReport } from "@/lib/support/bugReportActions";
import {
  BUG_ACTUAL_MAX,
  BUG_DESCRIPTION_MAX,
  BUG_DESCRIPTION_MIN,
  BUG_EMAIL_MAX,
  BUG_EXPECTED_MAX,
  BUG_SEVERITIES,
  BUG_STEPS_MAX,
  BUG_TITLE_MAX,
  BUG_TITLE_MIN,
  type BugReportSurface,
  type BugSeverity,
} from "@/lib/support/bugReport";

const EMPTY_FORM = {
  title: "",
  description: "",
  steps: "",
  expected: "",
  actual: "",
  severity: "normal" as BugSeverity,
  email: "",
};

export function ReportBugButton({
  dict,
  surface,
}: {
  dict: Record<string, string>;
  surface: BugReportSurface;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // The honeypot lives in a ref, not in state: nothing re-renders when a bot
  // fills it, and a human never sees or tabs into it.
  const honeypotRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  // A second Enter/click can fire before React re-renders and the `disabled`
  // attribute lands, so the latch — not `pending` — is what prevents a double
  // submit.
  const inFlight = useRef(false);

  // Empty deps + a ref read: a new identity on every keystroke would re-run
  // Modal's effect and pull focus out of the field being typed into.
  const close = useCallback(() => {
    // While a request is in flight the overlay, Escape and × are all inert —
    // abandoning mid-submit leaves the reporter unsure whether it was filed.
    if (inFlight.current) return;
    setOpen(false);
  }, []);

  function openDialog() {
    setForm(EMPTY_FORM);
    setError(null);
    setSent(false);
    setOpen(true);
  }

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  }

  // Only the public (signed-out) surface asks for an address. A signed-in
  // parent's account email is what the database trigger stamps on the row, so
  // the field would be ignored — and a CHILD must never be asked for an email
  // at all (children never enter one anywhere in the product).
  const asksForEmail = surface === "public";

  async function submit() {
    if (inFlight.current) return;
    // Client-side mirror of normalizeBugReport()'s minimums, so the reporter is
    // told before a round trip. The server check is the real gate.
    const title = form.title.trim();
    const description = form.description.trim();
    if (title.length < BUG_TITLE_MIN || description.length < BUG_DESCRIPTION_MIN) {
      setError(tt("bug.emptyErr"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await submitBugReport({
        title,
        description,
        steps: form.steps,
        expected: form.expected,
        actual: form.actual,
        severity: form.severity,
        // The PATH only. The server strips the query and the fragment again —
        // /auth/callback?code=… is where credentials live — but sending the
        // pathname alone means they never leave the browser in the first place.
        routePath: typeof window === "undefined" ? "" : window.location.pathname,
        contactEmail: asksForEmail ? form.email : "",
        website: honeypotRef.current?.value ?? "",
      });
      if (res.ok) setSent(true);
      else setError(tt(res.errorKey));
    } catch {
      setError(tt("bug.err.generic"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const remaining = (n: number) => tt("bug.remaining").replace("{n}", String(n));

  return (
    <>
      <button type="button" className="btn-ghost" onClick={openDialog}>
        {tt("contact.bugCta")}
      </button>

      <Modal
        isOpen={open}
        onClose={close}
        title={sent ? tt("bug.successTitle") : tt("bug.title")}
        closeLabel={tt("bug.close")}
      >
        {sent ? (
          <>
            <p className="modal-message">{tt("bug.successBody")}</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                {tt("bug.close")}
              </button>
            </div>
          </>
        ) : (
          // A real <form> so Enter in the title field submits, as a keyboard
          // user expects. `noValidate` because the browser's own bubble for
          // `required` is untranslated and would replace our trilingual
          // message — the attributes stay for assistive tech.
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <p className="modal-message">{tt("bug.intro")}</p>

            <label className="tst-report-label-text" htmlFor={`${ids}-title`}>
              {tt("bug.f.title.label")}
            </label>
            <input
              id={`${ids}-title`}
              className="bug-input"
              type="text"
              maxLength={BUG_TITLE_MAX}
              value={form.title}
              placeholder={tt("bug.f.title.ph")}
              disabled={pending}
              required
              onChange={(e) => set("title", e.target.value)}
            />

            <label className="tst-report-label-text" htmlFor={`${ids}-desc`}>
              {tt("bug.f.description.label")}
            </label>
            <textarea
              id={`${ids}-desc`}
              className="tst-report-input"
              rows={4}
              maxLength={BUG_DESCRIPTION_MAX}
              value={form.description}
              placeholder={tt("bug.f.description.ph")}
              disabled={pending}
              required
              onChange={(e) => set("description", e.target.value)}
            />
            <p className="tst-report-count mono">
              {remaining(BUG_DESCRIPTION_MAX - form.description.length)}
            </p>

            <label className="tst-report-label-text" htmlFor={`${ids}-steps`}>
              {tt("bug.f.steps.label")}
            </label>
            <textarea
              id={`${ids}-steps`}
              className="tst-report-input bug-short"
              rows={3}
              maxLength={BUG_STEPS_MAX}
              value={form.steps}
              placeholder={tt("bug.f.steps.ph")}
              disabled={pending}
              onChange={(e) => set("steps", e.target.value)}
            />

            <div className="bug-grid">
              <div>
                <label className="tst-report-label-text" htmlFor={`${ids}-expected`}>
                  {tt("bug.f.expected.label")}
                </label>
                <textarea
                  id={`${ids}-expected`}
                  className="tst-report-input bug-short"
                  rows={2}
                  maxLength={BUG_EXPECTED_MAX}
                  value={form.expected}
                  placeholder={tt("bug.f.expected.ph")}
                  disabled={pending}
                  onChange={(e) => set("expected", e.target.value)}
                />
              </div>
              <div>
                <label className="tst-report-label-text" htmlFor={`${ids}-actual`}>
                  {tt("bug.f.actual.label")}
                </label>
                <textarea
                  id={`${ids}-actual`}
                  className="tst-report-input bug-short"
                  rows={2}
                  maxLength={BUG_ACTUAL_MAX}
                  value={form.actual}
                  placeholder={tt("bug.f.actual.ph")}
                  disabled={pending}
                  onChange={(e) => set("actual", e.target.value)}
                />
              </div>
            </div>

            <label className="tst-report-label-text" htmlFor={`${ids}-severity`}>
              {tt("bug.f.severity.label")}
            </label>
            <select
              id={`${ids}-severity`}
              className="bug-input"
              value={form.severity}
              disabled={pending}
              onChange={(e) => set("severity", e.target.value as BugSeverity)}
            >
              {BUG_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {tt(`bug.sev.${s}`)}
                </option>
              ))}
            </select>

            {asksForEmail && (
              <>
                <label className="tst-report-label-text" htmlFor={`${ids}-email`}>
                  {tt("bug.f.email.label")}
                </label>
                <input
                  id={`${ids}-email`}
                  className="bug-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={BUG_EMAIL_MAX}
                  value={form.email}
                  placeholder={tt("bug.f.email.ph")}
                  disabled={pending}
                  aria-describedby={`${ids}-email-help`}
                  onChange={(e) => set("email", e.target.value)}
                />
                <p className="bug-hint" id={`${ids}-email-help`}>
                  {tt("bug.f.email.help")}
                </p>
              </>
            )}

            {/* Honeypot: hidden from sight, from the tab order and from
                assistive tech, so only a form-filling bot ever populates it.
                The server answers a filled one with a FAKE success. */}
            <div className="bug-hp" aria-hidden="true">
              <input
                ref={honeypotRef}
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                defaultValue=""
              />
            </div>

            <p className="bug-hint">{tt("bug.contextNote")}</p>

            {/* Not .arena-error: that rule paints from --red, declared only
                inside .arena, and this dialog is portaled to <body>. The root
                --danger token used by .tst-report-error is visible in every
                theme and every palette. */}
            {error && (
              <p className="tst-report-error" role="alert">
                {error}
              </p>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={close} disabled={pending}>
                {tt("bug.cancel")}
              </button>
              <button type="submit" className="btn" disabled={pending}>
                {pending ? tt("bug.sending") : tt("bug.submit")}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
