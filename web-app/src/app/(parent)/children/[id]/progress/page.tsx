import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parent = await requireParent();
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();

  const { data: child } = await supabase
    .from("students")
    .select("first_name, created_by_parent_profile_id")
    .eq("profile_id", id)
    .maybeSingle();
  if (!child || (child as any).created_by_parent_profile_id !== parent.profileId) notFound();

  const { data: results } = await supabase
    .from("test_attempts")
    .select("id, kind, score, max_score, submitted_at, subjects(name)")
    .eq("student_profile_id", id)
    .eq("status", "graded")
    .order("submitted_at", { ascending: false })
    .limit(50);
  const list = (results ?? []) as any[];

  return (
    <section className="prose" style={{ maxWidth: 560 }}>
      <h1>{t("prog.title")}</h1>
      <p className="muted">{(child as any).first_name}</p>
      {list.length === 0 ? (
        <p className="muted">{t("prog.none")}</p>
      ) : (
        <ul className="clean">
          {list.map((r) => (
            <li key={r.id}>
              {r.subjects?.name ?? "—"} · {t(`kind.${r.kind}`)} ·{" "}
              <strong>{r.score}/{r.max_score}</strong> ·{" "}
              {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : ""}
            </li>
          ))}
        </ul>
      )}
      <p style={{ marginTop: 16 }}>
        <Link className="btn-ghost" href="/dashboard">{t("parent.dash.title")}</Link>
      </p>
    </section>
  );
}
