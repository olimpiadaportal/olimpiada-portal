// Round 9 (T7) — parent "Olimpiadalar" catalog: browse ALL active olympiad
// packages and buy them for a selected child via the MOCK payment flow.
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
import {
  OlympiadPurchase,
  type PolyChild,
  type PolyDict,
  type PolyPackage,
} from "@/components/OlympiadPurchase";

export default async function ParentOlympiadCatalogPage() {
  const parent = await requireParent();
  const locale = await getLocale();
  const t = await getT();
  const olympiadOn = await isFeatureEnabled("olympiad_module");
  // Payment modes: buying is possible in real/demo/giveaway (giveaways cover
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
  }));

  // Active packages (public listing under RLS) + ownership per child.
  const [{ data: packages }, { data: purchases }] = await Promise.all([
    supabase
      .from("olympiad_packages")
      .select(
        "id, price_amount, currency, event_starts_at, sale_starts_at, sale_ends_at, subjects(code, name), olympiad_types(name), media_assets:cover_media_id(bucket, path), olympiad_package_translations(locale, title, description)",
      )
      .eq("status", "active")
      .order("created_at"),
    childList.length > 0
      ? supabase
          .from("olympiad_purchases")
          .select("olympiad_package_id, student_profile_id, status")
          .in(
            "student_profile_id",
            childList.map((c) => c.id),
          )
          .eq("status", "active")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const ownedByPackage = new Map<string, string[]>();
  for (const p of (purchases ?? []) as any[]) {
    const list = ownedByPackage.get(p.olympiad_package_id) ?? [];
    list.push(p.student_profile_id);
    ownedByPackage.set(p.olympiad_package_id, list);
  }

  // Round 34: the parent storefront shows ONLY packages covering at least one
  // of their children's grades (a package covering two of them appears once —
  // rows are already unique). Legacy grade-less packages stay visible; owned
  // packages stay visible to their family regardless. Server-rendered filter.
  const childGrades = new Set(
    ((children ?? []) as any[]).map((c) => c.grade_id).filter(Boolean),
  );
  const targeted = new Map<string, string[]>();
  {
    const ids = ((packages ?? []) as any[]).map((p) => p.id);
    if (ids.length > 0) {
      const { data: gradeRows } = await supabase
        .from("olympiad_package_grades")
        .select("olympiad_package_id, grade_id")
        .in("olympiad_package_id", ids.slice(0, 100));
      for (const r of (gradeRows ?? []) as any[]) {
        const list = targeted.get(r.olympiad_package_id) ?? [];
        list.push(String(r.grade_id));
        targeted.set(r.olympiad_package_id, list);
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
  // Round 34 parity with mobile's my_question_count: the number a parent sees
  // is what their FAMILY would actually receive — the sum of the pools of the
  // package grades matching their children's grades (legacy grade-less
  // packages keep the whole-pool count). One RPC call per distinct child
  // grade (2–3 in practice) + one no-grade call for legacy rows.
  const poolCounts = new Map<string, number>();
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
    const bump = (id: string, n: number) =>
      poolCounts.set(id, (poolCounts.get(id) ?? 0) + n);
    for (const [gradeId, ids] of idsByGrade) {
      const { data: countRows } = await supabase.rpc("get_olympiad_pool_counts", {
        p_package_ids: ids.slice(0, 100),
        p_grade_id: gradeId,
      });
      for (const r of (countRows ?? []) as any[]) {
        bump(r.package_id, Number(r.question_count) || 0);
      }
    }
    if (legacyIds.length > 0) {
      const { data: countRows } = await supabase.rpc("get_olympiad_pool_counts", {
        p_package_ids: legacyIds.slice(0, 100),
      });
      for (const r of (countRows ?? []) as any[]) {
        bump(r.package_id, Number(r.question_count) || 0);
      }
    }
  }

  const pickTr = (trs: any[]) =>
    (trs ?? []).find((x: any) => x.locale === locale) ??
    (trs ?? []).find((x: any) => x.locale === "az");

  const fmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Serializable view models — the client component receives only translated,
  // display-ready strings (no locale logic in the browser).
  const items: PolyPackage[] = pkgRows.map((p) => {
    const tr = pickTr(p.olympiad_package_translations);
    const n = poolCounts.get(p.id) ?? 0;
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
    return {
      id: p.id,
      title: tr?.title ?? "—",
      desc: typeof tr?.description === "string" ? tr.description.trim() : "",
      coverUrl,
      subject: p.subjects?.name
        ? subjectLabel(t, p.subjects?.code, p.subjects.name)
        : null,
      typeName: p.olympiad_types?.name ?? null,
      dateText: Number.isFinite(ts) ? fmt.format(new Date(ts)) : null,
      questionsText: `${n} ${t("poly.questions")}`,
      priceText: price > 0 ? `${price} ${p.currency ?? "AZN"}` : t("poly.free"),
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
    buy: t("poly.buy"),
    price: t("poly.price"),
    modalTitle: t("poly.modal.title"),
    modalPackage: t("poly.modal.package"),
    modalChild: t("poly.modal.child"),
    modalMockNote: t("poly.modal.mockNote"),
    modalConfirm: t("poly.modal.confirm"),
    modalCancel: t("poly.modal.cancel"),
    modalClose: t("poly.modal.close"),
    modalPending: t("poly.modal.pending"),
    modalSuccess: t("poly.modal.success"),
    modalAlready: t("poly.modal.already"),
    pastLabel: t("oly4.status.held"),
    notOnSaleLabel: t("poly.notOnSale"),
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
