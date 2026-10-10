import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { isGiveawayActive } from "@/lib/paymentMode";
import { getChildPlanStatus, type ChildPlanStatus } from "@/lib/childPlanStatus";
import { formatPercent } from "@/lib/formatPercent";
import { resolveChildAvatarUrl } from "@/lib/childAvatar";
import { ChildAvatar } from "@/components/ChildAvatar";
import { ChildCardActions } from "@/components/ChildCardActions";
import { CopyableId } from "@/components/CopyableId";
import { InfoCarousel, type InfoSlide } from "@/components/InfoCarousel";
import { ParentNewsPanel } from "@/components/ParentNewsPanel";
import { TrialExpiredBanner, type ExpiredTrialItem } from "@/components/TrialExpiredBanner";

const CHILD_KEYS = [
  "child.resetPw", "child.newPassword", "child.resetPwSubmit",
  "child.resetPwOk", "child.deleteChild", "child.deleteConfirm",
  "profile.cancel", // ConfirmModal cancel label (R9)
];

const NEWS_KEYS = ["news.latest", "news.viewAll", "news.none"];
const BANNER_KEYS = ["parent.trialBanner.body", "parent.trialBanner.cta", "parent.trialBanner.dismiss"];

// get_child_leaderboard_summary payload (all fields optional-defensive: any RPC
// error/null is treated as "no leaderboard data" for that child). Round 36:
// the board value is the weighted PERCENTAGE (pct_*); the legacy points_*
// fields still arrive but are deprecated and must never be rendered.
type LbSummary = {
  pct_month?: number | null;
  pct_all_time?: number | null;
  provisional_month?: boolean | null;
  provisional_all_time?: boolean | null;
  current_streak?: number | null;
  best_streak?: number | null;
  rank_month?: number | null;
  total_month?: number | null;
  rank_all_time?: number | null;
};

/** Colour hint for the status pill; the words carry the meaning. */
function pillTone(key: string | undefined): string {
  if (key === "access.subscriptionActive" || key === "access.trialActive") return "pill-ok";
  if (key === "access.trialExpired") return "pill-warn";
  return "";
}

