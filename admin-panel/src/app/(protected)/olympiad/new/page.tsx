import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { OlympiadForm } from "@/components/OlympiadForm";

const KEYS = [
  "oly2.subject", "oly2.grade", "oly2.price", "oly2.statusLabel",
  "oly2.status.active", "oly2.status.inactive", "oly2.status.archived",
  "oly2.title", "oly2.desc", "manage.select", "manage.saving",
  "oly2.err.subject", "oly2.err.titleAz",
  "oly2.eventAt", "oly2.eventAtHint", "oly2.eventClear",
];

export default async function NewOlympiadPage() {
  await requireAdmin();
  const t = await getT();
  const supabase = await createClient();
  const [{ data: subjects }, { data: grades }] = await Promise.all([
    supabase.from("subjects").select("id, name").order("name"),
    supabase.from("grades").select("id, name, level").order("level"),
  ]);
  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);
  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div><h1>{t("oly2.new")}</h1></div>
          <Link className="btn-ghost" href="/olympiad">{t("manage.back")}</Link>
        </div>
      </div>
      <section className="card">
        <OlympiadForm
          dict={dict}
          subjects={((subjects ?? []) as any[]).map((s) => ({ value: s.id, label: s.name }))}
          grades={((grades ?? []) as any[]).map((g) => ({ value: g.id, label: g.name }))}
          submitLabel={t("manage.add")}
        />
      </section>
    </div>
  );
}
