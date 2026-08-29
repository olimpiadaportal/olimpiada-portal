"use client";

// ONE package lifecycle dialog — archive AND delete — used from two places: the
// package edit page's danger zone and every row of the package LIST.
//
// WHY THIS IS NO LONGER THE SHARED DestructiveConfirmDialog. It used to be, and
// the shared dialog is still right for the olympiad grade pool and the bulk pool
// delete: those are one destructive branch with no safe alternative. A package
// has one, and it is the alternative every refusal sentence already recommends:
// `del.hint.packageHasPurchases` ends with "archive the package instead". Yet
// Archive lived outside this dialog — in the edit page's danger zone, one
// navigation away from the list where the refusal appears — so the screen that
// explained why deleting was refused could not offer the thing it recommended.
// An admin working from the list met a disabled Delete button and a red sentence
// with nothing to click. That is the whole reported defect.
//
// AND THE REFUSAL IS NOT AN ERROR. Existing buyers do not break anything: the
// package can be archived today, purchased or not, and every buyer keeps
// lifetime access — can_view_olympiad_package's purchase branch never reads the
// package's status (015), and migration 124 installs a self-check that aborts if
// that ever changes. So the owner count is stated as a FACT the admin weighs,
// beside the archive that acts on it, and red is spent only on the one operation
// that genuinely cannot proceed: deleting a package somebody paid for, which is
// project law (CLAUDE.md: "Never delete purchased olympiad package records").
//
// Rules borrowed from the shared dialog rather than reinvented:
//   - the counts are re-fetched on open AND after every mutation, so the numbers
//     on screen are never a stale argument for the click below them;
//   - refusals are finished sentences that each name a reason AND a way out;
//   - the delete keeps its acknowledgement. It has no typed code — owner
//     decision, migration 113 — so the checkbox is the whole confirmation and
//     must not be dropped. Archive does not ask for it: it is reversible
//     (admin_unarchive_olympiad_package), and a dialog that demands the same
//     friction for a reversible step teaches admins that the friction is noise.
//
// The only thing that differs between the two callers is what happens AFTER a
// successful DELETE, and that is the `staysOnPage` flag:
//   * edit page  — the page describes a row that is gone, so the action's fixed
//                  `/olympiad` redirect is followed;
//   * list       — the page survives. revalidatePath() has already dropped the
//                  row out of the table, so navigating would only throw away the
//                  admin's filters. The dialog stays open with its result until
//                  it is closed. (On the list it is opened in controlled mode
//                  from OlympiadPackageDeleteBoundary, which mounts it ABOVE the
//                  table so the deleted row cannot take the answer down with it.)
// ARCHIVING never navigates on either screen: it destroys nothing, so both
// screens are still there to read the outcome.
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
import { fillTemplate } from "@/lib/admin/olympiad-per-attempt";
import type { DestructiveState } from "@/lib/admin/deletion-hints";
import {
  archiveOlympiadPackageAction,
  deleteOlympiadPackageAction,
  loadOlympiadPackageDeletionPreview,
  type OlympiadPackageDeletionPreview,
} from "@/lib/admin/olympiad";

/**
 * The copy this dialog needs, resolved by the server page and handed down
 * already translated — this component never calls the i18n layer (the same
 * contract the shared dialog and LeaderboardResetControls follow).
 */
export type OlympiadPackageDeleteStrings = {
  /** Label of the row / danger-zone button that opens the dialog. */
  open: string;
  title: string;
  loading: string;
  loadFailed: string;
  cancel: string;
  close: string;
  working: string;
  irreversible: string;
  ackLabel: string;

  // ---- what is attached, stated before either choice ----
  intro: string;
  impact: string;
  impactOwners: string;
  impactEntitlements: string;
  impactQuestions: string;
  impactMedia: string;
  cascade: string;
  ownersNote: string;
  noOwners: string;

  // ---- a. archive: the safe, reversible answer ----
  archiveTitle: string;
  archiveDesc: string;
  archiveAction: string;
  archivedAlready: string;
  archiving: string;
  recommended: string;

  // ---- the confirmation gate for the delete below ----
  confirmHeading: string;
  confirmIntro: string;
  gateHint: string;

  // ---- b. delete: the one terminal action ----
  blockedTitle: string;
  outcomeDelete: string;
  outcomeArchive: string;
  deleteTitle: string;
  deleteDesc: string;
  deleteAction: string;
};

