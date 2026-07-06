"use server";

// News likes (Round 6). Toggle runs through the request-scoped (RLS) client:
// news_likes lets an authenticated profile insert/delete ONLY its own row and
// only on published articles; news.like_count is maintained by a SECURITY
// DEFINER trigger. Anonymous visitors have no INSERT privilege — the UI shows
// them a plain counter instead of the button.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

// L3: slugs are lowercase kebab-case, capped — anything else never reaches
// revalidatePath (no attacker-shaped path segments).
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

// Round 7: views are registered by a client beacon ONCE per browser session
// (sessionStorage-guarded in <ViewBeacon/>), NOT during the server render.
// Rendering-time bumps meant every revalidatePath (e.g. a like click) counted
// as a view — the "likes inflate views" bug. bump_news_view itself only counts
// PUBLISHED articles (SECURITY DEFINER, no UPDATE grant needed). Deliberately
// no revalidatePath here: the counter refreshes on the next natural render.
export async function registerNewsView(newsId: string): Promise<void> {
  if (typeof newsId !== "string" || !isUuid(newsId)) return;
  const supabase = await createClient();
  await supabase.rpc("bump_news_view", { p_news_id: newsId });
}

export async function toggleNewsLike(formData: FormData): Promise<void> {
  const newsId = String(formData.get("news_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  // L3: UUID-shape gate like registerNewsView; RLS remains the real gate.
  if (!isUuid(newsId)) return;

  const supabase = await createClient();
  const { data: profileId } = await supabase.rpc("current_profile_id");
  if (!profileId) return; // not signed in — nothing to toggle

  // RLS scopes this select to the caller's own likes.
  const { data: existing } = await supabase
    .from("news_likes")
    .select("news_id")
    .eq("news_id", newsId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("news_likes")
      .delete()
      .eq("news_id", newsId)
      .eq("profile_id", profileId);
  } else {
    await supabase
      .from("news_likes")
      .insert({ news_id: newsId, profile_id: profileId });
  }

  if (slug && SLUG_RE.test(slug)) revalidatePath(`/news/${slug}`);
  revalidatePath("/news");
}
