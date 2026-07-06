// Student "Olimpiadalar" tab (Round 8): two sections —
//   1) "Keçirilməsi planlaşdırılan olimpiadalar": ACTIVE packages the child does
//      NOT own yet — professional cards (cover / branded placeholder, status +
//      subject chips, event date from event_starts_at, detail modal with the
//      "ask your parent to buy" note). Children can NEVER purchase.
//   2) "Olimpiadalarım": the existing owned-packages behavior (start attempt).
// Business ruling (2026-07-06): olympiad packages are ALWAYS purchase-only —
// giveaway windows / free-access intervals cover SUBJECT access only, never
// olympiad play. Playable = owned purchases; the planned section always shows.
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { startOlympiad } from "@/lib/auth/childActions";
import {
  OlympiadPlannedCard,
  type PlannedDict,
  type PlannedOlympiad,
} from "@/components/OlympiadPlannedCard";

type StatusKind = PlannedOlympiad["statusKind"];

export default async function ChildOlympiadsPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const child = await requireChild();
  const { err } = await searchParams;
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

  const [{ data: packages }, { data: purchases }] = await Promise.all([
    // Active listing is publicly browsable (RLS); covers resolve via the public
    // olympiad-media bucket like the parent olympiads page / news covers.
    supabase
      .from("olympiad_packages")
      .select(
        "id, price_amount, currency, questions_per_attempt, event_starts_at, subjects(name), olympiad_types(name), media_assets:cover_media_id(bucket, path), olympiad_package_translations(locale, title, description)",
      )
      .eq("status", "active")
      .order("created_at"),
    supabase
      .from("olympiad_purchases")
      .select(
        "olympiad_package_id, status, olympiad_packages(questions_per_attempt, olympiad_package_translations(locale, title))",
      )
      .eq("student_profile_id", child.profileId)
      .eq("status", "active"),
  ]);

  const owned = (purchases ?? []) as any[];
  const ownedIds = new Set(owned.map((p) => p.olympiad_package_id));

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
      const n = Number(p.questions_per_attempt ?? 25) || 25;
      const questionsText = `${n} ${t("oly4.questions")}`;
      const subject: string | null = p.subjects?.name ?? null;
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
  // L16: each row shows the package's real questions_per_attempt.
  type Playable = { id: string; title: string; questions: number };
  const playable: Playable[] = owned.map((p) => ({
    id: p.olympiad_package_id,
    title: ownedTitle(p),
    questions: Number(p.olympiad_packages?.questions_per_attempt ?? 25) || 25,
  }));

  return (
    <section>
      <p className="arena-eyebrow">{t("oly4.eyebrow")}</p>
      <h1 style={{ marginBottom: 20 }}>{t("oly4.pageTitle")}</h1>

      {err && (
        <div className="arena-panel arena-muted" role="alert" style={{ marginBottom: 16 }}>
          {t("test.err.generic")}
        </div>
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
                  <button className="arena-btn arena-btn-sm" type="submit">
                    {t("oly3.start")}
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
