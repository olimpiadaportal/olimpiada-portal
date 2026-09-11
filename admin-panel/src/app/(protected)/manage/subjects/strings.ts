// Copy for the Subjects screens, resolved on the server and handed to the
// client components as plain objects — the same contract LeaderboardResetControls
// and the olympiad dialogs use, so no client component ever calls the i18n layer.
import type { T } from "@/i18n/server";
import type { SubjectDeleteStrings } from "@/components/SubjectDeleteButton";
import type { PriceCellStrings } from "@/components/PriceCell";
import type { SubjectFormStrings } from "./SubjectForm";
import type { PriceInterval } from "@/lib/admin/pricing-shared";

export function subjectDeleteStrings(t: T): SubjectDeleteStrings {
  return {
    open: t("action.delete"),
    title: t("del.subject.title"),
    loading: t("del.loading"),
    loadFailed: t("del.loadFailed"),
    blockedTitle: t("del.blockedTitle"),
    warnTitle: t("del.warnTitle"),
    irreversible: t("del.irreversible"),
    // THE TYPED TOKEN IS THE WORD "SİL", NOT THE SUBJECT NAME. The name would
    // be per-row proof, which the word is not — but `subjects.name` is not
    // unique (only `code` is), it is Azerbaijani with dotted/dotless İ-ı and ə,
    // and it is printed in the dialog title directly above the box, so an exact
    // comparison is copy-work rather than friction. The word stays; the per-row
    // proof is carried by naming the subject in the title, the impact list and
    // the acknowledgement instead. Changing it would also have to change
    // resolveSubjectCode() in lib/admin/subject-deletion.ts, which compares the
    // posted string to this literal before it looks the row's real code up.
    codeLabel: t("del.subject.wordLabel"),
    codeHint: t("del.subject.wordHint"),
    ackLabel: t("del.ackLabel"),
    cancel: t("action.cancel"),
    close: t("modal.close"),
    working: t("pend.deleting"),
    questions: t("del.questions"),
    cascade: t("del.cascade"),
    purgeTitle: t("del.purgeTitle"),
    purgeDesc: t("del.purgeDesc"),
    purgeAction: t("del.purgeAction"),
    deleteTitle: t("del.subject.deleteTitle"),
    deleteDesc: t("del.subject.deleteDesc"),
    deleteAction: t("del.subject.deleteAction"),

    intro: t("del.subject.intro"),
    impact: t("del.subject.impact"),
    impactQuestions: t("del.subject.impactQuestions"),
    impactTopics: t("del.subject.impactTopics"),
    impactRounds: t("del.subject.impactRounds"),
    impactSubscribers: t("del.subject.impactSubscribers"),
    archiveTitle: t("del.subject.archiveTitle"),
    archiveDesc: t("del.subject.archiveDesc"),
    archiveAction: t("del.subject.archiveAction"),
    archivedAlready: t("del.subject.archivedAlready"),
    recommended: t("del.subject.recommended"),
    confirmHeading: t("del.subject.confirmHeading"),
    confirmIntro: t("del.subject.confirmIntro"),
    gateHint: t("del.subject.gateHint"),
    wordMismatch: t("del.subject.wordMismatch"),
    purgeEmpty: t("del.subject.purgeEmpty"),
    outcomeArchive: t("del.subject.outcomeArchive"),
    outcomeDelete: t("del.subject.outcomeDelete"),
    archiving: t("pend.processing"),
  };
}

export function subjectFormStrings(t: T, submitLabel: string): SubjectFormStrings {
  return {
    name: t("subj.field.name"),
    nameEn: t("subj.field.nameEn"),
    nameRu: t("subj.field.nameRu"),
    nameFallbackHint: t("subj.nameFallbackHint"),
    // Edit screen only — the form renders it beside the actual key.
    importNameHint: t("subj.importNameHint"),
    status: t("subj.field.status"),
    prices: t("subj.field.prices"),
    pricesHint: t("subj.pricesHint"),
    interval: intervalLabels(t),
    submit: submitLabel,
    saving: t("manage.saving"),
    saved: t("subj.saved"),
    errName: t("subj.err.name"),
    errPrice: t("subj.err.price"),
    // The platform bills in AZN only; subjects_pricing.currency defaults to it
    // and no admin surface writes anything else.
    currency: "AZN",
  };
}

/** Həftəlik / Aylıq / İllik — the column headers AND the form legends. */
export function intervalLabels(t: T): Record<PriceInterval, string> {
  return {
    week: t("subj.interval.week"),
    month: t("subj.interval.month"),
    year: t("subj.interval.year"),
  };
}

/**
 * Copy for the inline price cell, minus the per-cell accessible label the
 * caller composes from the subject name and the cycle.
 *
 * ONE PLACE, TWO SCREENS. The list renders three cells per row and the edit
 * page renders three for the one subject; both post to the same
 * saveSubjectPrice action, so the wording has to come from one function or the
 * two screens will drift into describing the same operation differently.
 */
export function subjectPriceCellStrings(t: T): Omit<PriceCellStrings, "ariaLabel"> {
  return {
    save: t("action.save"),
    saving: t("manage.saving"),
    saved: t("settings.saved"),
    // Singular on purpose — it renders under one input, in one cell. The
    // plural subj.err.price belongs to the create form's three-field fieldset.
    invalidAmount: t("subj.err.priceCell"),
    notSet: t("subj.priceNotSet"),
  };
}

/** The publication axis, labelled the way the panel has always labelled it. */
export function subjectStatusOptions(t: T): { value: string; label: string }[] {
  return [
    { value: "active", label: t("status.active") },
    { value: "inactive", label: t("status.inactive") },
    { value: "archived", label: t("status.archived") },
  ];
}

export function subjectLifecycleDict(t: T): Record<string, string> {
  return {
    "subj.act.publish": t("subj.act.publish"),
    "subj.act.unpublish": t("subj.act.unpublish"),
    "subj.act.archive": t("subj.act.archive"),
    "subj.publishNeedsPrices": t("subj.publishNeedsPrices"),
    "pend.processing": t("pend.processing"),
  };
}
