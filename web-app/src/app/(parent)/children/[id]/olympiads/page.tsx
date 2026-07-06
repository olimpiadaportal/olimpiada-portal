import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { buyOlympiad } from "@/lib/auth/olympiadService";

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
  // Payment modes: buy in real/demo/giveaway — giveaway windows grant free
  // SUBJECT access only, so olympiad packages stay purchase-only at full
  // price; mode 'off' keeps the paymentsOff notice (no buy form).
  const { mode } = await getPaymentModeInfo();
  const paymentsOn = mode !== "off";
  const supabase = await createClient();

  const { data: child } = await supabase
    .from("students")
    .select("profile_id, first_name, created_by_parent_profile_id")
    .eq("profile_id", id)
    .maybeSingle();
  if (!child || (child as any).created_by_parent_profile_id !== parent.profileId) notFound();

  const { data: packages } = await supabase
    .from("olympiad_packages")
    .select("id, price_amount, currency, event_starts_at, olympiad_package_translations(locale, title)")
    .eq("status", "active")
    .order("created_at");
  const { data: purchases } = await supabase
    .from("olympiad_purchases")
    .select("olympiad_package_id, status")
    .eq("student_profile_id", id);
  const owned = new Set(
    ((purchases ?? []) as any[]).filter((p) => p.status === "active").map((p) => p.olympiad_package_id),
  );
  const title = (p: any): string => {
    const trs = p.olympiad_package_translations ?? [];
    return (trs.find((x: any) => x.locale === locale) ?? trs.find((x: any) => x.locale === "az"))?.title ?? "—";
  };
  const list = (packages ?? []) as any[];
  // M12: an event date in the past means the package is archived for purchase
  // display — no buy CTA (purchasers keep their access as before).
  const isPast = (p: any): boolean => {
    const ts = p.event_starts_at ? Date.parse(p.event_starts_at) : NaN;
    return Number.isFinite(ts) && ts <= Date.now();
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
                ) : paymentsOn ? (
                  <form action={buyOlympiad}>
                    <input type="hidden" name="student_id" value={id} />
                    <input type="hidden" name="package_id" value={p.id} />
                    <button className="btn" type="submit">{t("oly3.buy")}</button>
                  </form>
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