export default async function ParentDashboard() {
  const parent = await requireParent();
  const t = await getT();
  const locale = await getLocale();
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
    .select(
      "profile_id, first_name, last_name, child_unique_id, access_status, class_grade, created_by_parent_profile_id, avatar_kind, avatar_key, avatar_media_path",
    )
    .order("created_at", { ascending: true });
  const list = (children ?? []) as any[];

  // Parent-managed avatars (photo → short-lived signed URL via the parent's
  // OWN session client — private bucket, RLS-scoped; preset → bundled PNG;
  // null → the initials bubble). Best-effort per child.
  const avatarByChild = new Map<string, string | null>(
    await Promise.all(
      list.map(
        async (c) =>
          [c.profile_id as string, await resolveChildAvatarUrl(supabase, c)] as const,
      ),
    ),
  );

  // Each child's plan status — Subscription Active / Trial Active / Trial
  // Expired, or the campaign's own word — from every rail that can grant
  // access (lib/childPlanStatus; the label rule is lib/accessPill). Per child
  // (small N) so one child's window never re-labels an uncovered sibling.
  const statusByChild = new Map<string, ChildPlanStatus>(
    await Promise.all(
      list.map(
        async (c) =>
          [
            c.profile_id as string,
            await getChildPlanStatus(c.profile_id, c.access_status, giveawayActive),
          ] as const,
      ),
    ),
  );

  // The expired-trial banners: only for children this parent created (the one
  // who can subscribe for them), whose trial is over with nothing else open.
  const expiredTrials: ExpiredTrialItem[] = list
    .filter((c) => c.created_by_parent_profile_id === parent.profileId)
    .flatMap((c) => {
      const st = statusByChild.get(c.profile_id);
      if (!st?.trialExpiredNoAccess || !st.trial.endsAt) return [];
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
      return [{ childId: c.profile_id as string, name, endsAt: st.trial.endsAt }];
    });

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
  const bannerDict: Record<string, string> = {};
  for (const k of BANNER_KEYS) bannerDict[k] = t(k);
  const newsDict: Record<string, string> = {};
  for (const k of NEWS_KEYS) newsDict[k] = t(k);

  const carouselSlides: InfoSlide[] = [1, 2, 3, 4, 5].map((n) => ({
    title: t(`carousel.i${n}.title`),
    body: t(`carousel.i${n}.body`),
  }));

  return (
    <section className="parent-home">
      {/* 0) "Your child's free trial has expired" — dismissible, per child. */}
      {expiredTrials.length > 0 && (
        <div className="home-block">
          <TrialExpiredBanner items={expiredTrials} d={bannerDict} />
        </div>
      )}

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
          <Link className="btn secondary" href="/children/link">
            {t("link.manage")}
          </Link>
        </div>

        {list.length === 0 ? (
          <p className="muted">{t("parent.dash.noChildren")}</p>
        ) : (
          <div className="children-grid">
            {list.map((c) => {
              const lb = leaderboardOn ? lbByChild.get(c.profile_id) : null;
              const lbRanked = !!lb && lb.rank_month != null;
              const lbProvisional = !!lb && !lbRanked && !!lb.provisional_month;
              const childName = [c.first_name, c.last_name].filter(Boolean).join(" ");
              const status = statusByChild.get(c.profile_id);
              const isCreator = c.created_by_parent_profile_id === parent.profileId;
              return (
              <div className="card" key={c.profile_id}>
                <div className="child-card-head">
                  <ChildAvatar
                    url={avatarByChild.get(c.profile_id) ?? null}
                    name={childName || "?"}
                    size={44}
                  />
                  <strong>{childName}</strong>
                </div>
                <p className="muted">
                  {t("parent.dash.childId")}:{" "}
                  {c.child_unique_id ? (
                    <CopyableId id={c.child_unique_id} />
                  ) : (
                    <span className="pill">{t("parent.dash.idPending")}</span>
                  )}
                </p>
                <p>
                  {/* Status only — the trial's countdown belongs to the child's
                      own dashboard, never to this one (owner, 2026-10-10). */}
                  <span className={status?.free ? "pill gvw-access" : `pill ${pillTone(status?.pillKey)}`}>
                    {t(status?.pillKey ?? "access.inactive")}
                  </span>
                </p>
                {/* L-quick: compact leaderboard chip (rank / percent / streak). */}
                {leaderboardOn && (
                  <div className="lbchip" title={t("plb.title")}>
                    {lbRanked ? (
                      <>
                        <span className="lbchip-rank">#{lb!.rank_month}</span>
                        <span className="lbchip-item">
                          {formatPercent(Number(lb!.pct_month ?? 0), locale)}{" "}
                          <span className="lbchip-u">{t("plb.pct")}</span>
                        </span>
                        <span className="lbchip-item">
                          🔥 {Number(lb!.current_streak ?? 0) || 0}
                        </span>
                      </>
                    ) : lbProvisional ? (
                      <span className="lbchip-none">{t("plb.provisionalShort")}</span>
                    ) : (
                      <span className="lbchip-none">{t("plb.notRankedShort")}</span>
                    )}
                  </div>
                )}
                {isCreator ? (
                  <>
                    <p style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link className={c.child_unique_id ? "btn-ghost" : "btn"} href={`/children/${c.profile_id}/subscribe`}>
                        {c.child_unique_id ? t("parent.dash.manage") : t("parent.dash.choosePlan")}
                      </Link>
                      <Link className="btn-ghost" href={`/children/${c.profile_id}/edit`}>
                        {t("parent.dash.editInfo")}
                      </Link>
                      {olympiadOn && <Link className="btn-ghost" href={`/children/${c.profile_id}/olympiads`}>{t("parent.dash.olympiads")}</Link>}
                    </p>
                    <ChildCardActions studentProfileId={c.profile_id} dict={childDict} />
                  </>
                ) : (
                  <p style={{ marginTop: 8 }}><span className="pill">{t("link.linked")}</span></p>
                )}
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
