import "server-only";

// PUBLIC olympiad catalog — the single typed service behind every signed-OUT
// olympiad surface (the landing/services band, /olympiad-packages and
// /olympiad-packages/[code]). Visual components never query Supabase directly
// and never re-implement the availability rule.
//
// SERVER-SIDE FILTERING (never client/frontend filtering):
//   The authority is `get_public_olympiad_packages(p_limit)` — an anon-callable
//   SECURITY DEFINER RPC whose WHERE clause is the canonical
//   `olympiad_package_on_sale(status, sale_starts_at, sale_ends_at)` predicate
//   (status = 'active' AND now() inside [sale_starts_at, sale_ends_at)).
//   Off-sale/inactive packages therefore never leave the database, and the
//   details page treats "not in this feed" as 404 — including for a signed-in
//   purchaser whose RLS view of olympiad_packages is deliberately WIDER
//   (lifetime access). The RPC also returns the REAL published pool count
//   (count of questions WHERE status = 'published'), never the display-legacy
//   `questions_per_attempt` column.
//
//   A few card fields are not in that RPC's return type (cover media, attempt
//   duration, sale START). They come from one extra read of
//   `olympiad_packages` that is (a) explicitly `.eq("status","active")`,
//   (b) restricted to the id whitelist the RPC just returned, and (c) still
//   subject to RLS. So the enrichment can only ever ADD columns to rows the
//   server-side gate already approved.
//
// No service-role key is involved anywhere: the anon/server client is enough
// by design.
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { formatLongDate } from "@/lib/formatDate";
import { formatGradeLabel, formatGradeRangeLabel } from "@/lib/gradeLabel";
import { subjectLabel } from "@/lib/subjectLabel";

/** get_public_olympiad_packages() row (migration 070 + 079 grade_levels). */
type PubPkgRow = {
  id: string;
  code: string | null;
  title_az: string | null;
  title_en: string | null;
  title_ru: string | null;
  description_az: string | null;
  description_en: string | null;
  description_ru: string | null;
  price_amount: number | string | null;
  currency: string | null;
  subject_code: string | null;
  subject_name: string | null;
  grade_level: number | null;
  grade_label: string | null;
  /** Round 34: FULL target-grade set (multi-grade packages); null = legacy. */
  grade_levels: number[] | null;
  sale_ends_at: string | null;
  event_at: string | null;
  question_count: number | null;
};

/**
 * Display-ready public view of one on-sale olympiad package. Every field is
 * already localized and formatted; `null` means "not set" and the consuming
 * surface must HIDE the row (Round-43 hide-empty rule) rather than print a
 * placeholder. Deliberately carries no administrative/internal columns.
 */
export type PublicOlympiad = {
  id: string;
  /** olympiad_packages.code — the unique slug used in the details route. */
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  subject: string | null;
  /** Localized single grade or grade range/list; null = no grade targeting. */
  gradeLabel: string | null;
  /** True when the package targets more than one grade (label pluralization). */
  multiGrade: boolean;
  /** REAL published pool size (get_public_olympiad_packages parity). */
  questionCount: number;
  /** Attempt time limit in minutes; null = not set. */
  durationMinutes: number | null;
  /** Event date, long form without time — card meta. */
  eventText: string | null;
  /** Event date WITH time — details page row. */
  eventDetailText: string | null;
  saleStartText: string | null;
  saleEndText: string | null;
  priceText: string;
};

export type PublicOlympiadListResult =
  | { status: "ok"; items: PublicOlympiad[] }
  | { status: "error" };

export type PublicOlympiadResult =
  | { status: "ok"; item: PublicOlympiad }
  | { status: "notFound" }
  | { status: "error" };

/** Extra columns the public RPC does not return, keyed by package id. */
type PkgExtra = {
  durationMinutes: number | null;
  saleStartsAt: string | null;
  coverUrl: string | null;
};

/**
 * Loads the public feed. Returns `null` on ANY failure so callers can tell an
 * empty catalog ("no packages on sale") apart from a backend error — a public
 * page must degrade, never crash.
 *
 * Wrapped in React `cache()`: a page that resolves metadata AND renders the
 * body (details route) hits Supabase once per request.
 */
