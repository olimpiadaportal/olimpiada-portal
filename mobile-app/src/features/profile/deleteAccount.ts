// THE TWO-STEP CONFIRMATION ON THE MOST DESTRUCTIVE ACTION IN THE APP.
//
// `bffDeleteAccount()` removes the parent, every child under them and every
// answer those children ever gave. There is no undo, no soft-delete and no
// support console to restore it from. The only thing standing between a
// mis-tap and that is the sheet in sections.tsx, and until this file existed
// the whole rule — "two presses, on two DIFFERENT questions" — was three
// inline expressions in a JSX prop, pinned by nothing.
//
// WHY IT IS A MODULE AND NOT AN `if` IN THE HANDLER. The steps are enforced in
// two places that cannot see each other: the BUTTON decides what a press does,
// and the REQUEST decides whether to go. A rule that lives only in the button
// is a rule that a future edit to the button silently deletes — and the edit
// that would do it looks completely reasonable in a diff ("call confirmDelete
// on press"). Here both halves read the same three functions, and a test can
// hold them to it without rendering a screen.
//
// THE STEPS ARE NOT COSMETIC. Step 1 and step 2 ask DIFFERENT questions
// (account.deleteConfirm, then mob.prof.deleteFinal): a second identical
// prompt trains a user to double-tap through it, which is the opposite of a
// confirmation. And closing the sheet returns to 0, never to 1 — a parent who
// backed out at the final prompt starts the whole gate again, because the
// alternative is a sheet that reopens one tap away from deleting the account.

/** 0 = closed, 1 = first confirmation, 2 = final confirmation. */
export type DeleteStep = 0 | 1 | 2;

/** The step a closed sheet opens on. Always the FIRST question. */
export const DELETE_FIRST_STEP: DeleteStep = 1;

/** The only step from which the request may be sent. */
export const DELETE_FINAL_STEP: DeleteStep = 2;

/** What the sheet's primary button does from `step`. */
export type DeleteAdvance = {
  /** Where the sheet goes. */
  step: DeleteStep;
  /** Whether THIS press is the one that deletes the account. */
  submit: boolean;
};

/** Opening the danger sheet. Never resumes a step a previous open reached. */
export function openDelete(): DeleteStep {
  return DELETE_FIRST_STEP;
}

/** Backing out, from any step. */
export function closeDelete(): DeleteStep {
  return 0;
}

/**
 * The primary button, pressed at `step`.
 *
 * From the first confirmation it only ever ADVANCES — it must never be able to
 * both move the sheet and send the request, which is the single-press deletion
 * this gate exists to prevent. From a closed sheet it does nothing at all: no
 * reachable press can submit without the sheet having been opened and read.
 */
export function advanceDelete(step: DeleteStep): DeleteAdvance {
  if (step === DELETE_FINAL_STEP) return { step: DELETE_FINAL_STEP, submit: true };
  if (step === DELETE_FIRST_STEP) return { step: DELETE_FINAL_STEP, submit: false };
  return { step: 0, submit: false };
}

/**
 * The guard on the REQUEST itself — the second lock, and the one that holds
 * when the button is wired wrong.
 *
 * `pending` is a separate concern (one request at a time) and stays with the
 * caller, which owns that state. This answers only "has this account been
 * confirmed twice?", and nothing but step 2 answers yes.
 */
export function canRequestDelete(step: DeleteStep): boolean {
  return step === DELETE_FINAL_STEP;
}
