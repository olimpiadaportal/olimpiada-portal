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
  const paymentsOn = await isFeatureEnabled("payments");

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
    .select("profile_id, first_name, last_name")
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
        "id, price_amount, currency, questions_per_attempt, event_starts_at, subjects(name), olympiad_types(name), media_assets:cover_media_id(bucket, path), olympiad_package_translations(locale, title, description)",
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
  const items: PolyPackage[] = ((packages ?? []) as any[]).map((p) => {
    const tr = pickTr(p.olympiad_package_translations);
    const n = Number(p.questions_per_attempt ?? 25) || 25;
    let coverUrl: string | null = null;
    const m = p.media_assets;
    if (m?.bucket && m?.path) {
      coverUrl = supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
    }
    const ts = p.event_starts_at ? Date.parse(p.event_starts_at) : NaN;
    const price = Number(p.price_amount ?? 0);
    return {
      id: p.id,
      title: tr?.title ?? "—",
      desc: typeof tr?.description === "string" ? tr.description.trim() : "",
      coverUrl,
      subject: p.subjects?.name ?? null,
      typeName: p.olympiad_types?.name ?? null,
      dateText: Number.isFinite(ts) ? fmt.format(new Date(ts)) : null,
      questionsText: `${n} ${t("poly.questions")}`,
      priceText: price > 0 ? `${price} ${p.currency ?? "AZN"}` : t("poly.free"),
      ownedBy: ownedByPackage.get(p.id) ?? [],
    };
  });

  const dict: PolyDict = {
    chooseChild: t("poly.chooseChild"),
    noChildren: t("poly.noChildren"),
    addChild: t("poly.addChild"),
    none: t("poly.none"),
    owned: t("poly.owned"),
    buyFor: t("poly.buyFor"),
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
  };

  return (
    <section className="poly-page">
      <div className="poly-head">
        <h1>{t("poly.title")}</h1>
        <p className="poly-sub">{t("poly.subtitle")}</p>
      </div>

      {!paymentsOn && <div className="price-callout">{t("gate.paymentsOff")}</div>}

      <OlympiadPurchase
        childrenList={childList}
        packages={items}
        canBuy={paymentsOn}
        dict={dict}
      />
    </section>
  );
}
