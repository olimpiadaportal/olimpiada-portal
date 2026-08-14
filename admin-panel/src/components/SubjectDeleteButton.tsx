"use client";

// Subject deletion — the shared destructive dialog wired to the two subject
// branches of migration 111.
//
// Both branches live in ONE dialog on purpose. Clearing the question bank is
// the PREREQUISITE for deleting the subject (the database blocks the delete
// while the bank is non-empty), so putting them on separate screens would only
// teach the admin to go hunting for the other one.
import {
  deleteSubject,
  loadSubjectDeletionPreview,
  purgeSubjectQuestions,
  type SubjectDeletionPreview,
} from "@/lib/admin/subject-deletion";
import {
  DestructiveActionForm,
  DestructiveConfirmDialog,
  type DestructiveConfirmStrings,
} from "@/components/DestructiveConfirm";

export type SubjectDeleteStrings = DestructiveConfirmStrings & {
  questions: string;
  cascade: string;
  purgeTitle: string;
  purgeDesc: string;
  purgeAction: string;
  deleteTitle: string;
  deleteDesc: string;
  deleteAction: string;
};

export function SubjectDeleteButton({
  id,
  strings,
}: {
  id: string;
  strings: SubjectDeleteStrings;
}) {
  return (
    <DestructiveConfirmDialog<SubjectDeletionPreview>
      strings={strings}
      loadPreview={() => loadSubjectDeletionPreview(id)}
      code={(p) => p.code}
      // The purge empties a live subject's bank without being blocked for it —
      // migration 111's one deliberately unblocked destructive scope — so the
      // checkbox is the second gate the token cannot be.
      needsAck
      details={(p) => (
        <>
          <p style={{ marginTop: 0 }}>
            <strong>{p.name}</strong>
          </p>

          {p.warnings.length > 0 && (
            <div role="alert">
              <p className="form-error">{strings.warnTitle}</p>
              <ul>
                {p.warnings.map((w, i) => (
                  <li key={i} className="form-error">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="muted">
            {strings.questions}: {p.questions.total} ({p.questions.deletable} /{" "}
            {p.questions.archivedInstead})
          </p>
          <p className="muted">
            {strings.cascade}: {p.cascade.topics} / {p.cascade.subtopics} /{" "}
            {p.cascade.dailyRounds}
          </p>
        </>
      )}
    >
      {(p, gate) => (
        <>
          <DestructiveActionForm
            gate={gate}
            actionKey="purge"
            action={purgeSubjectQuestions}
            fields={{ __id: p.id }}
            title={strings.purgeTitle}
            description={strings.purgeDesc}
            label={strings.purgeAction}
            needsAck
            disabled={p.questions.total === 0}
          />
          <DestructiveActionForm
            gate={gate}
            actionKey="delete"
            action={deleteSubject}
            fields={{ __id: p.id }}
            title={strings.deleteTitle}
            description={strings.deleteDesc}
            label={strings.deleteAction}
            // The nine counted reasons, each already a sentence naming its
            // alternative — never a bare "cannot delete".
            blockedBy={p.blockedBy}
          />
        </>
      )}
    </DestructiveConfirmDialog>
  );
}
