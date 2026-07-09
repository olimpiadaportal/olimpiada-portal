import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { isGiveawayActive } from "@/lib/paymentMode";
import { isChildFreeAccessActive } from "@/lib/freeAccess";
import { ChildCardActions } from "@/components/ChildCardActions";
import { InfoCarousel, type InfoSlide } from "@/components/InfoCarousel";
import { ParentNewsPanel } from "@/components/ParentNewsPanel";

const CHILD_KEYS = [
  "child.resetPw", "child.newPassword", "child.resetPwSubmit",
  "child.resetPwOk", "child.deleteChild", "child.deleteConfirm",
  "profile.cancel", // ConfirmModal cancel label (R9)
];

const NEWS_KEYS = ["news.latest", "news.viewAll", "news.none"];

// get_child_leaderboard_summary payload (all fields optional-defensive: any RPC
// error/null is treated as "no leaderboard data" for that child).
type LbSummary = {
  points_month?: number | null;
  points_all_time?: number | null;
  current_streak?: number | null;
  best_streak?: number | null;
  rank_month?: number | null;
  total_month?: number | null;
  rank_all_time?: number | null;
};

export default async function ParentDashboard() {
  const parent = await requireParent();
  const t = await getT();
  const olympiadOn = await isFeatureEnabled("olympiad_module");
  // L-quick: the child leaderboard chip is gated by the `leaderboard` flag.
  const leaderboardOn = await isFeatureEnabled("leaderboard");
  // Round 11: during the giveaway window every child effectively has free
  // access, so the cards show one highlighted "free giveaway" pill instead of
  // the raw access status; the real status resumes automatically afterwards.
  const giveawayActive = await isGiveawayActive();
  const supabase = await createClient();

  // Children list.
  const { data: children } = await supabase
    .from("students")
    .select("profile_id, first_name, last_name, child_unique_id, access_status, class_grade")
    .eq("created_by_parent_profile_id", parent.profileId)
    .order("created_at", { ascending: true });
  const list = (children ?? []) as any[];

  // M10: a per-child FREE-ACCESS interval shows the same "free" pill the
  // giveaway uses instead of the raw access_status. Per-child check (small N)
  // so a window for one child never re-labels an uncovered sibling.
  const freeAccessByChild = new Map<string, boolean>(
    await Promise.all(
      list.map(
        async (c) =>
          [c.profile_id as string, await isChildFreeAccessActive(c.profile_id)] as const,
      ),
    ),
  );

  // L-quick: each child's leaderboard summary (rank/points/streak) via the
  // parent-scoped RPC — RLS inside the RPC verifies the parent↔child link, so
  // it is safe to call per child. Only fetched when the flag is on. Any
  // error/null → no chip data for that child (rendered as "not ranked yet").
  const lbByChild = new Map<string, LbSummary | null>();
  if (leaderboardOn && list.length > 0) {
    const results = await Promise.all(
      list.map(async (c) => {
        try {
          const { data, error } = await supabase.rpc("get_child_leaderboard_summary", {
            p_student: c.profile_id,
          });
          if (error || !data) return [c.profile_id, null] as const;
          return [c.profile_id, data as LbSummary] as const;
        } catch {
          return [c.profile_id, null] as const;
        }
      }),
    );
    for (const [id, s] of results) lbByChild.set(id, s);
  }

  const childDict: Record<string, string> = {};
  for (const k of CHILD_KEYS) childDict[k] = t(k);
  const newsDict: Record<string, string> = {};
  for (const k of NEWS_KEYS) newsDict[k] = t(k);

  const carouselSlides: InfoSlide[] = [1, 2, 3, 4, 5].map((n) => ({
    title: t(`carousel.i${n}.title`),
    body: t(`carousel.i${n}.body`),
  }));

  return (
    <section className="parent-home">
      {/* 1) Information carousel */}
      <div className="home-block">
        <InfoCarousel title={t("carousel.title")} slides={carouselSlides} />
      </div>

      {/* 2) My children — heading left, Add-child button pushed to the right */}
      <div className="home-block">
        <div className="children-head">
          <h1>{t("parent.dash.title")}</h1>
          <Link className="btn" href="/children/new">
            {t("parent.dash.addChild")}
          </Link>
        </div>

        {list.length === 0 ? (
          <p className="muted">{t("parent.dash.noChildren")}</p>
        ) : (
          <div className="children-grid">
            {list.map((c) => {
              const lb = leaderboardOn ? lbByChild.get(c.profile_id) : null;
              const lbRanked =
                !!lb && lb.rank_month != null && Number(lb.points_month ?? 0) > 0;
              return (
              <div className="card" key={c.profile_id}>
                <strong>
                  {c.first_name} {c.last_name}
                </strong>
                <p className="muted">
                  {t("parent.dash.childId")}:{" "}
                  {c.child_unique_id ? (
                    <code>{c.child_unique_id}</code>
                  ) : (
                    <span className="pill">{t("parent.dash.idPending")}</span>
                  )}
                </p>
                <p>
                  {giveawayActive ? (
                    <span className="pill gvw-access">{t("access.giveaway")}</span>
                  ) : freeAccessByChild.get(c.profile_id) ? (
                    // M10: active free-access interval for THIS child.
                    <span className="pill gvw-access">{t("access.freeAccess")}</span>
                  ) : (
                    <span className="pill">{t(`access.${c.access_status}`)}</span>
                  )}
                </p>
                {/* L-quick: compact leaderboard chip (rank / points / streak). */}
                {leaderboardOn && (
                  <div className="lbchip" title={t("plb.title")}>
                    {lbRanked ? (
                      <>
                        <span className="lbchip-rank">#{lb!.rank_month}</span>
                        <span className="lbchip-item">
                          {Math.round(Number(lb!.points_month ?? 0))}{" "}
                          <span className="lbchip-u">{t("plb.pts")}</span>
                        </span>
                        <span className="lbchip-item">
                          🔥 {Number(lb!.current_streak ?? 0) || 0}
                        </span>
                      </>
                    ) : (
                      <span className="lbchip-none">{t("plb.notRankedShort")}</span>
                    )}
                  </div>
                )}
                <p style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link
                    className={c.child_unique_id ? "btn-ghost" : "btn"}
                    href={`/children/${c.profile_id}/subscribe`}
                  >
                    {c.child_unique_id ? t("parent.dash.manage") : t("parent.dash.choosePlan")}
                  </Link>
                  <Link className="btn-ghost" href={`/children/${c.profile_id}/edit`}>
                    {t("parent.dash.editInfo")}
                  </Link>
                  {olympiadOn && (
                    <Link className="btn-ghost" href={`/children/${c.profile_id}/olympiads`}>
                      {t("parent.dash.olympiads")}
                    </Link>
                  )}
                </p>
                <ChildCardActions studentProfileId={c.profile_id} dict={childDict} />
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3) News */}
      <div className="home-block">
        <ParentNewsPanel dict={newsDict} />
      </div>
    </section>
  );
}
