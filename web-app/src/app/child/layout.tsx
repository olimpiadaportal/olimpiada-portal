import Link from "next/link";
import { requireChild } from "@/lib/auth/session";
import { childLogoutAction } from "@/lib/auth/childActions";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";

// Arena (Claude-Design) shell for the Student/Child app. Dark theme is scoped
// to the `.arena` root so the parent/public areas and the admin panel are never
// affected. Logic (auth, wallpaper, logout) is unchanged from the prior shell.
export default async function ChildLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const child = await requireChild();
  const t = await getT();
  const supabase = await createClient();

  const { data: sel } = await supabase
    .from("child_wallpaper_selections")
    .select("wallpapers(kind, value)")
    .eq("student_profile_id", child.profileId)
    .maybeSingle();
  const wp = (sel as any)?.wallpapers;
  const bg = wp?.kind === "solid_color" ? (wp.value as string) : undefined;

  const { data: student } = await supabase
    .from("students")
    .select("first_name")
    .eq("profile_id", child.profileId)
    .maybeSingle();
  const firstName = (student as any)?.first_name ?? "";
  const initial = (firstName.trim()[0] ?? "?").toUpperCase();

  // Streak: count of distinct recent days the child submitted a graded attempt
  // (derived from real data; 0 when none yet — never fabricated).
  const { data: subs } = await supabase
    .from("test_attempts")
    .select("submitted_at")
    .eq("student_profile_id", child.profileId)
    .eq("status", "graded")
    .order("submitted_at", { ascending: false })
    .limit(60);
  const days = new Set<string>();
  for (const r of (subs ?? []) as any[]) {
    if (r.submitted_at) days.add(String(r.submitted_at).slice(0, 10));
  }
  const streak = days.size;

  const NAV: [string, string][] = [
    ["/child", "arena.nav.arena"],
    ["/child/olympiads", "arena.nav.tasks"],
    ["/child/leaderboard", "arena.nav.rank"],
    ["/child", "arena.nav.profile"],
  ];

  return (
    <>
      {/* Arena design fonts: Chivo (body) + JetBrains Mono (numbers/labels). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;600;700;900&family=JetBrains+Mono:wght@400;600;700&display=swap"
        rel="stylesheet"
      />
      <div
        className="arena"
        {...(bg ? { "data-wallpaper": "", style: { ["--wp" as any]: bg } } : {})}
      >
        <header className="arena-nav">
          <Link href="/child" className="arena-brand brand-compact">
            {t("arena.brand")}·<b>ARENA</b>
          </Link>
          <nav className="arena-navlinks">
            {NAV.map(([href, key], i) => (
              <Link key={key} href={href} className={`arena-navlink${i === 0 ? " active" : ""}`}>
                {t(key)}
              </Link>
            ))}
          </nav>
          <div className="arena-navright">
            <span className="arena-streak" title={t("arena.streak")}>
              🔥 {streak} {t("arena.streak")}
            </span>
            <span className="arena-avatar" aria-hidden>
              {initial}
            </span>
            <form action={childLogoutAction}>
              <button className="arena-btn-ghost arena-btn-sm" type="submit">
                {t("child.logout")}
              </button>
            </form>
          </div>
        </header>
        <main className="arena-main">{children}</main>
      </div>
    </>
  );
}
