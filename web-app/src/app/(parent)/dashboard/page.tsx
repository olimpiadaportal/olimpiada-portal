import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { ChildCardActions } from "@/components/ChildCardActions";
import { InfoCarousel, type InfoSlide } from "@/components/InfoCarousel";
import { ParentNewsPanel } from "@/components/ParentNewsPanel";

const CHILD_KEYS = [
  "child.resetPw", "child.newPassword", "child.resetPwSubmit",
  "child.resetPwOk", "child.deleteChild", "child.deleteConfirm",
];

const NEWS_KEYS = ["news.latest", "news.viewAll", "news.none"];

export default async function ParentDashboard() {
  const parent = await requireParent();
  const t = await getT();
  const olympiadOn = await isFeatureEnabled("olympiad_module");
  const supabase = await createClient();

  // Children list.
  const { data: children } = await supabase
    .from("students")
    .select("profile_id, first_name, last_name, child_unique_id, access_status, class_grade")
    .eq("created_by_parent_profile_id", parent.profileId)
    .order("created_at", { ascending: true });
  const list = (children ?? []) as any[];

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
            {list.map((c) => (
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
                  <span className="pill">{t(`access.${c.access_status}`)}</span>
                </p>
                <p style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link
                    className={c.child_unique_id ? "btn-ghost" : "btn"}
                    href={`/children/${c.profile_id}/subscribe`}
                  >
                    {c.child_unique_id ? t("parent.dash.manage") : t("parent.dash.choosePlan")}
                  </Link>
                  {olympiadOn && (
                    <Link className="btn-ghost" href={`/children/${c.profile_id}/olympiads`}>
                      {t("parent.dash.olympiads")}
                    </Link>
                  )}
                  <Link className="btn-ghost" href={`/children/${c.profile_id}/progress`}>
                    {t("parent.dash.progress")}
                  </Link>
                </p>
                <ChildCardActions studentProfileId={c.profile_id} dict={childDict} />
              </div>
            ))}
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
