"use client";

// The package edit page's lifecycle + deletion controls, in one place.
//
// Archive, restore and delete are three answers to the same question ("this
// package should not be here"), and the panel used to offer only the first —
// an archived package could never be brought back, and a package created by
// mistake could never be removed at all. Putting all three together is what
// makes the ordering readable: archive is reversible, restore is the inverse
// that was missing, delete is the one that is not.
//
// Restore lands the package on INACTIVE, never straight on active, and the hint
// says so: activating re-fires the pool guard (most archived packages have a
// pool too small to pass it) and would put the package back ON SALE under a
// sale window that may be long expired. The admin activates deliberately, from
// the form above, once the pool is ready.
import { useActionState } from "react";
import {
  archiveOlympiadPackage,
  deleteOlympiadPackageAction,
  loadOlympiadPackageDeletionPreview,
  unarchiveOlympiadPackageAction,
  type OlympiadDeletionState,
  type OlympiadPackageDeletionPreview,
} from "@/lib/admin/olympiad";
import { ActionButton, SubmitButton } from "@/components/ActionButton";
import {
  DestructiveActionForm,
  DestructiveConfirmDialog,
  type DestructiveConfirmStrings,
} from "@/components/DestructiveConfirm";

export type OlympiadPackageDangerStrings = DestructiveConfirmStrings & {
  heading: string;
  archive: string;
  archiving: string;
  restore: string;
  restoring: string;
  restoreHint: string;
  questions: string;
  outcomeDelete: string;
  outcomeArchive: string;
  cascade: string;
  media: string;
  deleteTitle: string;
  deleteDesc: string;
  deleteAction: string;
};

export function OlympiadPackageDangerZone({
  packageId,
  isArchived,
  strings,
}: {
  packageId: string;
  isArchived: boolean;
  strings: OlympiadPackageDangerStrings;
}) {
  const [restoreState, restoreAction, restorePending] = useActionState<
    OlympiadDeletionState,
    FormData
  >(unarchiveOlympiadPackageAction, null);

  return (
    <div>
      <h3>{strings.heading}</h3>

      <div className="row-actions" style={{ justifyContent: "flex-start", gap: 16 }}>
        {isArchived ? (
          <form action={restoreAction}>
            <input type="hidden" name="__id" value={packageId} />
            <ActionButton
              className="btn-ghost"
              pending={restorePending}
              pendingLabel={strings.restoring}
            >
              {strings.restore}
            </ActionButton>
          </form>
        ) : (
          <form action={archiveOlympiadPackage}>
            <input type="hidden" name="__id" value={packageId} />
            <SubmitButton className="link-danger" pendingLabel={strings.archiving}>
              {strings.archive}
            </SubmitButton>
          </form>
        )}

        <DestructiveConfirmDialog<OlympiadPackageDeletionPreview>
          strings={strings}
          loadPreview={() => loadOlympiadPackageDeletionPreview(packageId)}
          code={(p) => p.code}
          details={(p) => (
            <>
              <p style={{ marginTop: 0 }}>
                <strong>{p.titleAz}</strong>
              </p>
              {/* WHICH of the two outcomes will happen, stated before the
                  click. The archive branch runs whenever anything in the pool
                  has ever been answered — i.e. most of the time — and it keeps
                  the grades, the translations and the pool rows. Reporting the
                  full delete cascade in both branches would overstate the blast
                  radius, and a confirmation screen an admin learns to
                  disbelieve is worse than none. */}
              <p className="muted">
                {p.outcome === "archive" ? strings.outcomeArchive : strings.outcomeDelete}
              </p>
              <p className="muted">
                {strings.questions}: {p.questions.total} ({p.questions.deletable} /{" "}
                {p.questions.archivedInstead})
              </p>
              <p className="muted">
                {strings.cascade}:{" "}
                {p.outcome === "archive"
                  ? `${p.archiveCascade.rotations} / ${p.archiveCascade.questionTranslations} / ${p.archiveCascade.answerOptions}`
                  : `${p.deleteCascade.grades} / ${p.deleteCascade.poolLinks} / ${p.deleteCascade.rotations} / ${p.deleteCascade.questionTranslations} / ${p.deleteCascade.answerOptions}`}
              </p>
              <p className="muted">
                {strings.media}: {p.orphanMedia}
              </p>
            </>
          )}
        >
          {(p, gate) => (
            <DestructiveActionForm
              gate={gate}
              actionKey="delete"
              action={deleteOlympiadPackageAction}
              fields={{ __id: p.id }}
              title={strings.deleteTitle}
              description={strings.deleteDesc}
              label={strings.deleteAction}
              // Purchases, an active listing and a live attempt each render as
              // their own sentence naming the alternative — archiving.
              blockedBy={p.blockedBy}
            />
          )}
        </DestructiveConfirmDialog>
      </div>

      {isArchived && <p className="hint">{strings.restoreHint}</p>}
      {restoreState && !restoreState.ok && (
        <div role="alert">
          <span className="form-error">{restoreState.error}</span>
          <ul>
            {restoreState.blocks.map((b, i) => (
              <li key={i} className="form-error">
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
      {restoreState && restoreState.ok && (
        <span className="form-ok" role="status">
          {restoreState.message}
        </span>
      )}
    </div>
  );
}
