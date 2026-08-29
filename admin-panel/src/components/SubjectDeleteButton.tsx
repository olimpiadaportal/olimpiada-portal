"use client";

// Subject deletion — the three answers to "this subject should not be here",
// in one dialog that says which is which.
//
// WHY THIS IS NOT THE SHARED DestructiveConfirmDialog ANY MORE. It used to be,
// and the shared dialog is still right for the olympiad package, the olympiad
// grade pool and the bulk pool delete: those are ONE destructive branch (plus a
// purge) with no safe alternative. A subject has a safe alternative, and it is
// the one an admin should almost always take — every one of the ten refusal
// sentences the database returns ends with "archive the subject instead". Yet
// Archive lived on the LIST ROW, outside the dialog, so the screen that
// explained why deleting was refused could not offer the thing it recommended.
// That is the "the difference between deleting questions, archiving a subject
// and deleting a subject is not presented clearly" complaint, and no amount of
// restyling the shared dialog fixes it without giving every other caller a
// concept it does not have.
//
// The shared component is left untouched; this file borrows its rules instead:
//   - the counts are re-fetched on open and after every mutation, so the
//     numbers on screen are never a stale argument for the click below them;
//   - refusals are finished sentences that each name a reason AND a way out;
//   - friction never reaches zero — a typed word plus an acknowledgement;
//   - the typed word is never what the database compares (see below).
//
// VISUAL GRAMMAR, borrowed from the two delete dialogs the panel already
// agrees on (LocationsExplorer > DeleteConfirm, CurriculumTree > DeleteConfirm):
// neutral bordered chips for impact, ONE amber callout for a refusal, the
// irreversible line as small muted text. Red is spent on exactly one control —
// the terminal delete. The bank purge is amber, because it is the panel's
// existing idiom for "destructive but recoverable" (LeaderboardResetControls
// uses btn-warn for a permanent ledger wipe) and because two identical red
// buttons is precisely what made the old dialog unreadable.
import {
  useActionState,
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { ActionButton } from "@/components/ActionButton";
import {
  deleteSubject,
  loadSubjectDeletionPreview,
  purgeSubjectQuestions,
  type SubjectDeletionPreview,
} from "@/lib/admin/subject-deletion";
import { transitionSubject } from "@/lib/admin/subject-status";
import { SUBJECT_DELETE_WORD } from "@/lib/admin/subject-delete-word";
import { fillTemplate } from "@/lib/admin/olympiad-per-attempt";
import type { DestructiveState } from "@/lib/admin/deletion-hints";

/**
 * The copy this dialog needs.
 *
 * The first block is what the previous (shared-dialog) version already
 * required, kept required so the generic /manage/[resource] list — which still
 * has a `subjects` branch even though the dedicated /manage/subjects route now
 * shadows it — keeps compiling. Everything the redesign added is OPTIONAL and
 * the section that needs it is simply not rendered when it is missing, rather
 * than falling back to an untranslated literal. The dedicated Subjects screens
 * pass all of it.
 */
export type SubjectDeleteStrings = {
  open: string;
  title: string;
  loading: string;
  loadFailed: string;
  blockedTitle?: string;
  warnTitle: string;
  irreversible: string;
  codeLabel?: string;
  codeHint?: string;
  ackLabel: string;
  cancel: string;
  close: string;
  working: string;
  questions: string;
  cascade: string;
  purgeTitle: string;
  purgeDesc: string;
  purgeAction: string;
  deleteTitle: string;
  deleteDesc: string;
  deleteAction: string;

  // ---- added by the redesign (all optional; see the doc comment above) ----
  intro?: string;
  impact?: string;
  impactQuestions?: string;
  impactTopics?: string;
  impactRounds?: string;
  impactSubscribers?: string;
  archiveTitle?: string;
  archiveDesc?: string;
  archiveAction?: string;
  archivedAlready?: string;
  recommended?: string;
  confirmHeading?: string;
  confirmIntro?: string;
  gateHint?: string;
  wordMismatch?: string;
  purgeEmpty?: string;
  outcomeArchive?: string;
  outcomeDelete?: string;
  archiving?: string;
};

// ---------------------------------------------------------------------------
// Icons. 16px, stroke-only, currentColor — the same drawing style as the
// modal's own × (Modal.tsx). Decorative: every one of them sits beside a text
// label, so they are aria-hidden.
// ---------------------------------------------------------------------------
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      {children}
    </svg>
  );
}

const ArchiveIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
  </Icon>
);

const BroomIcon = () => (
  <Icon>
    <path d="M4 20h16M6 20l3-8h6l3 8M12 12V4M9 7h6" />
  </Icon>
);

const TrashIcon = () => (
  <Icon>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6M10 11v6M14 11v6" />
  </Icon>
);

// A section of the dialog: an icon + title row, a muted explanation, then
// whatever the branch needs. `accent` paints the left rule — the panel's
// existing "dangerous area" grammar (.setting-card-warn), never a filled block.
function Section({
  icon,
  title,
  badge,
  description,
  accent,
  children,
}: {
  icon?: ReactNode;
  title: string;
  badge?: ReactNode;
  description?: string;
  accent?: "warn" | "danger";
  children?: ReactNode;
}) {
  const accentStyle =
    accent === "danger"
      ? {
          borderColor: "#fecaca",
          background: "#fffbfb",
          boxShadow: "inset 3px 0 0 #dc2626, 0 1px 2px rgba(16, 24, 40, 0.04)",
        }
      : undefined;
  return (
    <section
      className={accent === "warn" ? "card setting-card-warn" : "card"}
      style={{ padding: "14px 16px", ...accentStyle }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: description ? 6 : 10,
          flexWrap: "wrap",
        }}
      >
        {icon}
        <strong style={{ fontSize: "0.95rem" }}>{title}</strong>
        {badge}
      </div>
      {description && <p className="setting-card-desc">{description}</p>}
      {children}
    </section>
  );
}

