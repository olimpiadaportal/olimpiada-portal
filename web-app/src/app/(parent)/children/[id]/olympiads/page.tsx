import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { pickTranslation } from "@/lib/localizedName";

// These ids are interpolated into a PostgREST `or=(...)` filter rather than
// bound as a parameter, so they are shape-checked first. They come straight
// back from the database and cannot currently be anything else — the check is
// here so that stays true if the source ever changes.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ParentOlympiadsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parent = await requireParent();
  const { id } = await params;
  const locale = await getLocale();
  const t = await getT();
  const olympiadOn = await isFeatureEnabled("olympiad_module");
  // Payment modes: buying works in real AND giveaway — giveaway windows grant
  // free SUBJECT access only, so olympiad packages stay purchase-only at full
  // price; mode 'off' keeps the paymentsOff notice (no buy form).
  const { mode } = await getPaymentModeInfo();
  const paymentsOn = mode !== "off";
  const supabase = await createClient();

  const { data: child } = await supabase
    .from("students")
    .select("profile_id, first_name, created_by_parent_profile_id, grade_id")
    .eq("profile_id", id)
    .maybeSingle();
  if (!child || (child as any).created_by_parent_profile_id !== parent.profileId) notFound();

  // ENTITLEMENT IS NOT THE CATALOGUE, so purchases are read FIRST and the
  // package query is widened by what this child owns. Filtering on
  // status='active' before knowing that would make an ARCHIVED package the
  // family PAID for disappear from the parent's screen while the child carries
  // on playing it — archiving stops new sales, it has never revoked access
  // (`can_view_olympiad_package` grants through the purchase branch and does
  // not read status). Harmless while archiving took a trip to the edit page's
  // danger zone; now that it is one click from the package list, it is a bug
  // waiting for the first admin who tidies up an old olympiad.
  const { data: purchases } = await supabase
    .from("olympiad_purchases")
    .select("olympiad_package_id, status")
    .eq("student_profile_id", id);
  const owned = new Set(
    ((purchases ?? []) as any[]).filter((p) => p.status === "active").map((p) => p.olympiad_package_id),
  );
  const ownedIds = [...owned].filter(
    (v): v is string => typeof v === "string" && UUID_RE.test(v),
  );
  const packageQuery = supabase
    .from("olympiad_packages")
    .select("id, price_amount, currency, event_starts_at, sale_starts_at, sale_ends_at, olympiad_package_translations(locale, title)");
  const { data: packages } = await (
    ownedIds.length > 0
      ? packageQuery.or(`status.eq.active,id.in.(${ownedIds.join(",")})`)
      : packageQuery.eq("status", "active")
  ).order("created_at");
  const title = (p: any): string =>
    pickTranslation<{ locale: string; title: string | null }>(
      p.olympiad_package_translations,
      locale,
    )?.title ?? "—";
  // Round 34: only packages covering THIS child's grade (legacy grade-less
  // packages and already-owned ones stay visible). Server-rendered filter.
  const childGradeId: string | null = (child as any).grade_id ?? null;
  let list = (packages ?? []) as any[];
  if (list.length > 0) {
    const { data: gradeRows } = await supabase
      .from("olympiad_package_grades")
      .select("olympiad_package_id, grade_id")
      .in("olympiad_package_id", list.map((p) => p.id).slice(0, 100));
    const targeted = new Map<string, string[]>();
    for (const r of (gradeRows ?? []) as any[]) {
      const arr = targeted.get(r.olympiad_package_id) ?? [];
      arr.push(String(r.grade_id));
      targeted.set(r.olympiad_package_id, arr);
    }
    list = list.filter((p) => {
      const set = targeted.get(p.id);
      if (!set) return true;
      if (owned.has(p.id)) return true;
      return childGradeId != null && set.includes(childGradeId);
    });
  }
  // M12: an event date in the past means the package is archived for purchase
  // display — no buy CTA (purchasers keep their access as before).
  const isPast = (p: any): boolean => {
    const ts = p.event_starts_at ? Date.parse(p.event_starts_at) : NaN;
    return Number.isFinite(ts) && ts <= Date.now();
  };
  // Sale window: RLS hides off-sale rows from non-purchaser families; a row a
  // sibling owns can still surface here, so keep the buy CTA off it (the
  // purchase_olympiad RPC rejects off-sale buys server-side either way).
  const isOffSale = (p: any): boolean => {
    const start = p.sale_starts_at ? Date.parse(p.sale_starts_at) : NaN;
    const end = p.sale_ends_at ? Date.parse(p.sale_ends_at) : NaN;
    return (
      (Number.isFinite(start) && start > Date.now()) ||
      (Number.isFinite(end) && end <= Date.now())
    );
  };

  return (
    <section className="prose" style={{ maxWidth: 560 }}>
      <h1>{t("oly3.parentTitle")}</h1>
      <p className="muted">{(child as any).first_name}</p>
      {!olympiadOn ? (
        <div className="price-callout">{t("gate.olympiadOff")}</div>
      ) : list.length === 0 ? (
        <p className="muted">{t("oly3.none")}</p>
      ) : (
        <>
          {mode === "off" && <div className="price-callout">{t("gate.paymentsOff")}</div>}
          <div className="grid">
            {list.map((p) => (
              <div className="card" key={p.id}>
                <strong>{title(p)}</strong>
                <p className="muted">{p.price_amount} {p.currency}</p>
                {owned.has(p.id) ? (
                  <span className="pill">{t("oly3.owned")}</span>
                ) : isPast(p) ? (
                  <span className="pill">{t("oly4.status.held")}</span>
                ) : isOffSale(p) ? (
                  <span className="pill">{t("poly.notOnSale")}</span>
                ) : paymentsOn ? (
                  // THE BUY BUTTON LEFT THIS PAGE (migration 127). It used to
                  // post to a `buyOlympiad` action that called purchase_olympiad
                  // DIRECTLY — a second purchase path beside the catalog modal,
                  // with no quote, no intent and no payment. Two implementations
                  // of one billing rule mis-bill silently the day they drift, so
                  // there is now one: the catalog, which quotes and takes the
                  // parent to the bank.
                  <Link className="btn" href="/olympiads">
                    {t("oly3.buy")}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
      <p style={{ marginTop: 16 }}>
        <Link className="btn-ghost" href="/dashboard">{t("parent.dash.title")}</Link>
      </p>
    </section>
  );
}
