// Student "Olimpiadalar" tab (Round 8): two sections —
//   1) "Keçirilməsi planlaşdırılan olimpiadalar": ACTIVE packages the child does
//      NOT own yet — professional cards (cover / branded placeholder, status +
//      subject chips, event date from event_starts_at, detail modal with the
//      "ask your parent to buy" note). Children can NEVER purchase.
//   2) "Olimpiadalarım": the existing owned-packages behavior (start attempt).
// Business ruling (2026-07-06): olympiad packages are ALWAYS purchase-only —
// giveaway windows / free-access intervals cover SUBJECT access only, never
// olympiad play. Playable = owned purchases; the planned section always shows.
import Link from "next/link";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { startOlympiad } from "@/lib/auth/childActions";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  OlympiadPlannedCard,
  type PlannedDict,
  type PlannedOlympiad,
} from "@/components/OlympiadPlannedCard";

type StatusKind = PlannedOlympiad["statusKind"];

export default async function ChildOlympiadsPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; notice?: string }>;
}) {
  const child = await requireChild();
  const { err, notice } = await searchParams;
  const locale = await getLocale();
  const t = await getT();
  // Module gate (admin Settings): friendly notice instead of the package list.
  if (!(await isFeatureEnabled("olympiad_module"))) {
    return (
      <section>
        <p className="arena-eyebrow">{t("oly4.eyebrow")}</p>
        <h1 style={{ marginBottom: 20 }}>{t("oly4.pageTitle")}</h1>
        <div className="arena-panel arena-muted">{t("gate.olympiadOff")}</div>
      </section>
    );
  }
  const supabase = await createClient();

  const [{ data: packages }, { data: purchases }, { data: openAttempts }] =
    await Promise.all([
      // Active listing is publicly browsable (RLS); covers resolve via the public
      // olympiad-media bucket like the parent olympiads page / news covers.
      supabase
        .from("olympiad_packages")
        .select(
          "id, price_amount, currency, event_starts_at, subjects(code, name), olympiad_types(name), media_assets:cover_media_id(bucket, path), olympiad_package_translations(locale, title, description)",
        )
        .eq("status", "active")
        .order("created_at"),
      supabase
        .from("olympiad_purchases")
        .select(
          "olympiad_package_id, status, olympiad_packages(olympiad_package_translations(locale, title))",
        )
        .eq("student_profile_id", child.profileId)
        .eq("status", "active"),
      // Migration 047: olympiad attempts are TIMED on the shared test engine —
      // a still-running one (deadline not passed) surfaces as a "continue" card
      // exactly like the test home does for kind='test'.
      supabase
        .from("test_attempts")
        .select("id, deadline_at, question_ids")
        .eq("student_profile_id", child.profileId)
        .eq("kind", "olympiad")
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1),
    ]);

  const owned = (purchases ?? []) as any[];
  const ownedIds = new Set(owned.map((p) => p.olympiad_package_id));

  // Round 21: REAL published pool size per package (RPC, migration 065) —
  // questions_per_attempt was a display-legacy default (25) the admin form
  // never writes, so a 50-question package still said "25". One call covers
  // both sections (owned packages may be archived, so union the id sets).
  // Packages with 0 published questions return no row → coalesce to 0.
  const allPackageIds = Array.from(
    new Set<string>([
      ...((packages ?? []) as any[]).map((p) => p.id),
      ...owned.map((p) => p.olympiad_package_id),
    ]),
  )
    .filter(Boolean)
    .slice(0, 100); // DB-side cap; active listings never realistically exceed it.
  const poolCounts = new Map<string, number>();
  if (allPackageIds.length > 0) {
    const { data: countRows } = await supabase.rpc("get_olympiad_pool_counts", {
      p_package_ids: allPackageIds,
    });
    for (const r of (countRows ?? []) as {
      package_id: string;
      question_count: number;
    }[]) {
      poolCounts.set(r.package_id, Number(r.question_count ?? 0) || 0);
    }
  }

  // Live attempt (server deadline still running); resolve which package it
  // belongs to via its first drawn question (each pool question is PRIVATE to
  // exactly one package) so its card's button can read "Continue".
  const liveRow = ((openAttempts ?? []) as any[]).find(
    (r) => r.deadline_at && new Date(r.deadline_at).getTime() > Date.now(),
  );
  let livePackageId: string | null = null;
  if (liveRow) {
    const firstQid = Array.isArray(liveRow.question_ids)
      ? liveRow.question_ids[0]
      : null;
    if (firstQid) {
      const { data: qRow } = await supabase
        .from("questions")
        .select("olympiad_package_id")
        .eq("id", firstQid)
        .maybeSingle();
      livePackageId =
        (qRow as { olympiad_package_id?: string | null } | null)
          ?.olympiad_package_id ?? null;
    }
  }

  const pickTr = (trs: any[]) =>
    (trs ?? []).find((x: any) => x.locale === locale) ??
    (trs ?? []).find((x: any) => x.locale === "az");

  const fmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const now = Date.now();

  // Build the planned-card view models server-side (client component receives
  // only already-translated, serializable strings).
  const planned = ((packages ?? []) as any[])
    .filter((p) => !ownedIds.has(p.id))
    .map((p): { item: PlannedOlympiad; ts: number } => {
      const tr = pickTr(p.olympiad_package_translations);
      const n = poolCounts.get(p.id) ?? 0;
      const questionsText = `${n} ${t("oly4.questions")}`;
      const subject: string | null = p.subjects?.name
        ? subjectLabel(t, p.subjects?.code, p.subjects.name)
        : null;
      const typeName: string | null = p.olympiad_types?.name ?? null;
      let coverUrl: string | null = null;
      const m = p.media_assets;
      if (m?.bucket && m?.path) {
        coverUrl = supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
      }
      const ts = p.event_starts_at ? Date.parse(p.event_starts_at) : NaN;
      const hasDate = Number.isFinite(ts);
      const statusKind: StatusKind = !hasDate ? "planned" : ts > now ? "upcoming" : "held";
      const price = Number(p.price_amount ?? 0);
      // No long-description column on the package itself — prefer the localized
      // translation description, else compose a short line from type/subject +
      // the questions-per-attempt info.
      const desc: string =
        (typeof tr?.description === "string" && tr.description.trim()) ||
        [typeName, subject, questionsText].filter(Boolean).join(" · ");
      return {
        ts: hasDate ? ts : Number.MAX_SAFE_INTEGER,
        item: {
          id: p.id,
          title: tr?.title ?? "—",
          desc,
          coverUrl,
          dateText: hasDate ? fmt.format(new Date(ts)) : t("oly4.dateTbd"),
          statusKind,
          statusText: t(`oly4.status.${statusKind}`),
          subject,
          typeName,
          questionsText,
          priceText:
            price > 0 ? `${price} ${p.currency ?? "AZN"}` : t("oly4.free"),
        },
      };
    });

  // Upcoming (soonest first) → undated "planned" → already-held.
  const rank: Record<StatusKind, number> = { upcoming: 0, planned: 1, held: 2 };
  planned.sort(
    (a, b) => rank[a.item.statusKind] - rank[b.item.statusKind] || a.ts - b.ts,
  );

  const dict: PlannedDict = {
    details: t("oly4.details"),
    buyNote: t("oly4.buyNote"),
    close: t("oly4.close"),
    subject: t("oly4.subject"),
    type: t("oly4.type"),
    date: t("oly4.date"),
    qcount: t("oly4.qcount"),
    price: t("oly4.price"),
  };

  const ownedTitle = (p: any): string => {
    const trs = p.olympiad_packages?.olympiad_package_translations ?? [];
    return (
      (trs.find((x: any) => x.locale === locale) ?? trs.find((x: any) => x.locale === "az"))
        ?.title ?? "—"
    );
  };

  // Playable list ("Olimpiadalarım"): owned purchases ONLY — packages are
  // purchase-only in every payment mode (free windows cover subjects, not
  // olympiads; start_olympiad_attempt enforces the same server-side).
  // Round 21: each row shows the package's REAL published pool count.
  type Playable = { id: string; title: string; questions: number };
  const playable: Playable[] = owned.map((p) => ({
    id: p.olympiad_package_id,
    title: ownedTitle(p),
    questions: poolCounts.get(p.olympiad_package_id) ?? 0,
  }));

  return (
    <section>
      <p className="arena-eyebrow">{t("oly4.eyebrow")}</p>
      <h1 style={{ marginBottom: 20 }}>{t("oly4.pageTitle")}</h1>

      {notice === "closed" && <div className="tst-notice">{t("oly5.noticeClosed")}</div>}
      {err === "noaccess" && (
        <div className="tst-notice warn" role="alert">
          {t("oly5.errNoAccess")}
        </div>
      )}
      {err === "empty" && (
        <div className="tst-notice warn" role="alert">
          {t("oly5.errEmpty")}
        </div>
      )}
      {err && err !== "noaccess" && err !== "empty" && (
        <div className="tst-notice warn" role="alert">
          {t("test.err.generic")}
        </div>
      )}

      {liveRow && (
        <Link href={`/child/test/run/${liveRow.id}`} className="tst-continue">
          <div className="tst-continue-body">
            <strong>{t("oly5.continueTitle")}</strong>
            <span className="arena-muted">
              {(() => {
                const lp = livePackageId
                  ? owned.find((p) => p.olympiad_package_id === livePackageId)
                  : null;
                const title = lp ? ownedTitle(lp) : null;
                return title && title !== "—"
                  ? `${title} · ${t("test.home.continueSub")}`
                  : t("test.home.continueSub");
              })()}
            </span>
          </div>
          <span className="arena-btn arena-btn-sm">{t("test.home.continueCta")}</span>
        </Link>
      )}

      <section className="oly4-section">
        <h2 className="oly4-h">{t("oly4.plannedTitle")}</h2>
        {planned.length === 0 ? (
          <div className="arena-panel arena-muted">{t("oly4.none")}</div>
        ) : (
          <div className="oly4-grid">
            {planned.map(({ item }) => (
              <OlympiadPlannedCard key={item.id} item={item} dict={dict} />
            ))}
          </div>
        )}
      </section>

      <section className="oly4-section">
        <h2 className="oly4-h">{t("oly4.mineTitle")}</h2>
        {playable.length === 0 ? (
          <div className="arena-panel arena-muted">{t("oly3.childNone")}</div>
        ) : (
          <div className="arena-panel">
            {playable.map((p) => (
              <div className="arena-round" key={p.id}>
                <span className="arena-round-icon">★</span>
                <div className="arena-round-body">
                  <div className="arena-round-title">{p.title}</div>
                  <div className="arena-round-meta">
                    {p.questions} {t("arena.questionsShort")}
                  </div>
                </div>
                <form action={startOlympiad}>
                  <input type="hidden" name="package_id" value={p.id} />
                  {/* The RPC TRUE-resumes the one open olympiad attempt, so the
                      live attempt's own package reads "Continue" (047). */}
                  <button className="arena-btn arena-btn-sm" type="submit">
                    {livePackageId === p.id
                      ? t("test.home.continueCta")
                      : t("oly3.start")}
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
