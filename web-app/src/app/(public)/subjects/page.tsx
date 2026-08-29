import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { subjectLabel } from "@/lib/subjectLabel";

// The PUBLIC subject catalog — read from Admin → Subjects, not from a literal.
//
// THIS PAGE IS THE REPORTED BUG. It used to render four fixed i18n keys
// ("subject.math", "subject.science", "subject.logic", "subject.english") and
// query nothing at all, so a subject an admin created and published could never
// appear here however long they waited. Two of those four keys did not even
// name real rows: the live subjects behind them are `elm` and `az_language`.
//
// DELIBERATELY NOT KEYED ON `subjects_pricing`. This page is INFORMATIONAL —
// "what does OlympIQ teach" — and a price answers "is it sellable", not "does
// it exist". Reading pricing here would hide a published-but-unpriced subject
// exactly the way it hid three of the seven live subjects from the child arena
// (see the note in lib/childSubjects.ts). /services stays the priced surface.
//
// `subjects.status` is the admin's own publish switch, and it is a purely
// client-side filter: policy `subjects_select` is USING (true), so anon reads
// every row including inactive and archived ones. Filtering it is ours to do.
//
// Read live, with no unstable_cache around it: the page is request-dynamic
// anyway (getT() reads cookies) and the admin panel is a separate deployment
// that cannot revalidate a cache here, so a cache would only mean "published,
// still missing" — the complaint this page exists to answer.
export default async function SubjectsPage() {
  const t = await getT();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("subjects")
    .select("id, code, name")
    .eq("status", "active");

  // Sorted on the RESOLVED label, not on the raw az `name`: the catalog stores
  // Azerbaijani names, so ordering in SQL would leave an English or Russian
  // visitor with an alphabet that is not theirs.
  const subjects = (error ? [] : ((data ?? []) as { id: string; code: string | null; name: string }[]))
    .map((s) => ({ id: s.id, label: subjectLabel(t, s.code, s.name) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <section className="prose">
      <h1>{t("subjects.title")}</h1>
      <p className="lead">{t("subjects.lead")}</p>
      {subjects.length === 0 ? (
        <p className="muted">{t("cfg.noSubjects")}</p>
      ) : (
        <div className="grid">
          {subjects.map((s) => (
            <div className="card" key={s.id}>
              <strong>{s.label}</strong>
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ marginTop: 16 }}>
        {t("subjects.note")}
      </p>
    </section>
  );
}
