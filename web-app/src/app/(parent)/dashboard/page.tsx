import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { ChildCardActions } from "@/components/ChildCardActions";
import { ParentProfile } from "@/components/ParentProfile";
import { InfoCarousel, type InfoSlide } from "@/components/InfoCarousel";
import { ParentNewsPanel } from "@/components/ParentNewsPanel";

const CHILD_KEYS = [
  "child.resetPw", "child.newPassword", "child.resetPwSubmit",
  "child.resetPwOk", "child.deleteChild", "child.deleteConfirm",
];

// Keys consumed by the (client) ParentProfile section + AvatarUploader.
const PROFILE_KEYS = [
  "profile.title", "profile.account", "profile.logout", "profile.deleteAccount",
  "profile.changePassword", "profile.currentPassword", "profile.newPassword",
  "profile.save", "profile.saved", "profile.cancel", "profile.passwordChanged",
  "profile.avatar", "profile.uploadAvatar", "profile.changeAvatar",
  "profile.removeAvatar", "profile.avatarHint", "profile.noAvatar",
  "profile.err.passwordShort", "profile.err.passwordEqualsId",
  "profile.err.fileType", "profile.err.fileTooLarge", "profile.err.uploadFailed",
  "profile.err.updateFailed", "account.deleteConfirm",
  "auth.showPassword", "auth.hidePassword",
];

const NEWS_KEYS = ["news.latest", "news.viewAll", "news.none"];

function initialsOf(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return (email.trim()[0] ?? "?").toUpperCase();
}

export default async function ParentDashboard() {
  const parent = await requireParent();
  const t = await getT();
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

  // Parent profile (name/email/avatar). Degrade gracefully on any failure so
  // the dashboard still renders with an initials fallback.
  let name = "";
  let email = "";
  let avatarUrl: string | null = null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "display_name, email, avatar_media_id, media_assets:avatar_media_id(bucket, path)",
      )
      .eq("id", parent.profileId)
      .single();
    if (profile) {
      name = (profile as any).display_name ?? "";
      email = (profile as any).email ?? "";
      const m = (profile as any).media_assets;
      if (m?.bucket && m?.path) {
        avatarUrl = supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
      }
    }
  } catch {
    // keep defaults
  }

  const profileDict: Record<string, string> = {};
  for (const k of PROFILE_KEYS) profileDict[k] = t(k);
  const newsDict: Record<string, string> = {};
  for (const k of NEWS_KEYS) newsDict[k] = t(k);

  const carouselSlides: InfoSlide[] = [1, 2, 3, 4, 5].map((n) => ({
    title: t(`carousel.i${n}.title`),
    body: t(`carousel.i${n}.body`),
  }));

  return (
    <section className="prose">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1>{t("parent.dash.title")}</h1>
        <Link className="btn" href="/children/new">
          {t("parent.dash.addChild")}
        </Link>
      </div>

      <ParentProfile
        name={name || email || t("profile.account")}
        email={email}
        initials={initialsOf(name, email)}
        avatarUrl={avatarUrl}
        dict={profileDict}
      />

      <InfoCarousel title={t("carousel.title")} slides={carouselSlides} />

      {list.length === 0 ? (
        <p className="muted">{t("parent.dash.noChildren")}</p>
      ) : (
        <div className="grid">
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
                <Link className="btn-ghost" href={`/children/${c.profile_id}/olympiads`}>
                  {t("parent.dash.olympiads")}
                </Link>
                <Link className="btn-ghost" href={`/children/${c.profile_id}/progress`}>
                  {t("parent.dash.progress")}
                </Link>
              </p>
              <ChildCardActions studentProfileId={c.profile_id} dict={childDict} />
            </div>
          ))}
        </div>
      )}

      <ParentNewsPanel dict={newsDict} />
    </section>
  );
}
