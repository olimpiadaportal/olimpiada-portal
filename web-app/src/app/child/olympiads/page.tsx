import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { startOlympiad } from "@/lib/auth/childActions";

export default async function ChildOlympiadsPage() {
  const child = await requireChild();
  const locale = await getLocale();
  const t = await getT();
  const supabase = await createClient();

  const { data: purchases } = await supabase
    .from("olympiad_purchases")
    .select("olympiad_package_id, status, olympiad_packages(olympiad_package_translations(locale, title))")
    .eq("student_profile_id", child.profileId)
    .eq("status", "active");
  const list = (purchases ?? []) as any[];
  const title = (p: any): string => {
    const trs = p.olympiad_packages?.olympiad_package_translations ?? [];
    return (trs.find((x: any) => x.locale === locale) ?? trs.find((x: any) => x.locale === "az"))?.title ?? "—";
  };

  return (
    <section>
      <p className="arena-eyebrow">{t("arena.nav.tasks")}</p>
      <h1 style={{ marginBottom: 20 }}>{t("oly3.childTitle")}</h1>
      {list.length === 0 ? (
        <div className="arena-panel arena-muted">{t("oly3.childNone")}</div>
      ) : (
        <div className="arena-panel">
          {list.map((p) => (
            <div className="arena-round" key={p.olympiad_package_id}>
              <span className="arena-round-icon">★</span>
              <div className="arena-round-body">
                <div className="arena-round-title">{title(p)}</div>
                <div className="arena-round-meta">25 {t("arena.questionsShort")}</div>
              </div>
              <form action={startOlympiad}>
                <input type="hidden" name="package_id" value={p.olympiad_package_id} />
                <button className="arena-btn arena-btn-sm" type="submit">
                  {t("oly3.start")}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
