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
  grade: { level: number; name: string } | null;
  cover: { bucket: string; path: string } | null;
  title: string;
  description: string;
};

export async function fetchOlympiadCatalog(locale: Locale): Promise<OlympiadPackageRow[]> {
  const { data, error } = await supabase
    .from("olympiad_packages")
    .select(
      "id, price_amount, currency, questions_per_attempt, duration_minutes, event_starts_at, sale_starts_at, sale_ends_at, subject:subject_id(code, name), grade:grade_id(level, name), cover:cover_media_id(bucket, path), olympiad_package_translations(locale, title, description)",
    )
    .eq("status", "active")
    .order("event_starts_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((p: any) => {
    const tr = (p.olympiad_package_translations ?? []) as {
      locale: string;
      title: string;
      description: string | null;
    }[];
    const t = tr.find((x) => x.locale === locale) ?? tr.find((x) => x.locale === "az");
    return {
      id: p.id,
      price_amount: p.price_amount,
      currency: p.currency,
      questions_per_attempt: p.questions_per_attempt,
      duration_minutes: p.duration_minutes,
      event_starts_at: p.event_starts_at,
      sale_starts_at: p.sale_starts_at ?? null,
      sale_ends_at: p.sale_ends_at ?? null,
      subject: p.subject ?? null,
      grade: p.grade ?? null,
      cover: p.cover ?? null,
      title: t?.title ?? "",
      description: t?.description ?? "",
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
  subjects: { subject_id: string; code: string | null; name: string }[];
};

export async function fetchChildSubscriptions(): Promise<ChildSubscriptionRow[]> {
  const { data, error } = await supabase
    .from("child_subscriptions")
    .select(
      "id, student_profile_id, status, billing_interval:interval, current_period_end, total_amount, currency, subscription_subjects(subject_id, subject:subject_id(code, name))",
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
