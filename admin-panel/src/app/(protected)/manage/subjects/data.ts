import "server-only";

// Server-side reads shared by the three Subjects screens (list, new, edit).
//
// A subject is FOUR tables now. `subjects` holds the identity and the
// publication status; `subject_translations` holds its display name once per
// language, which is what the web and mobile apps actually print;
// `subjects_pricing` holds one row per (subject_id, interval) and is what every
// family-facing surface keys on; and `iap_products` decides, separately and
// invisibly, whether the iOS app is allowed to sell it at all. Loading them
// separately in each page is how the panel ended up with a Subjects screen that
// could not tell an admin a published subject was unsellable — so they come
// from here, together, with `sellable` and `iosSellable` already decided.
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/i18n/server";
import type { Locale } from "@/i18n/config";
import {
  PRICE_INTERVALS,
  type PriceInterval,
} from "@/lib/admin/pricing-shared";
import {
  subjectNamesFor,
  type SubjectNames,
  type SubjectTranslationRow,
} from "@/lib/admin/subject-display";

export type SubjectPriceMap = Partial<Record<PriceInterval, string>>;

/** The three display names, az always populated (see `names` below). */
export type { SubjectNames };

export type SubjectRow = {
  id: string;
  /**
   * `subjects.name` — the INTERNAL IMPORT KEY, not a label. Three bulk-import
   * RPCs resolve a subject with `where name = (meta ->> 'subject')`, so the
   * write action sets it once at creation and never rewrites it; a rename moves
   * `subject_translations` only. Render it where it is being named AS the key
   * (the edit form's hint) and nowhere else — `display` is what a human reads.
   */
  name: string;
  /**
   * What the panel CALLS this subject to the admin looking at it: the name in
   * their own locale, falling back to az. Every human-facing surface on these
   * screens uses this, so a renamed subject reads the same in the list, in the
   * edit heading and in the deletion dialog.
   */
  display: string;
  /**
   * What a family actually sees, per language (migration 171). `az` falls back
   * to `subjects.name` so this is never empty even on a database where the
   * migration has not run — that is also what makes the edit form safe to open
   * before the migration is applied.
   */
  names: SubjectNames;
  code: string;
  status: string;
  /** Stored amounts as canonical 2-decimal TEXT ("3.00") — never a float. */
  prices: SubjectPriceMap;
  /**
   * True when all three cycles have an ACTIVE pricing row. This is the real
   * answer to "can a family buy this on the WEB?", and it is why the flag lives
   * beside the status rather than on the separate Pricing page where nobody
   * saw it.
   */
  sellable: boolean;
  /**
   * The iOS half of the same question, and a completely independent one.
   *
   * "yes"     - all three cycles have an ACTIVE ios row in iap_products.
   * "no"      - at least one cycle does not, so the iOS app will not offer the
   *             subject at all: mobile-app/src/features/iap/catalog.ts
   *             intersects active rows with StoreKit own priced products and
   *             drops anything missing from either side. No error is raised
   *             anywhere and the subject is simply absent, so stating it here
   *             is the only signal an admin gets.
   * "unknown" - the product map could not be read. Reported as unknown rather
   *             than as "no": a read failure must not accuse a live product of
   *             being missing, and it must not fail the whole Subjects screen
   *             either (iap_products exists only in migration 164 and is not in
   *             any canonical root file, so a from-zero database has no such
   *             table — see STATUS.md).
   */
  iosSellable: "yes" | "no" | "unknown";
};

/** The `subjects` columns these screens read — the row before it is enriched. */
type SubjectBase = {
  id: string;
  name: string;
  code: string | null;
  status: string | null;
};

type PricingRow = {
  subject_id: string;
  interval: string;
  price_amount: number | string;
  status: string;
};

type IapRow = {
  subject_id: string | null;
  interval: string | null;
};

type TranslationRow = SubjectTranslationRow & { subject_id: string };