// A section of the dialog: a title row, a muted explanation, then the branch.
// `accent` paints the left rule — the panel's existing "dangerous area" grammar
// (.setting-card-warn / SubjectDeleteButton), never a filled block.
function Section({
  title,
  badge,
  description,
  accent,
  children,
}: {
  title: string;
  badge?: ReactNode;
  description?: string;
  accent?: "danger";
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
    <section className="card" style={{ padding: "14px 16px", ...accentStyle }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: description ? 6 : 10,
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: "0.95rem" }}>{title}</strong>
        {badge}
      </div>
      {description && <p className="setting-card-desc">{description}</p>}
      {children}
    </section>
  );
}

/** A finished result — success or a counted refusal — under one branch. */
function Result({ state }: { state: DestructiveState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="form-ok" role="status" style={{ marginTop: 10 }}>
        {state.message}
      </p>
    );
  }
  return (
    <div role="alert" style={{ marginTop: 10 }}>
      <p className="form-error" style={{ marginBottom: 6 }}>
        {state.error}
      </p>
      {state.blocks.length > 0 && (
        <ul className="loc-impact" style={{ marginBottom: 0 }}>
          {state.blocks.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OlympiadPackageDeleteButton({
  packageId,
  strings,
  staysOnPage = false,
  triggerClassName = "link-danger",
  open: openProp,
  onOpenChange,
}: {
  packageId: string;
  strings: OlympiadPackageDeleteStrings;
  /** The dialog's page outlives the deletion (the list). See the header. */
  staysOnPage?: boolean;
  triggerClassName?: string;
  /** Controlled mode — the boundary owns visibility and brings its own trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [selfOpen, setSelfOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : selfOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setSelfOpen(next);
    onOpenChange?.(next);
  };

  const [preview, setPreview] = useState<OlympiadPackageDeletionPreview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const [refreshKey, setRefreshKey] = useState(0);
  const [ack, setAck] = useState(false);

  const [archiveState, archiveFormAction, archivePending] = useActionState<
    DestructiveState,
    FormData
  >(archiveOlympiadPackageAction, null);
  const [deleteState, deleteFormAction, deletePending] = useActionState<
    DestructiveState,
    FormData
  >(deleteOlympiadPackageAction, null);

  const busy = archivePending || deletePending;
  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  // A RESULT BELONGS TO THE SESSION THAT PRODUCED IT. useActionState has no
  // reset, and this dialog outlives its own success in the ordinary case: after
  // an archive the package is still there, so reopening would otherwise show
  // last time's green message over this time's numbers.
  const [session, setSession] = useState(0);
  const [archiveSession, setArchiveSession] = useState(-1);
  const [deleteSession, setDeleteSession] = useState(-1);
  useEffect(() => {
    if (archiveState) setArchiveSession(session);
    // `session` is deliberately not a dependency: this must fire when a RESULT
    // arrives, not when a new session starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveState]);
  useEffect(() => {
    if (deleteState) setDeleteSession(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteState]);
  const archiveResult = archiveSession === session ? archiveState : null;
  const deleteResult = deleteSession === session ? deleteState : null;

  // Re-fetched on every open AND after every mutation: the counts ARE the
  // argument for the click that follows them.
  useEffect(() => {
    if (!open) return;
    setLoadFailed(false);
    startLoading(async () => {
      const p = await loadOlympiadPackageDeletionPreview(packageId);
      if (p) setPreview(p);
      else setLoadFailed(true);
    });
    // loadOlympiadPackageDeletionPreview is a server-action reference recreated
    // on every render; depending on it would refetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey, packageId]);

  // Archiving destroys nothing, so the preview is re-read rather than the page
  // navigated: an archived package no longer raises `package_is_active`, and the
  // delete branch below must never be offered on the blocks that were true
  // before. router.refresh() repaints the lifecycle pill underneath.
  useEffect(() => {
    if (!archiveResult?.ok) return;
    router.refresh();
    refresh();
  }, [archiveResult, refresh, router]);

  // The delete is deliberately NOT followed by a preview refetch: the row it
  // describes may be gone, and "load failed" is a terrible way to report a
  // success. `redirectTo` is a fixed literal chosen by the server action — never
  // a value from the client — and it is followed only on the page the deletion
  // destroys (see `staysOnPage` in the header).
  useEffect(() => {
    if (!deleteResult?.ok) return;
    if (!staysOnPage && deleteResult.redirectTo) {
      router.replace(deleteResult.redirectTo);
      return;
    }
    router.refresh();
  }, [deleteResult, router, staysOnPage]);

  const done = Boolean(deleteResult?.ok);
  const close = () => setOpen(false);

  return (
    <>
      {/* Controlled mode brings its own trigger — see the `open` prop. */}
      {!controlled && (
        <button
          type="button"
          className={triggerClassName}
          onClick={() => {
            // The acknowledgement resets on every open: a box still ticked from
            // the previous package is not a confirmation of this one.
            setAck(false);
            setSession((n) => n + 1);
            setOpen(true);
          }}
        >
          {strings.open}
        </button>
      )}

      <Modal
        isOpen={open}
        onClose={close}
        title={strings.title}
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
                <p className="loc-delete-question" style={{ margin: 0 }}>
                  {fillTemplate(strings.intro, { name: preview.titleAz })}
                </p>

                {/* WHAT IS ATTACHED — neutral chips, one fact per line. The
                    owner counts lead: they are the fact the choice turns on.
                    Purchases and entitlements are never added together — an
                    Apple/Google grant, a school licence or a manual comp has no
                    purchase row at all (migration 124). */}
                <div>
                  <p className="field-label" style={{ marginBottom: 6 }}>
                    {strings.impact}
                  </p>
                  <ul className="loc-impact" style={{ marginBottom: 0 }}>
                    {preview.owners.purchases > 0 && (
                      <li>
                        {fillTemplate(strings.impactOwners, {
                          n: preview.owners.purchases,
                        })}
                      </li>
                    )}
                    {preview.owners.entitlements > 0 && (
                      <li>
                        {fillTemplate(strings.impactEntitlements, {
                          n: preview.owners.entitlements,
                        })}
                      </li>
                    )}
                    {preview.owners.purchases === 0 &&
                      preview.owners.entitlements === 0 && (
                        <li>{strings.noOwners}</li>
                      )}
                    <li>
                      {fillTemplate(strings.impactQuestions, {
                        total: preview.questions.total,
                        deletable: preview.questions.deletable,
                        archived: preview.questions.archivedInstead,
                      })}
                    </li>
                    <li>
                      {strings.cascade}:{" "}
                      {preview.outcome === "archive"
                        ? `${preview.archiveCascade.rotations} / ${preview.archiveCascade.questionTranslations} / ${preview.archiveCascade.answerOptions}`
                        : `${preview.deleteCascade.grades} / ${preview.deleteCascade.poolLinks} / ${preview.deleteCascade.rotations} / ${preview.deleteCascade.questionTranslations} / ${preview.deleteCascade.answerOptions}`}
                    </li>
                    {preview.orphanMedia > 0 && (
                      <li>
                        {fillTemplate(strings.impactMedia, {
                          n: preview.orphanMedia,
                        })}
                      </li>
                    )}
                  </ul>
                </div>

                {/* THE DECISION, NOT A REFUSAL. Amber once, and only when there
                    is somebody to protect: buyers keep the package, so what the
                    admin is choosing is whether NEW sales continue — not whether
                    they are allowed to act. */}
                {(preview.owners.purchases > 0 ||
                  preview.owners.entitlements > 0) && (
                  <div className="cur-form-note" role="note" style={{ margin: 0 }}>
                    {strings.ownersNote}
                  </div>
                )}

                {/* ---- a. ARCHIVE — the answer every delete refusal already
                        recommends, now on the same screen as the refusal. No
                        acknowledgement: it is reversible, and nothing in the
                        database blocks it. */}
                <Section
                  title={strings.archiveTitle}
                  badge={
                    preview.status !== "archived" ? (
                      <span className="pill pill-ok pill-inline">
                        {strings.recommended}
                      </span>
                    ) : undefined
                  }
                  description={strings.archiveDesc}
                >
                  {preview.status === "archived" ? (
                    <p className="loc-impact-note" style={{ margin: "10px 0 0" }}>
                      {strings.archivedAlready}
                    </p>
                  ) : (
                    <form action={archiveFormAction}>
                      <input type="hidden" name="__id" value={preview.id} />
                      <div style={{ marginTop: 12 }}>
                        <ActionButton
                          className="btn"
                          pending={archivePending}
                          pendingLabel={strings.archiving}
                          disabled={busy}
                        >
                          {strings.archiveAction}
                        </ActionButton>
                      </div>
                    </form>
                  )}
                  {/* Rendered outside the form so the archive's own answer —
                      including its FAILURE — survives the re-read above. */}
                  <Result state={archiveResult} />
                </Section>

                {/* ---- the confirmation for the delete alone. A package delete
                        asks for no typed code (owner decision, migration 113),
                        which makes this checkbox the entire confirmation. */}
                <Section
                  title={strings.confirmHeading}
                  description={strings.confirmIntro}
                >
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
                </Section>

                {/* ---- b. DELETE — the one terminal action, and the only red
                        control in the dialog. */}
                <Section
                  title={strings.deleteTitle}
                  description={strings.deleteDesc}
                  accent="danger"
                >
                  <form action={deleteFormAction}>
                    <input type="hidden" name="__id" value={preview.id} />

                    {/* STATE THE OUTCOME BEFORE THE CLICK. The database decides
                        delete-vs-archive from the answered-question count, and
                        the admin should not learn which one happened from the
                        success message. */}
                    <p className="loc-impact-note" style={{ margin: "10px 0 0" }}>
                      {preview.outcome === "archive"
                        ? strings.outcomeArchive
                        : strings.outcomeDelete}
                    </p>
                    <p className="loc-impact-note" style={{ margin: "6px 0 0" }}>
                      {strings.irreversible}
                    </p>

                    {/* THE REAL REFUSAL — this operation genuinely cannot run.
                        Amber heading, counted reasons as neutral chips: every
                        one of them ends by naming Archive above, which is now a
                        button and not just a sentence. */}
                    {preview.blockedBy.length > 0 && (
                      <div role="alert" style={{ marginTop: 10 }}>
                        <p className="loc-impact-blocked">{strings.blockedTitle}</p>
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
                        disabled={!ack || busy || preview.blockedBy.length > 0}
                      >
                        {strings.deleteAction}
                      </ActionButton>
                    </div>
                    {!ack && preview.blockedBy.length === 0 && (
                      <p className="cur-field-hint" style={{ marginTop: 8 }}>
                        {strings.gateHint}
                      </p>
                    )}
                    <Result state={deleteResult} />
                  </form>
                </Section>
              </>
            )}

            {/* THE FOOTER STAYS PUT. .modal-body is the scroll container, so a
                sticky element inside it rides the bottom edge while the cards
                above scroll — Cancel is reachable without scrolling past every
                blocking reason. The negative margins bleed it to the panel edges
                over .modal-body's 18px/20px padding. */}
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
