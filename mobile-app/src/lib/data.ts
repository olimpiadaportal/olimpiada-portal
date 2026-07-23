// Shared data fetchers (direct Supabase, RLS-scoped by the user JWT). Pure
// async functions — screens wrap them with React Query. Money/provisioning
// writes NEVER live here (BFF only, see api.ts).
import { supabase } from "./supabase";
import type { Locale } from "@/i18n";

// ---- children (parent dashboard / selectors) --------------------------------

export type ChildRow = {
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  child_unique_id: string | null;
  access_status: string | null;
  grade_id: string | null;
  district_id: string | null;
  school_id: string | null;
  // Parent-managed avatar (preset/photo; ChildAvatar resolves the display).
  avatar_kind: string | null;
  avatar_key: string | null;
  avatar_media_path: string | null;
  grade: { level: number; name: string } | null;
  district: { name: string } | null;
  school: { name: string } | null;
};

/** The parent's children (RLS: linked/creating parent sees only their own). */
export async function fetchChildren(): Promise<ChildRow[]> {
  const { data, error } = await supabase
    .from("students")
    .select(
      "profile_id, first_name, last_name, child_unique_id, access_status, grade_id, district_id, school_id, avatar_kind, avatar_key, avatar_media_path, grade:grade_id(level, name), district:district_id(name), school:school_id(name)",
    )
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ChildRow[];
}

// ---- catalogs (wizard cascade, pricing) --------------------------------------

export async function fetchGrades() {
  const { data, error } = await supabase
    .from("grades")
    .select("id, level, name")
    .order("level");
  if (error) throw error;
  return data ?? [];
}

