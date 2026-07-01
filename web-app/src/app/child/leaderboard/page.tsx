import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";

// Read-only leaderboard. RLS scopes a child to its OWN rows, so we build the
// "me" row from the child's real graded attempts and clearly mark the full
// board as coming soon — no fabricated participants.
export default async function ChildLeaderboardPage() {
  const child = await requireChild();
  const t = await getT();
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("first_name, last_name, city")
    .eq("profile_id", child.profileId)
    .maybeSingle();
  const first = (student as any)?.first_name ?? "";
  const last = (student as any)?.last_name ?? "";
  const name = `${first} ${last}`.trim() || t("arena.lb.you");
  const city = (student as any)?.city ?? "—";
  const initial = (first.trim()[0] ?? "?").toUpperCase();

  const { data: attempts } = await supabase
    .from("test_attempts")
    .select("score, max_score")
    .eq("student_profile_id", child.profileId)
    .eq("status", "graded");
  const graded = (attempts ?? []) as any[];

  let totalScore = 0;
  let totalMax = 0;
  for (const a of graded) {
    totalScore += Number(a.score ?? 0);
    totalMax += Number(a.max_score ?? 0);
  }
  const points = Math.round(totalScore);
  const accuracy = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const hasResults = graded.length > 0;

  const FILTERS: [string, boolean][] = [
    ["arena.lb.country", true],
    ["arena.lb.region", false],
    ["arena.lb.school", false],
    ["arena.lb.grade", false],
  ];

  return (
    <section>
      <p className="arena-eyebrow">{t("arena.lb.eyebrow")}</p>
      <h1 style={{ marginBottom: 18 }}>{t("arena.lb.title")}</h1>

      <div className="arena-chips" role="group" aria-label={t("arena.lb.title")}>
        {FILTERS.map(([key, active]) => (
          <button
            key={key}
            type="button"
            className={`arena-chip${active ? " active" : ""}`}
            disabled={!active}
          >
            {t(key)}
          </button>
        ))}
      </div>

      <div className="arena-panel" style={{ padding: 8 }}>
        {hasResults ? (
          <table className="arena-table">
            <thead>
              <tr>
                <th>{t("arena.lb.colRank")}</th>
                <th>{t("arena.lb.colParticipant")}</th>
                <th className="num">{t("arena.lb.colAccuracy")}</th>
                <th className="num">{t("arena.lb.colPoints")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="me">
                <td className="arena-rank-cell">01</td>
                <td>
                  <div className="arena-part">
                    <span className="arena-part-av">{initial}</span>
                    <div>
                      <div className="arena-part-name">
                        {name} <span className="arena-pts">· {t("arena.lb.you")}</span>
                      </div>
                      <div className="arena-part-city">{city}</div>
                    </div>
                  </div>
                </td>
                <td className="num">{accuracy}%</td>
                <td className="num arena-pts">{points}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="arena-muted" style={{ margin: 0, padding: 16 }}>
            {t("arena.lb.empty")}
          </p>
        )}
      </div>

      <p className="arena-dim" style={{ marginTop: 16, fontSize: "0.86rem" }}>
        {t("arena.lb.soon")}
      </p>
    </section>
  );
}
