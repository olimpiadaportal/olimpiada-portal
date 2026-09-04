// WHAT IS FOR SALE ON iOS, and at what price.
//
// TWO SOURCES, AND NEITHER ONE IS ENOUGH ALONE:
//   * `public.iap_products` says which App Store product ids THIS platform
//     sells, which subject each one grants and for how long. Its `active` flag
//     is the owner's switch: a row is false until the matching product exists in
//     App Store Connect, is approved, and someone deliberately turns it on
//     (migration 164, Decision 4). Read straight from the database under RLS —
//     the policy only lets an ordinary account see `active` rows, so the client
//     cannot enumerate what is not yet sellable.
//   * StoreKit says what it COSTS. That string is the only price this app may
//     render: Apple owns the tier, the storefront, the currency and the tax, and
//     any price we stored or formatted ourselves would be wrong for most of the
//     world and wrong for everyone the day a tier changes.
//
// A product missing from EITHER source is not offered. Showing a row whose price
// we could not fetch would put an unpriced purchase button in front of a store
// reviewer; showing a row StoreKit knows but the database does not would sell
// something the server will refuse to grant.
import { supabase } from "@/lib/supabase";
import type { IapCatalogRow, StoreProduct } from "./types";

/** A sellable, priced row: everything one purchase button needs. */
export type IapOffer = {
  productId: string;
  subjectId: string;
  subjectCode: string | null;
  subjectName: string | null;
  interval: "week" | "month" | "year";
  /** StoreKit's own localised string. Rendered verbatim. */
  displayPrice: string;
};

const INTERVAL_ORDER: Record<string, number> = { week: 0, month: 1, year: 2 };

/**
 * Active iOS products, with the subject each one grants.
 *
 * The `platform`/`active` filters are redundant against the RLS policy and are
 * written anyway: a reader of this file should not have to know the policy to
 * know what comes back, and a policy change must not silently widen the query.
 */
export async function fetchIosIapCatalog(): Promise<IapCatalogRow[]> {
  const { data, error } = await supabase
    .from("iap_products")
    .select("product_id, scope, subject_id, package_id, interval, subject:subject_id(code, name)")
    .eq("platform", "ios")
    .eq("active", true);
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    product_id: string;
    scope: string;
    subject_id: string | null;
    package_id: string | null;
    interval: string | null;
    subject: { code: string | null; name: string | null } | null;
  }[];
  return rows.map((r) => ({
    productId: r.product_id,
    scope: r.scope === "olympiad_package" ? "olympiad_package" : "subject",
    subjectId: r.subject_id,
    packageId: r.package_id,
    interval:
      r.interval === "week" || r.interval === "month" || r.interval === "year"
        ? r.interval
        : null,
    subjectCode: r.subject?.code ?? null,
    subjectName: r.subject?.name ?? null,
  }));
}

/** The SKUs StoreKit has to be asked about. Subject products only — see below. */
export function sellableProductIds(catalog: IapCatalogRow[]): string[] {
  return Array.from(
    new Set(
      catalog
        .filter((r) => r.scope === "subject" && r.subjectId !== null && r.interval !== null)
        .map((r) => r.productId),
    ),
  );
}

/**
 * Join the catalogue to StoreKit's answer and drop everything unsellable.
 *
 * OLYMPIAD PACKAGE PRODUCTS ARE DELIBERATELY NOT OFFERED HERE. The olympiad tab
 * is browse-only by an owner decision that survived Apple's 3.1.1 rejection, and
 * migration 165 seeds no package products at all. When packages are sold on iOS
 * they get their own surface; silently sprouting a package row on the
 * subscription screen would sell a family a grade-targeted package from a screen
 * that never told them which grade it was for.
 *
 * `coveredSubjectIds` are the subjects this child already has. The server's
 * double-billing guard refuses those anyway — this only keeps the parent from
 * meeting that refusal after opening a sheet.
 *
 * `taughtSubjectIds` IS THE CHILD'S GRADE RULE (migration 155,
 * subjects_taught_to_grade), and without it this screen sells a subject that
 * buys nothing. Fizika is active with three iOS products and has curriculum for
 * grades 7-11 only; a grade-3 family could buy it here, and every child-side
 * list then applies the SAME rule and drops the entitlement it produced — the
 * arena renders no round to start and not even a locked card. Money in, screen
 * unchanged, which is the Guideline 3.1.1 impression this rail exists to
 * remove. `null` means the rule could not be applied (no grade on the record,
 * or the read failed) and the list passes through untouched: hiding a whole
 * catalogue because one RPC hiccuped costs a family the thing they came for.
 *
 * THE COVERED IDS ARE NOT UNIONED INTO THAT RULE, and the web subscribe page's
 * union (web-app/src/app/(parent)/children/[id]/subscribe/page.tsx) is not a
 * precedent for doing so here: that list is an EDITOR, where a held subject
 * must keep a card or a pre-existing mis-sale becomes unremovable. This list is
 * an OFFER list, so a held subject is dropped outright before any grade rule is
 * consulted — unioning it in could not change an outcome, and writing it anyway
 * would state a rule this function does not have.
 */
export function buildOffers(
  catalog: IapCatalogRow[],
  products: StoreProduct[],
  coveredSubjectIds: string[],
  taughtSubjectIds: ReadonlySet<string> | null = null,
): IapOffer[] {
  const priced = new Map(products.map((p) => [p.id, p]));
  const covered = new Set(coveredSubjectIds);
  const offers: IapOffer[] = [];
  for (const row of catalog) {
    if (row.scope !== "subject") continue;
    if (row.subjectId === null || row.interval === null) continue;
    if (covered.has(row.subjectId)) continue;
    if (taughtSubjectIds && !taughtSubjectIds.has(row.subjectId)) continue;
    const product = priced.get(row.productId);
    if (!product) continue;
    offers.push({
      productId: row.productId,
      subjectId: row.subjectId,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
      interval: row.interval,
      displayPrice: product.displayPrice,
    });
  }
  // Grouped by subject, shortest period first — the order a parent scans. Sorted
  // on the DB name rather than the translated label so the grouping is stable
  // across locales; the visible label is resolved by the screen.
  return offers.sort((a, b) => {
    const byName = (a.subjectName ?? "").localeCompare(b.subjectName ?? "");
    if (byName !== 0) return byName;
    return (INTERVAL_ORDER[a.interval] ?? 9) - (INTERVAL_ORDER[b.interval] ?? 9);
  });
}
