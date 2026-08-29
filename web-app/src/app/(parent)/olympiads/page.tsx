// Round 9 (T7) — parent "Olimpiadalar" catalog: browse active olympiad
// packages and buy them for a selected child via the MOCK payment flow.
// Round 40: the SELECTED child controls the visible list — this page ships the
// family-scoped superset (grades + per-grade counts) and the client narrows it.
//
// Gates mirror the per-child purchase page (/children/[id]/olympiads):
//   - olympiad_module off → friendly notice instead of the catalog;
//   - payments off        → catalog stays browsable, buy buttons hidden + notice.
// A successful purchase (purchase_olympiad RPC, status active) automatically
// appears in the student's "Olimpiadalarım" — no extra wiring needed there.
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { subjectLabel } from "@/lib/subjectLabel";
import { pickTranslation } from "@/lib/localizedName";
import { formatLongDate } from "@/lib/formatDate";
import { formatAzn } from "@/lib/pricingConfigurator";
import { formatGradeLabel, formatGradeRangeLabel } from "@/lib/gradeLabel";
import {
  OlympiadPurchase,
  type PolyChild,
  type PolyDict,
  type PolyPackage,
} from "@/components/OlympiadPurchase";

// Shape-checked before being interpolated into a PostgREST `or=(...)` filter,
// which takes a raw string rather than a bound parameter. The ids come straight
// back from the database today; the check keeps that assumption honest.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The olympiad_package_translations columns this page embeds. */
type PackageTr = { locale: string; title: string | null; description: string | null };

