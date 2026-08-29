// GRADE AVAILABILITY — the pure half (no DB, no server-only imports, so it is
// unit-testable and can never drag the service-role client into a client
// bundle). Same split as lib/planBasket.ts and lib/freeTrialShared.ts.
//
// THE RULE ITSELF LIVES IN THE DATABASE (migration 155,
// subjects_taught_to_grade): a subject is offered to a grade when the
// curriculum reaches it. It used to be a hand-written client effect pasted into
// two web files and never ported to mobile, which is how Fizika — a grades 7-11
// subject — stayed listed and purchasable for a grade-3 child on the apps.
// Nothing in this file re-derives the rule; it only turns the RPC's answer into
// a set and applies it.

/** The RPC that answers "which subjects does this grade study". */
export const TAUGHT_SUBJECTS_RPC = "subjects_taught_to_grade";

/**
 * The RPC payload → a lookup set, or `null` meaning "unknown, do not filter".
 *
 * `null` IS THE IMPORTANT CASE. Three situations produce it: no grade on the
 * child's record (grade_id is nullable), an RPC error, and an empty result. All
 * three mean the rule cannot be applied to this child, and the honest response
 * is to leave the list alone — hiding the entire catalogue from a paying family
 * because one read failed is a far worse outcome than listing a subject the
 * attempt engine would refuse. An EMPTY result specifically means the grade has
 * no curriculum in ANY subject, which is broken content rather than a statement
 * about Fizika.
 */
export function taughtSubjectSet(
  data: unknown,
  error: unknown = null,
): ReadonlySet<string> | null {
  if (error || !Array.isArray(data)) return null;
  const ids = new Set<string>();
  for (const row of data) {
    // `returns setof uuid` comes back as bare strings through PostgREST. The
    // object arm costs one line and removes any dependence on that detail.
    const id =
      typeof row === "string"
        ? row
        : row && typeof row === "object"
          ? String((Object.values(row as Record<string, unknown>)[0] ?? "") as string)
          : "";
    if (id) ids.add(id);
  }
  return ids.size > 0 ? ids : null;
}

/**
 * Keep only the subjects this grade actually studies. `null` (unknown) passes
 * the list through untouched — see taughtSubjectSet.
 */
export function keepTaughtSubjects<T extends { id: string }>(
  items: readonly T[],
  taught: ReadonlySet<string> | null,
): T[] {
  if (!taught) return [...items];
  return items.filter((s) => taught.has(s.id));
}