export async function fetchCities() {
  const { data, error } = await supabase
    .from("districts")
    .select("id, name")
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** Schools of one city — private first, then numeric school number, web parity. */
export async function fetchSchools(cityId: string) {
  const { data, error } = await supabase
    .from("schools")
    .select("id, name, is_private, school_number")
    .eq("district_id", cityId)
    .eq("status", "active")
    .order("is_private", { ascending: false })
    .order("school_number", { ascending: true, nullsFirst: false })
    .order("name");
  if (error) throw error;
  return data ?? [];
}

// subject.code drives the locale-aware display label (subj.<code> via
// subjectLabel); subject.name stays the raw DB (az) fallback.
export type SubjectPricingRow = {
  subject_id: string;
  interval: string;
  amount: number;
  currency: string;
  subject: { code: string | null; name: string } | null;
};

/** Active per-subject pricing (anon-readable; feeds pricing + wizard). */
export async function fetchSubjectsPricing(): Promise<SubjectPricingRow[]> {
  const { data, error } = await supabase
    .from("subjects_pricing")
    .select(
      "subject_id, interval, amount:price_amount, currency, subject:subject_id(code, name)",
    )
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as unknown as SubjectPricingRow[];
}

export async function fetchActiveSubjects() {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, code, name")
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

// ---- news ---------------------------------------------------------------------

export type NewsListItem = {
  id: string;
  slug: string;
  published_at: string | null;
  view_count: number | null;
  like_count: number | null;
  cover: { bucket: string; path: string } | null;
  title: string;
};

/** Published news, locale title with az fallback (RLS exposes published only). */
export async function fetchNews(locale: Locale, limit = 20): Promise<NewsListItem[]> {
  const { data, error } = await supabase
    .from("news")
    .select(
      "id, slug, published_at, view_count, like_count, cover:cover_media_id(bucket, path), news_translations(locale, title)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(Math.min(limit, 50));
  if (error) throw error;
  return (data ?? []).map((n: any) => {
    const tr = (n.news_translations ?? []) as { locale: string; title: string }[];
    const t = tr.find((x) => x.locale === locale) ?? tr.find((x) => x.locale === "az");
    return {
      id: n.id,
      slug: n.slug,
      published_at: n.published_at,
      view_count: n.view_count,
      like_count: n.like_count,
      cover: n.cover ?? null,
      title: t?.title ?? "",
    };
  });
}

export async function fetchNewsArticle(slug: string, locale: Locale) {
  const { data, error } = await supabase
    .from("news")
    .select(
      "id, slug, published_at, view_count, like_count, cover:cover_media_id(bucket, path), news_translations(locale, title, body)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const tr = (data.news_translations ?? []) as {
    locale: string;
    title: string;
    body: string;
  }[];
  const t = tr.find((x) => x.locale === locale) ?? tr.find((x) => x.locale === "az");
  return {
    id: data.id as string,
    slug: data.slug as string,
    published_at: data.published_at as string | null,
    view_count: data.view_count as number | null,
    like_count: data.like_count as number | null,
    cover: (data.cover ?? null) as unknown as { bucket: string; path: string } | null,
    title: t?.title ?? "",
    body: t?.body ?? "",
  };
}

/** Once-per-session view beacon (server dedupes nothing — mirror web watermark). */
export async function bumpNewsView(newsId: string): Promise<void> {
  await supabase.rpc("bump_news_view", { p_news_id: newsId }).then(
    () => undefined,
    () => undefined,
  );
}

/** Article ids the caller has liked. news_likes_select_own already narrows the
 *  rows to this profile, so no filter is needed (and anon holds no grant at
 *  all — callers must keep this query signed-in only). */
export async function fetchMyNewsLikes(): Promise<string[]> {
  const { data, error } = await supabase.from("news_likes").select("news_id");
  if (error) throw error;
  return (data ?? []).map((r: { news_id: string }) => r.news_id);
}

/**
 * Like/unlike on the caller's OWN JWT (news_likes grants insert/delete to
 * authenticated, scoped to profile_id = current_profile_id()) — no BFF needed.
 * news.like_count is never written here: the security-definer trigger owns it.
 * Returns false so the caller can roll its optimistic patch back.
 */
export async function setNewsLike(
  newsId: string,
  profileId: string,
  liked: boolean,
): Promise<boolean> {
  if (liked) {
    const { error } = await supabase
      .from("news_likes")
      .insert({ news_id: newsId, profile_id: profileId });
    // 23505 = the (news_id, profile_id) primary key already holds the row, so
    // the requested state is the state — a duplicate can never double-count.
    return !error || error.code === "23505";
  }
  const { error } = await supabase
    .from("news_likes")
    .delete()
    .eq("news_id", newsId)
    .eq("profile_id", profileId);
  return !error;
}

/** Public URL for a Storage object (news covers, sticker previews, avatars). */
export function publicStorageUrl(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// ---- olympiad catalog (parent) --------------------------------------------------

export type OlympiadPackageRow = {
  id: string;
  price_amount: number;
  currency: string;
  questions_per_attempt: number;
  duration_minutes: number;
  event_starts_at: string | null;
  /** Sale window — RLS keeps off-sale rows visible ONLY to purchaser families;
   *  outside [start, end] the card shows the "sales ended" chip, never Buy. */
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  subject: { code: string | null; name: string } | null;
  /** Single-grade legacy view (null for multi-grade packages). */
  grade: { level: number; name: string } | null;
  /** Round 34: the FULL target set with per-grade published pool counts. */
  grades: { grade_id: string; level: number; name: string; question_count: number }[];
  /** Published questions the CALLER's family actually receives (server-computed). */
  my_question_count: number;
  cover: { bucket: string; path: string } | null;
  title: string;
  description: string;
};

export async function fetchOlympiadCatalog(locale: Locale): Promise<OlympiadPackageRow[]> {
  // Round 34: get_my_olympiad_catalog() is role-aware and SERVER-enforced —
  // a student receives only packages covering THEIR grade; a parent only
  // those covering at least one of their children's grades (deduped by
  // construction; empty for a parent with no children). Owned packages come
  // from the purchases tables instead (lifetime access, never filtered).
  const { data, error } = await supabase.rpc("get_my_olympiad_catalog");
  if (error) throw error;
  return ((data ?? []) as any[]).map((p: any) => {
    const grades = Array.isArray(p.grades)
      ? (p.grades as any[])
          .map((g) => ({
            grade_id: String(g.grade_id ?? ""),
            level: Number(g.level ?? 0),
            name: String(g.name ?? ""),
            question_count: Number(g.question_count ?? 0) || 0,
          }))
          .filter((g) => g.grade_id)
      : [];
    const pick = (az: unknown, loc: unknown) =>
      String((locale === "az" ? az : loc) ?? az ?? "");
    return {
      id: p.id,
      price_amount: p.price_amount,
      currency: p.currency ?? "AZN",
      questions_per_attempt: 0, // display-legacy; cards use real pool counts
      duration_minutes: p.duration_minutes,
      event_starts_at: p.event_at ?? null,
      sale_starts_at: p.sale_starts_at ?? null,
      sale_ends_at: p.sale_ends_at ?? null,
      subject:
        p.subject_name != null
          ? { code: p.subject_code ?? null, name: String(p.subject_name) }
          : null,
      grade:
        grades.length === 1 ? { level: grades[0].level, name: grades[0].name } : null,
      grades,
      my_question_count: Number(p.my_question_count ?? 0) || 0,
      cover:
        p.cover_bucket && p.cover_path
          ? { bucket: String(p.cover_bucket), path: String(p.cover_path) }
          : null,
      title: pick(p.title_az, locale === "en" ? p.title_en : p.title_ru),
      description: pick(
        p.description_az,
        locale === "en" ? p.description_en : p.description_ru,
      ),
    };
  });
}

// ---- public olympiad packages (anon RPC — landing/services band) ---------------

/** get_public_olympiad_packages() row: ONLY active + on-sale packages ever
 *  return (server-filtered/ordered); en/ru text is already az-fallback. */
export type PublicOlympiadPackage = {
  id: string;
  code: string | null;
  title_az: string | null;
  title_en: string | null;
  title_ru: string | null;
  description_az: string | null;
  description_en: string | null;
  description_ru: string | null;
  price_amount: number | string | null;
  currency: string | null;
  subject_code: string | null;
  subject_name: string | null;
  grade_level: number | null;
  grade_label: string | null;
  /** Round 34: FULL target-grade set (multi-grade packages); null = legacy. */
  grade_levels: number[] | null;
  sale_ends_at: string | null;
  event_at: string | null;
  question_count: number | null;
};

/** Anon-callable: works signed-out on the public services screen. */
export async function fetchPublicOlympiadPackages(): Promise<PublicOlympiadPackage[]> {
  const { data, error } = await supabase.rpc("get_public_olympiad_packages");
  if (error) throw error;
  return ((data ?? []) as PublicOlympiadPackage[]).filter((r) => !!r?.id);
}

/** Own purchases (RLS: owner parent / child / linked parent). */
export async function fetchOlympiadPurchases() {
  const { data, error } = await supabase
    .from("olympiad_purchases")
    .select("olympiad_package_id, student_profile_id, status")
    .eq("status", "active");
  if (error) throw error;
  return data ?? [];
}

// ---- subscriptions (parent, read side) ------------------------------------------

export type ChildSubscriptionRow = {
  id: string;
  student_profile_id: string;
  status: string;
  billing_interval: string | null;
  current_period_end: string | null;
  total_amount: number | null;
  currency: string | null;
  /** Migration 078: `remove_at` non-null = scheduled removal. The subject stays
   *  usable until then (= the period end) but is no longer part of the
   *  go-forward plan, so editors must render it UNCHECKED (web parity). */
  subjects: {
    subject_id: string;
    code: string | null;
    name: string;
    remove_at: string | null;
  }[];
};

export async function fetchChildSubscriptions(): Promise<ChildSubscriptionRow[]> {
  const { data, error } = await supabase
    .from("child_subscriptions")
    .select(
      "id, student_profile_id, status, billing_interval:interval, current_period_end, total_amount, currency, subscription_subjects(subject_id, remove_at, subject:subject_id(code, name))",
    )
    .in("status", ["trialing", "active", "canceled", "past_due"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((s: any) => ({
    id: s.id,
    student_profile_id: s.student_profile_id,
    status: s.status,
    billing_interval: s.billing_interval,
    current_period_end: s.current_period_end,
    total_amount: s.total_amount,
    currency: s.currency,
    subjects: (s.subscription_subjects ?? []).map((x: any) => ({
      subject_id: x.subject_id,
      code: x.subject?.code ?? null,
      name: x.subject?.name ?? "",
      remove_at: x.remove_at ?? null,
    })),
  }));
}

// ---- scoped RPC reads --------------------------------------------------------------

export async function fetchParentFreeAccess(): Promise<{ active: boolean; endsAt: string | null }> {
  const { data, error } = await supabase.rpc("current_parent_free_access");
  if (error || !data) return { active: false, endsAt: null };
  const o = data as { active?: boolean; ends_at?: string };
  return { active: o.active === true, endsAt: o.ends_at ?? null };
}

export async function fetchChildLeaderboardSummary(studentProfileId: string) {
  const { data, error } = await supabase.rpc("get_child_leaderboard_summary", {
    p_student: studentProfileId,
  });
  if (error) return null;
  return data as Record<string, unknown> | null;
}

export async function fetchChildDashboard(
  studentProfileId: string,
  subjectId: string | null,
  days = 30,
) {
  const { data, error } = await supabase.rpc("get_child_subject_dashboard", {
    p_student_profile_id: studentProfileId,
    p_subject_id: subjectId,
    p_days: days,
  });
  if (error) throw error;
  return data as Record<string, any>;
}