export default async function ParentOlympiadCatalogPage() {
  const parent = await requireParent();
  const locale = await getLocale();
  const t = await getT();
  const olympiadOn = await isFeatureEnabled("olympiad_module");
  // Payment modes: buying is possible in real AND giveaway (giveaways cover
  // free SUBJECT access only — olympiad packages are always purchase-only);
  // mode 'off' keeps the existing paymentsOff notice.
  const { mode } = await getPaymentModeInfo();
  const paymentsOn = mode !== "off";

  if (!olympiadOn) {
    return (
      <section className="poly-page">
        <h1>{t("poly.title")}</h1>
        <div className="price-callout">{t("gate.olympiadOff")}</div>
      </section>
    );
  }

  const supabase = await createClient();

  // Parent's children — same source as the dashboard list.
  const { data: children } = await supabase
    .from("students")
    .select("profile_id, first_name, last_name, grade_id")
    .eq("created_by_parent_profile_id", parent.profileId)
    .order("created_at", { ascending: true });
  const childList: PolyChild[] = ((children ?? []) as any[]).map((c) => ({
    id: c.profile_id,
    name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "—",
    gradeId: c.grade_id ? String(c.grade_id) : null,
  }));

  // OWNERSHIP IS READ FIRST, because it widens the package query. The catalogue
  // is status='active'; what this FAMILY OWNS is not a catalogue question at
  // all. Asking for active packages and then joining purchases onto the result
  // means an ARCHIVED package the family PAID for silently leaves the parent's
  // screen while the child keeps playing it — `can_view_olympiad_package()`
  // grants access through the purchase branch and never reads status, so the
  // two halves of the product disagreed. Archiving stops new sales; it has
  // never revoked access, and it is now one click from the admin package list.
  const { data: purchases } =
    childList.length > 0
      ? await supabase
          .from("olympiad_purchases")
          .select("olympiad_package_id, student_profile_id, status")
          .in(
            "student_profile_id",
            childList.map((c) => c.id),
          )
          .eq("status", "active")
      : { data: [] as any[] };
  const ownedPackageIds = [
    ...new Set(((purchases ?? []) as any[]).map((p) => p.olympiad_package_id)),
  ].filter((v): v is string => typeof v === "string" && UUID_RE.test(v));

  const packageQuery = supabase
    .from("olympiad_packages")
    .select(
      "id, price_amount, currency, duration_minutes, questions_per_attempt, event_starts_at, sale_starts_at, sale_ends_at, subjects(code, name), olympiad_types(name), media_assets:cover_media_id(bucket, path), olympiad_package_translations(locale, title, description)",
    );
  const [{ data: packages }, { data: gradeCatalog }] = await Promise.all([
    (ownedPackageIds.length > 0
      ? packageQuery.or(`status.eq.active,id.in.(${ownedPackageIds.join(",")})`)
      : packageQuery.eq("status", "active")
    ).order("created_at"),
    supabase.from("grades").select("id, level"),
  ]);

  // grade id → level (for the details modal's Sinif/Siniflər label).
  const gradeLevelById = new Map<string, number>();
  for (const g of (gradeCatalog ?? []) as any[]) {
    if (g?.id && Number.isInteger(g.level)) gradeLevelById.set(String(g.id), Number(g.level));
  }

  const ownedByPackage = new Map<string, string[]>();
  for (const p of (purchases ?? []) as any[]) {
    const list = ownedByPackage.get(p.olympiad_package_id) ?? [];
    list.push(p.student_profile_id);
    ownedByPackage.set(p.olympiad_package_id, list);
  }

  // Round 34: the server ships only packages covering at least one of the
  // family's grades (a package covering two of them appears once — rows are
  // already unique). Legacy grade-less packages stay visible; owned packages
  // stay visible to their family regardless. Round 40: the client then NARROWS
  // this family superset to the SELECTED child (grade match / owned / legacy).
  const childGrades = new Set(
    ((children ?? []) as any[]).map((c) => c.grade_id).filter(Boolean),
  );
  const targeted = new Map<string, string[]>();
  // Migration 106: a package's question count and duration are PER GRADE, so
  // one number can no longer describe a multi-grade package. These maps let the
  // client show what the SELECTED child would actually get — the same shape
  // countByGrade already uses for pool sizes. A missing entry means that grade
  // stores no override and the package-level value applies.
  const perAttemptByPkgGrade = new Map<string, Record<string, number>>();
  const durationByPkgGrade = new Map<string, Record<string, number>>();
  {
    const ids = ((packages ?? []) as any[]).map((p) => p.id);
    if (ids.length > 0) {
      const { data: gradeRows } = await supabase
        .from("olympiad_package_grades")
        .select("olympiad_package_id, grade_id, questions_per_attempt, duration_minutes")
        .in("olympiad_package_id", ids.slice(0, 100));
      for (const r of (gradeRows ?? []) as any[]) {
        const pkgId = String(r.olympiad_package_id);
        const gradeId = String(r.grade_id);
        const list = targeted.get(pkgId) ?? [];
        list.push(gradeId);
        targeted.set(pkgId, list);

        if (r.questions_per_attempt != null) {
          const m = perAttemptByPkgGrade.get(pkgId) ?? {};
          m[gradeId] = Number(r.questions_per_attempt);
          perAttemptByPkgGrade.set(pkgId, m);
        }
        if (r.duration_minutes != null) {
          const m = durationByPkgGrade.get(pkgId) ?? {};
          m[gradeId] = Number(r.duration_minutes);
          durationByPkgGrade.set(pkgId, m);
        }
      }
    }
    const visible = (p: any): boolean => {
      const set = targeted.get(p.id);
      if (!set) return true; // legacy grade-less
      if (ownedByPackage.has(p.id)) return true; // family already owns it
      return set.some((g) => childGrades.has(g));
    };
    (packages as any[])?.splice(
      0,
      (packages as any[]).length,
      ...((packages ?? []) as any[]).filter(visible),
    );
  }

  // Round 21 (item 3): the REAL published pool size per package — the legacy
  // questions_per_attempt column is display-only (default 25, never written by
  // the admin form). One RPC over the visible ids; a package with an empty
  // pool returns NO row → coalesce to 0.
  const pkgRows = (packages ?? []) as any[];
  // Round 40 (was Round 34 family sums): counts are stored PER GRADE so the
  // client can show the number the SELECTED child would actually receive.
  // One RPC call per distinct child grade (2–3 in practice) covering that
  // grade's matching packages + one no-grade call for legacy grade-less rows
  // (their whole-pool count is the client-side fallback).
  const countsByPkg = new Map<string, Record<string, number>>();
  const legacyCounts = new Map<string, number>();
  if (pkgRows.length > 0) {
    const legacyIds: string[] = [];
    const idsByGrade = new Map<string, string[]>();
    for (const p of pkgRows) {
      const set = targeted.get(p.id);
      if (!set) {
        legacyIds.push(p.id);
        continue;
      }
      for (const g of set) {
        if (!childGrades.has(g)) continue;
        const list = idsByGrade.get(g) ?? [];
        list.push(p.id);
        idsByGrade.set(g, list);
      }
    }
    for (const [gradeId, ids] of idsByGrade) {
      const { data: countRows } = await supabase.rpc("get_olympiad_pool_counts", {
        p_package_ids: ids.slice(0, 100),
        p_grade_id: gradeId,
      });
      for (const r of (countRows ?? []) as any[]) {
        const rec = countsByPkg.get(r.package_id) ?? {};
        rec[gradeId] = Number(r.question_count) || 0;
        countsByPkg.set(r.package_id, rec);
      }
    }
    if (legacyIds.length > 0) {
      const { data: countRows } = await supabase.rpc("get_olympiad_pool_counts", {
        p_package_ids: legacyIds.slice(0, 100),
      });
      for (const r of (countRows ?? []) as any[]) {
        legacyCounts.set(r.package_id, Number(r.question_count) || 0);
      }
    }
  }

  // Round 46: the shared Baku formatter (a bare "az" tag here rendered the
  // CLDR root month placeholder — "2026 M08 22").
  const fmt = (ts: number) => formatLongDate(ts, locale, true);

  // Serializable view models — the client component receives only translated,
  // display-ready strings (no locale logic in the browser).
  const items: PolyPackage[] = pkgRows.map((p) => {
    const tr = pickTranslation<PackageTr>(p.olympiad_package_translations, locale);
    let coverUrl: string | null = null;
    const m = p.media_assets;
    if (m?.bucket && m?.path) {
      coverUrl = supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
    }
    const ts = p.event_starts_at ? Date.parse(p.event_starts_at) : NaN;
    const price = Number(p.price_amount ?? 0);
    // Sale window (DB round: RLS hides off-sale rows from non-purchasers, so an
    // off-sale row only reaches a family that already owns it via ANOTHER
    // child; the RPC rejects such buys server-side either way). Cosmetic gate:
    // outside [sale_starts_at, sale_ends_at] the card shows a chip, not Buy.
    const saleStart = p.sale_starts_at ? Date.parse(p.sale_starts_at) : NaN;
    const saleEnd = p.sale_ends_at ? Date.parse(p.sale_ends_at) : NaN;
    const offSale =
      (Number.isFinite(saleStart) && saleStart > Date.now()) ||
      (Number.isFinite(saleEnd) && saleEnd <= Date.now());
    // Target-grade label (Round 43, details modal): map the package's grade ids
    // to levels; a multi-grade package reads as a range/list, legacy grade-less
    // rows have no label (the row is hidden).
    const gradeSet = targeted.get(p.id) ?? null;
    const gradeLevels = (gradeSet ?? [])
      .map((gid) => gradeLevelById.get(gid))
      .filter((n): n is number => typeof n === "number");
    const gradeLabel =
      gradeLevels.length > 1
        ? formatGradeRangeLabel(gradeLevels, locale)
        : gradeLevels.length === 1
          ? formatGradeLabel(gradeLevels[0], locale)
          : null;
    const durationMinutes = Number.isFinite(Number(p.duration_minutes))
      ? Number(p.duration_minutes)
      : null;
    return {
      id: p.id,
      title: tr?.title ?? "—",
      desc: typeof tr?.description === "string" ? tr.description.trim() : "",
      coverUrl,
      subject: p.subjects?.name
        ? subjectLabel(t, p.subjects?.code, p.subjects.name)
        : null,
      typeName: p.olympiad_types?.name ?? null,
      dateText: Number.isFinite(ts) ? fmt(ts) : null,
      gradeIds: gradeSet,
      gradeLabel,
      countByGrade: countsByPkg.get(p.id) ?? {},
      fallbackCount: legacyCounts.get(p.id) ?? 0,
      questionsPerAttempt: Number(p.questions_per_attempt ?? 0) || 0,
      durationMinutes,
      // Migration 106: per-grade overrides; the two values above are the
      // package-level fallback for a grade that has none.
      perAttemptByGrade: perAttemptByPkgGrade.get(p.id) ?? {},
      durationByGrade: durationByPkgGrade.get(p.id) ?? {},
      saleStartText: Number.isFinite(saleStart) ? fmt(saleStart) : null,
      saleEndText: Number.isFinite(saleEnd) ? fmt(saleEnd) : null,
      // Round 51 (audit): ONE money format everywhere — this page printed
      // "25 AZN" while the public surfaces print "25,00 AZN" (formatAzn).
      priceText:
        price > 0
          ? (p.currency ?? "AZN") === "AZN"
            ? formatAzn(price, locale)
            : `${price} ${p.currency}`
          : t("poly.free"),
      ownedBy: ownedByPackage.get(p.id) ?? [],
      // M12: the event already happened → archived for purchase display
      // (no buy CTA; purchasers keep their access as before).
      past: Number.isFinite(ts) && ts <= Date.now(),
      offSale,
    };
  });

  const dict: PolyDict = {
    chooseChild: t("poly.chooseChild"),
    noChildren: t("poly.noChildren"),
    addChild: t("poly.addChild"),
    none: t("poly.none"),
    owned: t("poly.owned"),
    questions: t("poly.questions"),
    buy: t("poly.buy"),
    price: t("poly.price"),
    modalTitle: t("poly.modal.title"),
    modalPackage: t("poly.modal.package"),
    modalChild: t("poly.modal.child"),
    modalPayNote: t("poly.modal.payNote"),
    modalConfirm: t("poly.modal.confirm"),
    modalCancel: t("poly.modal.cancel"),
    modalClose: t("poly.modal.close"),
    modalPending: t("poly.modal.pending"),
    modalSuccess: t("poly.modal.success"),
    modalAlready: t("poly.modal.already"),
    pastLabel: t("oly4.status.held"),
    notOnSaleLabel: t("poly.notOnSale"),
    details: t("poly.details"),
    detType: t("poly.det.type"),
    detSubject: t("poly.det.subject"),
    detGrade: t("poly.det.grade"),
    detGrades: t("poly.det.grades"),
    detQuestions: t("poly.det.questions"),
    detPerAttempt: t("poly.det.perAttempt"),
    detDuration: t("poly.det.duration"),
    detEventAt: t("poly.det.eventAt"),
    detSaleStart: t("poly.det.saleStart"),
    detSaleEnd: t("poly.det.saleEnd"),
    detPrice: t("poly.det.price"),
    detDescription: t("poly.det.description"),
    detMinutes: t("poly.det.minutes"),
  };

  return (
    <section className="poly-page">
      <div className="poly-head">
        <h1>{t("poly.title")}</h1>
        <p className="poly-sub">{t("poly.subtitle")}</p>
      </div>

      {mode === "off" && <div className="price-callout">{t("gate.paymentsOff")}</div>}

      <OlympiadPurchase
        childrenList={childList}
        packages={items}
        canBuy={paymentsOn}
        dict={dict}
      />
    </section>
  );
}