// numeric(12,2) arrives as a string over PostgREST; normalise to one canonical
// 2-decimal text form so comparisons and inputs never go near float maths.
function amountText(v: number | string): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function buildRow(
  subject: SubjectBase,
  pricing: PricingRow[],
  ios: Set<string> | null,
  translations: TranslationRow[],
  locale: Locale,
): SubjectRow {
  const prices: SubjectPriceMap = {};
  const active = new Set<string>();
  for (const p of pricing) {
    if (!(PRICE_INTERVALS as readonly string[]).includes(p.interval)) continue;
    const iv = p.interval as PriceInterval;
    const text = amountText(p.price_amount);
    if (text === "") continue;
    // The stored amount is shown even when the row is not active, so the edit
    // form never blanks a price the database still holds.
    prices[iv] = text;
    if (p.status === "active") active.add(iv);
  }
  const name = String(subject.name ?? "");
  const names = subjectNamesFor(name, translations);
  return {
    id: String(subject.id),
    name,
    display: names[locale]?.trim() || names.az,
    names,
    code: String(subject.code ?? ""),
    status: String(subject.status ?? ""),
    prices,
    sellable: PRICE_INTERVALS.every((iv) => active.has(iv)),
    iosSellable:
      ios === null
        ? "unknown"
        : PRICE_INTERVALS.every((iv) => ios.has(iv))
          ? "yes"
          : "no",
  };
}

/**
 * subject_id -> the set of intervals that have an ACTIVE ios product, or null
 * when the table could not be read.
 *
 * DELIBERATELY NOT FATAL. Every other read on these screens fails the page,
 * because a missing subject or a missing price would be rendered as a wrong
 * answer. This one is different: the product map is a REPORT about a different
 * store, and an admin who cannot see it must still be able to price and publish
 * a subject for the web. So a failure downgrades the badge to "unknown" and
 * says so, rather than blanking the screen or claiming nothing sells on iOS.
 */
async function loadIosProducts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subjectIds: string[],
): Promise<Map<string, Set<string>> | null> {
  if (subjectIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("iap_products")
    .select("subject_id, interval")
    .eq("platform", "ios")
    .eq("scope", "subject")
    .eq("active", true)
    .in("subject_id", subjectIds);
  if (error) {
    console.error(
      "[admin] iap product map load failed",
      error.code ?? "unknown",
    );
    return null;
  }
  const map = new Map<string, Set<string>>();
  for (const r of (data ?? []) as IapRow[]) {
    if (!r.subject_id || !r.interval) continue;
    if (!(PRICE_INTERVALS as readonly string[]).includes(r.interval)) continue;
    const set = map.get(String(r.subject_id)) ?? new Set<string>();
    set.add(String(r.interval));
    map.set(String(r.subject_id), set);
  }
  return map;
}

/**
 * subject_id -> its translation rows, or an EMPTY map when the table cannot be
 * read.
 *
 * DELIBERATELY NOT FATAL, for the same reason loadIosProducts is not: a panel
 * that refuses to render Subjects because migration 171 has not been applied is
 * worse than one that shows the az column and an empty EN/RU pair. Every row
 * still has a usable az name (buildRow backfills it from `subjects.name`), so
 * the degraded screen is the PRE-171 screen rather than a broken one.
 */
async function loadTranslations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subjectIds: string[],
): Promise<Map<string, TranslationRow[]>> {
  const map = new Map<string, TranslationRow[]>();
  if (subjectIds.length === 0) return map;
  const { data, error } = await supabase
    .from("subject_translations")
    .select("subject_id, locale, name")
    .in("subject_id", subjectIds);
  if (error) {
    console.error(
      "[admin] subject translations load failed",
      error.code ?? "unknown",
    );
    return map;
  }
  for (const r of (data ?? []) as TranslationRow[]) {
    const key = String(r.subject_id);
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return map;
}

/**
 * The subject ids whose DISPLAY name matches the search term, in any language.
 *
 * WHY THIS EXISTS. The search box used to filter `subjects.name` alone, which
 * was fine while that column tracked the az display name. It is now the frozen
 * bulk-import key — updateSubject never rewrites it — so a subject renamed to
 * "English / İngilis dili" would be findable only under the name nobody sees
 * any more, on the very screen an admin goes to in order to find it.
 *
 * SAFETY. The term arrives already sanitised (sanitizeSearchTerm: capped,
 * PostgREST filter-grammar characters stripped, LIKE wildcards escaped) and is
 * interpolated into exactly the same `%term%` shape the base query uses. No
 * `.or()` string is built from it: this stays two ordinary parameterised
 * queries whose results are merged in TypeScript, so there is nothing for a
 * crafted term to break out of.
 *
 * A read failure returns NO ids rather than failing the screen — the same
 * degradation loadTranslations takes, for the same reason: on a database where
 * migration 171 has not been applied, searching by key must still work.
 */
async function searchTranslatedIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  term: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("subject_translations")
    .select("subject_id")
    .ilike("name", `%${term}%`)
    // Bounded so the id list below cannot outgrow a request line. Three rows
    // per subject and a catalogue of a dozen subjects makes this unreachable
    // today; it exists so it stays unreachable.
    .limit(900);
  if (error) {
    console.error(
      "[admin] subject translation search failed",
      error.code ?? "unknown",
    );
    return [];
  }
  const ids = new Set<string>();
  for (const r of (data ?? []) as { subject_id: string }[]) {
    if (r.subject_id) ids.add(String(r.subject_id));
  }
  return [...ids];
}

