"use client";

// ONE package-deletion dialog, used from two places: the package edit page's
// danger zone and every row of the package LIST.
//
// It is one component rather than two because the two screens must not be able
// to disagree about what deleting a package means. The dialog states WHICH of
// the two outcomes will actually happen (delete, or archive-instead-of-delete
// when anything in the pool has ever been answered), it prints the real preview
// counts rather than a generic "are you sure?", it names every reason the
// database is refusing — purchases being the common one, and a refusal there is
// a NORMAL answer that points at Archive, not an error — and it makes the admin
// type the package's own auto-generated code first.
//
// The only thing that differs between the two callers is what happens AFTER a
// successful delete, and that is exactly the `staysOnPage` flag:
//   * edit page  — the page describes a row that is gone, so the action's fixed
//                  `/olympiad` redirect is followed;
//   * list       — the page survives. revalidatePath() has already dropped the
//                  row out of the table, so navigating would only throw away the
//                  admin's filters, and re-reading the preview of a deleted
//                  package would render "load failed" over a success. Neither:
//                  the dialog stays open with its result until it is closed.
//                  (On the list it is opened in controlled mode from
//                  OlympiadPackageDeleteBoundary, which mounts it ABOVE the
//                  table so the deleted row cannot take it down.)
import { useCallback, useState } from "react";
import {
  deleteOlympiadPackageAction,
  loadOlympiadPackageDeletionPreview,
  type OlympiadPackageDeletionPreview,
} from "@/lib/admin/olympiad";
import {
  DestructiveActionForm,
  DestructiveConfirmDialog,
  type DestructiveConfirmStrings,
} from "@/components/DestructiveConfirm";

export type OlympiadPackageDeleteStrings = DestructiveConfirmStrings & {
  questions: string;
  outcomeDelete: string;
  outcomeArchive: string;
  cascade: string;
  media: string;
  deleteTitle: string;
  deleteDesc: string;
  deleteAction: string;
};

export function OlympiadPackageDeleteButton({
  packageId,
  strings,
  staysOnPage = false,
  triggerClassName,
  open,
  onOpenChange,
}: {
  packageId: string;
  strings: OlympiadPackageDeleteStrings;
  /** The dialog's page outlives the deletion (the list). See the header. */
  staysOnPage?: boolean;
  triggerClassName?: string;
  /** Controlled mode — passed through to the shared dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  // Stable by construction — DestructiveActionForm runs it from an effect.
  // The counts on screen now describe a package that is gone (or archived), so
  // the branch is retired rather than left armed over a stale preview; the
  // success sentence stays until the dialog is closed.
  const [done, setDone] = useState(false);
  const stay = useCallback(() => setDone(true), []);

  return (
    <DestructiveConfirmDialog<OlympiadPackageDeletionPreview>
      strings={strings}
      loadPreview={() => loadOlympiadPackageDeletionPreview(packageId)}
      // No `code` prop, deliberately (owner decision, migration 113): a package
      // delete no longer asks for the slug to be transcribed. Omitting it puts
      // the dialog in token-free mode, which FORCES the acknowledgement
      // checkbox on — so the action still needs a deliberate confirmation, it
      // just no longer needs typing. Every sibling dialog keeps its token.
      triggerClassName={triggerClassName}
      open={open}
      onOpenChange={onOpenChange}
      details={(p) => (
        <>
          <p style={{ marginTop: 0 }}>
            <strong>{p.titleAz}</strong>
          </p>
          {/* WHICH of the two outcomes will happen, stated before the click.
              The archive branch runs whenever anything in the pool has ever
              been answered — i.e. most of the time — and it keeps the grades,
              the translations and the pool rows. Reporting the full delete
              cascade in both branches would overstate the blast radius, and a
              confirmation screen an admin learns to disbelieve is worse than
              none. */}
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
          disabled={done}
          onSuccess={staysOnPage ? stay : undefined}
        />
      )}
    </DestructiveConfirmDialog>
  );
}