const loadPublicOlympiads = cache(
  async (limit?: number): Promise<PublicOlympiad[] | null> => {
    const t = await getT();
    const locale = await getLocale();

    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc(
        "get_public_olympiad_packages",
        typeof limit === "number" ? { p_limit: limit } : undefined,
      );
      if (error) return null;

      const rows = (Array.isArray(data) ? (data as PubPkgRow[]) : []).filter(
        (r) => !!r?.id,
      );
      if (rows.length === 0) return [];

      // Enrichment pass — see the header note: id whitelist + explicit active
      // filter, so this can never widen the server-side gate.
      const extras = new Map<string, PkgExtra>();
      const { data: extraRows } = await supabase
        .from("olympiad_packages")
        .select(
          "id, duration_minutes, sale_starts_at, media_assets:cover_media_id(bucket, path)",
        )
        .eq("status", "active")
        .in(
          "id",
          rows.map((r) => r.id),
        );
      for (const e of (extraRows ?? []) as Record<string, unknown>[]) {
        const id = typeof e.id === "string" ? e.id : null;
        if (!id) continue;
        const media = e.media_assets as { bucket?: string; path?: string } | null;
        let coverUrl: string | null = null;
        if (media?.bucket && media?.path) {
          coverUrl =
            supabase.storage.from(media.bucket).getPublicUrl(media.path).data
              .publicUrl ?? null;
        }
        const minutes = Number(e.duration_minutes);
        extras.set(id, {
          durationMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
          saleStartsAt:
            typeof e.sale_starts_at === "string" ? e.sale_starts_at : null,
          coverUrl,
        });
      }

      // Localized pick with az fallback (the RPC already az-falls-back en/ru;
      // the extra guards keep empty strings out either way).
      const pick = (
        az: string | null,
        en: string | null,
        ru: string | null,
      ): string => {
        const v = locale === "en" ? en : locale === "ru" ? ru : az;
        return (v ?? "").trim() || (az ?? "").trim();
      };

      // Round 46: dates ALWAYS go through the shared Baku formatter (a bare
      // "az" Intl tag printed the CLDR root pattern "2026 M08 22"). An
      // absent/invalid date stays null so the row is hidden, not shown as "—".
      const dateText = (iso: string | null, withTime = false): string | null => {
        if (!iso) return null;
        const out = formatLongDate(iso, locale, withTime);
        return out === "—" ? null : out;
      };

      return rows.map((r): PublicOlympiad => {
        const extra = extras.get(r.id) ?? null;
        const levels = Array.isArray(r.grade_levels)
          ? r.grade_levels.filter((n) => Number.isInteger(n))
          : [];
        const multiGrade = levels.length > 1;
        const gradeLabel = multiGrade
          ? formatGradeRangeLabel(levels, locale)
          : levels.length === 1
            ? formatGradeLabel(levels[0], locale, r.grade_label)
            : r.grade_level != null || r.grade_label
              ? formatGradeLabel(r.grade_level, locale, r.grade_label)
              : null;
        const price = Number(r.price_amount ?? 0);
        const desc = pick(
          r.description_az,
          r.description_en,
          r.description_ru,
        ).trim();
        return {
          id: r.id,
          slug: (r.code ?? "").trim() || r.id,
          title: pick(r.title_az, r.title_en, r.title_ru) || "—",
          description: desc || null,
          coverUrl: extra?.coverUrl ?? null,
          subject:
            r.subject_code || r.subject_name
              ? subjectLabel(t, r.subject_code, r.subject_name)
              : null,
          gradeLabel: gradeLabel && gradeLabel !== "—" ? gradeLabel : null,
          multiGrade,
          questionCount: Number(r.question_count ?? 0) || 0,
          durationMinutes: extra?.durationMinutes ?? null,
          eventText: dateText(r.event_at),
          eventDetailText: dateText(r.event_at, true),
          saleStartText: dateText(extra?.saleStartsAt ?? null),
          saleEndText: dateText(r.sale_ends_at),
          priceText: price > 0 ? `${price} ${r.currency ?? "AZN"}` : t("poly.free"),
        };
      });
    } catch {
      return null;
    }
  },
);

/** Public listing. `limit` caps the feed server-side (landing band uses 6). */
export async function getPublicOlympiads(
  limit?: number,
): Promise<PublicOlympiadListResult> {
  const items = await loadPublicOlympiads(limit);
  return items === null ? { status: "error" } : { status: "ok", items };
}

/**
 * One public package by its route segment. Accepts the `code` slug and, as a
 * fallback, the raw id (legacy/blank-code rows). Anything the public feed does
 * not contain — unknown, inactive, off-sale, sales window not open yet — is
 * "notFound" for the public surface.
 */
export async function getPublicOlympiad(
  slug: string,
): Promise<PublicOlympiadResult> {
  const key = (slug ?? "").trim();
  if (!key || key.length > 200) return { status: "notFound" };
  const items = await loadPublicOlympiads();
  if (items === null) return { status: "error" };
  const lower = key.toLowerCase();
  const item =
    items.find((o) => o.slug.toLowerCase() === lower) ??
    items.find((o) => o.id === key) ??
    null;
  return item ? { status: "ok", item } : { status: "notFound" };
}