/**
 * The Subjects list. `search` is already sanitised by the caller; `status` is
 * whitelisted there too — this function does not re-validate URL input, it
 * takes values the page has validated.
 */
export async function loadSubjects(opts: {
  search?: string;
  status?: string;
}): Promise<{ rows: SubjectRow[]; failed: boolean }> {
  const supabase = await createClient();
  const locale = await getLocale();

  // The status filter belongs to BOTH halves of the search, so it is applied
  // per query rather than once: a translated-name hit must obey the same status
  // whitelist the key-name hit does.
  const base = () => {
    const qb = supabase.from("subjects").select("id, name, code, status");
    return opts.status ? qb.eq("status", opts.status) : qb;
  };

  // Two queries, one union. The ids come first because the second subjects
  // query cannot be built until they are known.
  const matchedIds = opts.search
    ? await searchTranslatedIds(supabase, opts.search)
    : [];

  const [subjectsRes, translatedRes, pricingRes] = await Promise.all([
    opts.search ? base().ilike("name", `%${opts.search}%`) : base(),
    opts.search && matchedIds.length > 0
      ? base().in("id", matchedIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("subjects_pricing")
      .select("subject_id, interval, price_amount, status"),
  ]);

  if (subjectsRes.error || translatedRes.error || pricingRes.error) {
    // Never surface a raw Postgres message; the page renders its own notice.
    console.error(
      "[admin] subjects load failed",
      subjectsRes.error?.code ??
        translatedRes.error?.code ??
        pricingRes.error?.code ??
        "unknown",
    );
    return { rows: [], failed: true };
  }

  const bySubject = new Map<string, PricingRow[]>();
  for (const p of (pricingRes.data ?? []) as PricingRow[]) {
    const list = bySubject.get(String(p.subject_id)) ?? [];
    list.push(p);
    bySubject.set(String(p.subject_id), list);
  }

  // The union of the two searches, deduplicated by id. A subject whose key AND
  // whose translation both match must appear once.
  const seen = new Map<string, SubjectBase>();
  for (const s of [
    ...((subjectsRes.data ?? []) as SubjectBase[]),
    ...((translatedRes.data ?? []) as SubjectBase[]),
  ]) {
    seen.set(String(s.id), s);
  }
  const subjects = [...seen.values()];

  const ids = subjects.map((s) => String(s.id));
  const [ios, translations] = await Promise.all([
    loadIosProducts(supabase, ids),
    loadTranslations(supabase, ids),
  ]);

  const rows = subjects.map((s) =>
    buildRow(
      s,
      bySubject.get(String(s.id)) ?? [],
      ios === null ? null : (ios.get(String(s.id)) ?? new Set<string>()),
      translations.get(String(s.id)) ?? [],
      locale,
    ),
  );

  // Sorted by what the table PRINTS, not by the hidden key it used to print.
  // `.order("name")` on the query would order the rows by the import key, which
  // after a rename is a sequence with no visible logic at all — and the merge
  // of two searches has to be re-sorted here regardless.
  rows.sort((a, b) => a.display.localeCompare(b.display, locale));

  return { rows, failed: false };
}

/** One subject with its prices, or null when the id matches nothing. */
export async function loadSubject(id: string): Promise<SubjectRow | null> {
  const supabase = await createClient();
  const locale = await getLocale();
  const [subjectRes, pricingRes] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name, code, status")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("subjects_pricing")
      .select("subject_id, interval, price_amount, status")
      .eq("subject_id", id),
  ]);
  if (subjectRes.error) {
    console.error("[admin] subject load failed", subjectRes.error.code ?? "unknown");
    return null;
  }
  if (!subjectRes.data) return null;
  const [ios, translations] = await Promise.all([
    loadIosProducts(supabase, [id]),
    loadTranslations(supabase, [id]),
  ]);
  return buildRow(
    subjectRes.data as SubjectBase,
    (pricingRes.data ?? []) as PricingRow[],
    ios === null ? null : (ios.get(id) ?? new Set<string>()),
    translations.get(id) ?? [],
    locale,
  );
}
