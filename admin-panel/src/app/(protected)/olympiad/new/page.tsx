import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getDict, getLocale, getT } from "@/i18n/server";
import { OlympiadCreateForm } from "@/components/OlympiadCreateForm";
import { olympiadLocalDict } from "@/lib/admin/olympiad-strings";
import { mergeLocalDict } from "@/lib/admin/question-flow-labels";

// New Package = one workspace: package fields + the MANDATORY question bulk
// upload submit together (a package is never created with zero questions —
// and, per the creation-only pool rule, never gains questions afterwards).
// The full dict is passed because the inline bulk section shares the bulk.*
// strings with the BulkUploadModal.
export default async function NewOlympiadPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const supabase = await createClient();
  const [{ data: subjects }, { data: grades }, { data: qtypes }, { data: otypes }, fullDict] =
    await Promise.all([
      supabase.from("subjects").select("id, name").order("name"),
      supabase.from("grades").select("id, name, level").order("level"),
      supabase
        .from("question_types")
        .select("code, name, status, options_required, correct_required")
        .order("code"),
      // Round 34: the mandatory type select lives INSIDE this flow now.
      supabase.from("olympiad_types").select("id, name").order("name"),
      getDict(),
    ]);

  const activeTypes = ((qtypes ?? []) as any[]).filter((r) => r.status === "active");
  const activeTypeNames = activeTypes.map((r) => String(r.name));
  // Structure rules for the client-side pre-validation mirror (server = authority).
  const activeTypeRules = activeTypes.map((r) => ({
    code: String(r.code ?? ""),
    name: String(r.name),
    options_required: r.options_required ?? null,
    correct_required: r.correct_required ?? null,
  }));

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div><h1>{t("oly2.new")}</h1></div>
          <Link className="btn-ghost" href="/olympiad">{t("manage.back")}</Link>
        </div>
      </div>
      <section className="card">
        <OlympiadCreateForm
          dict={{
            // Local trilingual additions (bulk v3 five-option rule, sale
            // window, Round-34 multi-grade/type strings) until messages.ts
            // gains these keys; messages.ts wins on merge.
            ...mergeLocalDict(fullDict, locale),
            ...olympiadLocalDict(locale),
          }}
          subjects={((subjects ?? []) as any[]).map((s) => ({ value: s.id, label: s.name }))}
          grades={((grades ?? []) as any[]).map((g) => ({ value: g.id, label: g.name }))}
          olympiadTypes={((otypes ?? []) as any[]).map((o) => ({ value: o.id, label: o.name }))}
          typeNames={activeTypeNames}
          typeRules={activeTypeRules}
          submitLabel={t("manage.add")}
        />
      </section>
    </div>
  );
}