export function SubjectDeleteButton({
  id,
  strings,
  triggerClassName = "link-danger",
}: {
  id: string;
  strings: SubjectDeleteStrings;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<SubjectDeletionPreview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const [refreshKey, setRefreshKey] = useState(0);
  const [typed, setTyped] = useState("");
  const [ack, setAck] = useState(false);
  const [archiving, startArchive] = useTransition();

  const [purgeState, purgeFormAction, purgePending] = useActionState<
    DestructiveState,
    FormData
  >(purgeSubjectQuestions, null);
  const [deleteState, deleteFormAction, deletePending] = useActionState<
    DestructiveState,
    FormData
  >(deleteSubject, null);

  const busy = purgePending || deletePending || archiving;
  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  // A RESULT BELONGS TO THE SESSION THAT PRODUCED IT. useActionState has no
  // reset, and the dialog outlives its own success in one real case: when the
  // database ARCHIVES the subject instead of deleting it, the row survives, so
  // reopening this same dialog would show last time's green message and none of
  // the controls. Each open gets a session number and a result is rendered only
  // while it still matches.
  const [session, setSession] = useState(0);
  const [purgeSession, setPurgeSession] = useState(-1);
  const [deleteSession, setDeleteSession] = useState(-1);
  useEffect(() => {
    if (purgeState) setPurgeSession(session);
    // `session` is deliberately not a dependency: this must fire when a RESULT
    // arrives, not when a new session starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purgeState]);
  useEffect(() => {
    if (deleteState) setDeleteSession(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteState]);
  const purgeResult = purgeSession === session ? purgeState : null;
  const deleteResult = deleteSession === session ? deleteState : null;

  // Re-fetched on every open AND after every mutation: the counts ARE the
  // argument for the click that follows them.
  useEffect(() => {
    if (!open) return;
    setLoadFailed(false);
    startLoading(async () => {
      const p = await loadSubjectDeletionPreview(id);
      if (p) setPreview(p);
      else setLoadFailed(true);
    });
    // loadSubjectDeletionPreview is a server-action reference recreated on
    // every render; depending on it would refetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey]);

  // The purge changed the counts AND may have unblocked the delete, so the
  // second branch must never be offered on the numbers that were true before it.
  useEffect(() => {
    if (!purgeResult?.ok) return;
    router.refresh();
    refresh();
  }, [purgeResult, refresh, router]);

  // The delete is deliberately NOT followed by a preview refetch: the row it
  // describes may be gone, and "load failed" is a terrible way to report a
  // success. The list underneath is refreshed and the outcome stays on screen
  // until the admin closes the dialog — which matters here, because the
  // database may have ARCHIVED the subject instead of deleting it.
  useEffect(() => {
    if (!deleteResult?.ok) return;
    router.refresh();
  }, [deleteResult, router]);

  const codeOk = typed === SUBJECT_DELETE_WORD;
  const gateOpen = codeOk && ack;
  const done = Boolean(deleteResult?.ok);

  const close = () => setOpen(false);

  const archive = (subjectId: string) => {
    const fd = new FormData();
    fd.set("__id", subjectId);
    fd.set("__action", "archive");
    startArchive(async () => {
      await transitionSubject(fd);
      router.refresh();
      refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => {
          // Both frictions reset on every open: a word still sitting in the box
          // from the previous subject is not a confirmation of this one.
          setTyped("");
          setAck(false);
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        {strings.open}
      </button>

      <Modal
        isOpen={open}
        onClose={close}
        title={
          preview ? `${strings.title} — ${preview.name}` : strings.title
        }
        closeLabel={strings.close}
        busy={busy}
      >
        {loading && !preview && <p className="muted">{strings.loading}</p>}
        {loadFailed && !preview && (
          <p className="form-error" role="alert">
            {strings.loadFailed}
          </p>
        )}

        {preview && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {done ? (
              // Nothing is offered any more — the outcome is the whole content.
              <p className="form-ok" role="status">
                {deleteResult?.ok ? deleteResult.message : ""}
              </p>
            ) : (
              <>
                {strings.intro && (
                  <p className="loc-delete-question" style={{ margin: 0 }}>
                    {fillTemplate(strings.intro, { name: preview.name })}
                  </p>
                )}

                {/* WHAT IS ATTACHED — neutral chips, one fact per line. These
                    used to be two dense `.muted` paragraphs of bare numbers
                    ("Suallar: 12 (9 / 3)"), which is a legend the admin has to
                    reconstruct from the column header. */}
                {strings.impact && (
                  <div>
                    <p className="field-label" style={{ marginBottom: 6 }}>
                      {strings.impact}
                    </p>
                    <ul className="loc-impact" style={{ marginBottom: 0 }}>
                      {strings.impactQuestions && (
                        <li>
                          {fillTemplate(strings.impactQuestions, {
                            total: preview.questions.total,
                            deletable: preview.questions.deletable,
                            archived: preview.questions.archivedInstead,
                          })}
                        </li>
                      )}
                      {strings.impactTopics && (
                        <li>
                          {fillTemplate(strings.impactTopics, {
                            topics: preview.cascade.topics,
                            subtopics: preview.cascade.subtopics,
                          })}
                        </li>
                      )}
                      {strings.impactRounds && preview.cascade.dailyRounds > 0 && (
                        <li>
                          {fillTemplate(strings.impactRounds, {
                            n: preview.cascade.dailyRounds,
                          })}
                        </li>
                      )}
                      {strings.impactSubscribers &&
                        preview.activeSubscribers > 0 && (
                          <li>
                            {fillTemplate(strings.impactSubscribers, {
                              n: preview.activeSubscribers,
                            })}
                          </li>
                        )}
                    </ul>
                  </div>
                )}

                {/* A CONSEQUENCE, NOT A REFUSAL. These used to render in the
                    same red as a hard block, so "be careful" and "you may not"
                    looked identical. Amber, once, with the sentences inside it. */}
                {preview.warnings.length > 0 && (
                  <div className="cur-form-note" role="alert" style={{ margin: 0 }}>
                    <strong>{strings.warnTitle}</strong>
                    {preview.warnings.map((w, i) => (
                      <div key={i} style={{ marginTop: 4 }}>
                        {w}
                      </div>
                    ))}
                  </div>
                )}

                {/* ---- a. ARCHIVE — the safe option, and the one every refusal
                        sentence recommends. It lives here now instead of only
                        on the list row. */}
                {strings.archiveTitle && (
                  <Section
                    icon={<ArchiveIcon />}
                    title={strings.archiveTitle}
                    badge={
                      strings.recommended &&
                      preview.status !== "archived" && (
                        <span className="pill pill-ok pill-inline">
                          {strings.recommended}
                        </span>
                      )
                    }
                    description={strings.archiveDesc}
                  >
                    {preview.status === "archived" ? (
                      <p className="loc-impact-note" style={{ margin: "10px 0 0" }}>
                        {strings.archivedAlready}
                      </p>
                    ) : (
                      <div style={{ marginTop: 12 }}>
                        <ActionButton
                          type="button"
                          className="btn"
                          pending={archiving}
                          pendingLabel={strings.archiving ?? strings.working}
                          disabled={busy}
                          onClick={() => archive(preview.id)}
                        >
                          {strings.archiveAction ?? ""}
                        </ActionButton>
                      </div>
                    )}
                  </Section>
                )}

                {/* ---- the shared confirmation gate for BOTH destructive
                        branches below. One box, stated once, rather than the
                        same friction repeated per branch. */}
                <Section
                  title={strings.confirmHeading ?? strings.codeLabel ?? ""}
                  description={strings.confirmIntro}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <label className="field">
                      <span className="field-label">{strings.codeLabel}</span>
                      <input
                        type="text"
                        value={typed}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={busy}
                        onChange={(e) => setTyped(e.target.value)}
                      />
                      {typed !== "" && !codeOk && strings.wordMismatch ? (
                        <span className="cur-field-error" role="alert">
                          {strings.wordMismatch}
                        </span>
                      ) : (
                        <span className="cur-field-hint">
                          {strings.codeHint} <code>{SUBJECT_DELETE_WORD}</code>
                        </span>
                      )}
                    </label>

                    <label
                      className="field"
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={ack}
                        disabled={busy}
                        onChange={(e) => setAck(e.target.checked)}
                        style={{ marginTop: 3 }}
                      />
                      <span>{strings.ackLabel}</span>
                    </label>
                  </div>
                </Section>

                {/* ---- b. CLEAR THE QUESTION BANK — the prerequisite for the
                        delete, so it comes first and says so. Amber, not red:
                        answered questions are archived, not destroyed. */}
                <Section
                  icon={<BroomIcon />}
                  title={strings.purgeTitle}
                  description={strings.purgeDesc}
                  accent="warn"
                >
                  <form action={purgeFormAction}>
                    <input type="hidden" name="__id" value={preview.id} />
                    <input type="hidden" name="__code" value={typed} />
                    {/* A dead grey button with no stated reason is what the old
                        dialog showed here. */}
                    {preview.questions.total === 0 && strings.purgeEmpty && (
                      <p className="loc-impact-note" style={{ margin: "10px 0 0" }}>
                        {strings.purgeEmpty}
                      </p>
                    )}
                    <p className="loc-impact-note" style={{ margin: "10px 0 0" }}>
                      {strings.irreversible}
                    </p>
                    <div style={{ marginTop: 12 }}>
                      <ActionButton
                        className="btn btn-warn"
                        pending={purgePending}
                        pendingLabel={strings.working}
                        disabled={
                          !gateOpen || busy || preview.questions.total === 0
                        }
                      >
                        {strings.purgeAction}
                      </ActionButton>
                    </div>
                    {!gateOpen &&
                      preview.questions.total > 0 &&
                      strings.gateHint && (
                        <p className="cur-field-hint" style={{ marginTop: 8 }}>
                          {strings.gateHint}
                        </p>
                      )}
                    {purgeResult && !purgeResult.ok && (
                      <div role="alert" style={{ marginTop: 10 }}>
                        <p className="form-error" style={{ marginBottom: 6 }}>
                          {purgeResult.error}
                        </p>
                        <ul className="loc-impact" style={{ marginBottom: 0 }}>
                          {purgeResult.blocks.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {purgeResult && purgeResult.ok && (
                      <p className="form-ok" role="status" style={{ marginTop: 10 }}>
                        {purgeResult.message}
                      </p>
                    )}
                  </form>
                </Section>

                {/* ---- c. DELETE THE SUBJECT — the one terminal action, and the
                        only red control in the dialog. */}
                <Section
                  icon={<TrashIcon />}
                  title={strings.deleteTitle}
                  description={strings.deleteDesc}
                  accent="danger"
                >
                  <form action={deleteFormAction}>
                    <input type="hidden" name="__id" value={preview.id} />
                    <input type="hidden" name="__code" value={typed} />

                    {/* STATE THE OUTCOME BEFORE THE CLICK. The database decides
                        delete-vs-archive from the answered-question count, and
                        the admin should not learn which one happened from the
                        success message. */}
                    {preview.questions.archivedInstead > 0
                      ? strings.outcomeArchive && (
                          <p className="cur-form-note" style={{ margin: "10px 0 0" }}>
                            {fillTemplate(strings.outcomeArchive, {
                              n: preview.questions.archivedInstead,
                            })}
                          </p>
                        )
                      : strings.outcomeDelete && (
                          <p className="loc-impact-note" style={{ margin: "10px 0 0" }}>
                            {strings.outcomeDelete}
                          </p>
                        )}

                    {/* THE REFUSAL: one amber callout, then the counted reasons
                        as neutral chips. Ten of these can fire at once — as ten
                        red boxes it was unreadable, and it hid the fact that
                        every sentence ends by recommending Archive above. */}
                    {preview.blockedBy.length > 0 && (
                      <div role="alert" style={{ marginTop: 10 }}>
                        {strings.blockedTitle && (
                          <p className="loc-impact-blocked">{strings.blockedTitle}</p>
                        )}
                        <ul className="loc-impact" style={{ marginBottom: 0 }}>
                          {preview.blockedBy.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div style={{ marginTop: 12 }}>
                      <ActionButton
                        className="btn btn-danger"
                        pending={deletePending}
                        pendingLabel={strings.working}
                        disabled={
                          !gateOpen || busy || preview.blockedBy.length > 0
                        }
                      >
                        {strings.deleteAction}
                      </ActionButton>
                    </div>
                    {!gateOpen &&
                      preview.blockedBy.length === 0 &&
                      strings.gateHint && (
                        <p className="cur-field-hint" style={{ marginTop: 8 }}>
                          {strings.gateHint}
                        </p>
                      )}
                    {deleteResult && !deleteResult.ok && (
                      <div role="alert" style={{ marginTop: 10 }}>
                        <p className="form-error" style={{ marginBottom: 6 }}>
                          {deleteResult.error}
                        </p>
                        <ul className="loc-impact" style={{ marginBottom: 0 }}>
                          {deleteResult.blocks.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </form>
                </Section>
              </>
            )}

            {/* THE FOOTER STAYS PUT. .modal-body is the scroll container, so a
                sticky element inside it rides the bottom edge while the cards
                above scroll — Cancel is reachable without scrolling to the end
                of ten blocking reasons. The negative margins bleed it to the
                panel edges over .modal-body's 18px/20px padding. */}
            <div
              style={{
                position: "sticky",
                bottom: -18,
                margin: "0 -20px -18px",
                padding: "12px 20px",
                background: "var(--surface)",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                className="btn-ghost"
                onClick={close}
                disabled={busy}
              >
                {done ? strings.close : strings.cancel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
