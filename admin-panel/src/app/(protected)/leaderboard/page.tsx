import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT, getLocale } from "@/i18n/server";
import { SettingEditor, type SettingFieldKind } from "@/components/SettingEditor";
import { SETTING_META, LOCALE_OPTIONS } from "@/lib/admin/settings-meta";
import { getResource } from "@/lib/admin/resources";
import { LeaderboardResetControls } from "@/components/LeaderboardResetControls";
import { SeasonManager } from "@/components/SeasonManager";
import type { SeasonRow } from "@/lib/admin/leaderboard";

// ---------------------------------------------------------------------------
// Leaderboard management (L2) — Administrator-only.
//   1) Points formula: the three leaderboard.points.* system_settings keys,
//      edited through the existing typed SettingEditor + updateSetting action
//      (requireAdmin + range validation + audit inside updateSetting).
//   2) Named competition seasons: full CRUD via service-role RPCs.
//   3) Season close / hard reset: service-role-only RPC behind resetLeaderboard
//      (requireAdmin first, generic errors, audit row, double-confirm UI).
// NOTE (Round 20): the ranked-students boards viewer was REMOVED from the
// admin panel — standings are a product surface, not an admin operation. The
// per-season standings modal inside SeasonManager remains (it documents what a
// close freezes).
// ---------------------------------------------------------------------------

// The three formula keys shown in Section 1 (must exist in SETTING_META).
const LB_SETTING_KEYS = [
  "leaderboard.points.per_correct",
  "leaderboard.points.practice_daily_cap_per_subject",
  "leaderboard.points.olympiad_multiplier",
] as const;

export default async function LeaderboardAdminPage() {
  // Administrator-only (Content Managers are redirected to /unauthorized).
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const supabase = await createClient();

  // ---- Points-formula settings values --------------------------------------
  const { data: settingRows } = await supabase
    .from("system_settings")
    .select("key, value_json")
    .in("key", [...LB_SETTING_KEYS]);
  const settingValue = new Map<string, unknown>();
  for (const row of (settingRows ?? []) as { key: string; value_json: unknown }[]) {
    settingValue.set(row.key, row.value_json);
  }

  // ---- Named competition seasons (Section 2) --------------------------------
  // Read on the admin's SESSION client — RLS policy lseasons_admin lets an
  // administrator SELECT. All writes go through the service-role RPCs in
  // lib/admin/leaderboard (behind requireAdmin). Status is derived client-side.
  const { data: seasonRows } = await supabase
    .from("leaderboard_seasons")
    .select("id, name, starts_at, ends_at, closed_at, created_at")
    .order("starts_at", { ascending: false });
  const seasons: SeasonRow[] = (
    (seasonRows ?? []) as {
      id: string;
      name: string;
      starts_at: string;
      ends_at: string;
      closed_at: string | null;
      created_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    closedAt: r.closed_at,
    createdAt: r.created_at,
  }));

  const editorBase = {
    save: t("action.save"),
    saving: t("manage.saving"),
    saved: t("settings.saved"),
    invalidJson: t("settings.err.invalidJson"),
    notFound: t("settings.err.notFound"),
    missing: t("settings.err.missing"),
    notConfigured: t("settings.notConfigured"),
    localesEmpty: t("settings.err.localesEmpty"),
    langAz: t("settings.lang.az"),
    langEn: t("settings.lang.en"),
    langRu: t("settings.lang.ru"),
  };

  function field(key: string) {
    const meta = SETTING_META[key];
    if (!meta || meta.kind === "boolean") return null;
    return (
      <SettingEditor
        key={key}
        settingKey={key}
        kind={meta.kind as SettingFieldKind}
        value={settingValue.get(key)}
        exists={settingValue.has(key)}
        localeOptions={LOCALE_OPTIONS}
        placeholder={meta.placeholder}
        min={meta.min}
        max={meta.max}
        strings={{ ...editorBase, label: t(meta.labelKey), help: t(meta.helpKey) }}
      />
    );
  }

  // Difficulty weights are edited in the taxonomy module; link only if the
  // difficulty-levels manage resource is registered.
  const difficultyResource = getResource("difficulty-levels");

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("lb.title")}</h1>
        <p className="muted">{t("lb.subtitle")}</p>
      </div>

      {/* ---- Section 1: points formula ---- */}
      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{t("lb.config.title")}</h3>
        <p className="muted">{t("lb.config.desc")}</p>
        {LB_SETTING_KEYS.map((k) => field(k))}
        <p className="hint" style={{ marginTop: 12 }}>
          {t("lb.config.difficultyHint")}{" "}
          {difficultyResource && (
            <Link href="/manage/difficulty-levels">
              {t("nav.difficultyLevels")}
            </Link>
          )}
        </p>
        <p className="hint">
          {t("lb.config.flagsHint")}{" "}
          <Link href="/settings">{t("lb.config.openSettings")}</Link>
        </p>
      </section>

      {/* ---- Section 2: named competition seasons (full CRUD) ---- */}
      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{t("lbseason.title")}</h3>
        <p className="muted">{t("lbseason.desc")}</p>
        <SeasonManager
          seasons={seasons}
          locale={locale}
          strings={{
            new: t("lbseason.new"),
            newTitle: t("lbseason.newTitle"),
            editTitle: t("lbseason.editTitle"),
            name: t("lbseason.name"),
            namePlaceholder: t("lbseason.namePlaceholder"),
            start: t("lbseason.start"),
            end: t("lbseason.end"),
            create: t("lbseason.create"),
            creating: t("lbseason.creating"),
            created: t("lbseason.created"),
            save: t("lbseason.save"),
            saving: t("lbseason.saving"),
            saved: t("lbseason.saved"),
            endBeforeStart: t("lbseason.endBeforeStart"),
            empty: t("lbseason.empty"),
            colName: t("lbseason.col.name"),
            colWindow: t("lbseason.col.window"),
            colStatus: t("lbseason.col.status"),
            actions: t("lbseason.col.actions"),
            statusUpcoming: t("lbseason.status.upcoming"),
            statusActive: t("lbseason.status.active"),
            statusEnded: t("lbseason.status.ended"),
            statusClosed: t("lbseason.status.closed"),
            actionView: t("lbseason.action.view"),
            actionEdit: t("lbseason.action.edit"),
            actionClose: t("lbseason.action.close"),
            actionReopen: t("lbseason.action.reopen"),
            actionDelete: t("lbseason.action.delete"),
            closeTitle: t("lbseason.close.title"),
            closeText: t("lbseason.close.text"),
            closeConfirm: t("lbseason.close.confirm"),
            closeDone: t("lbseason.close.done"),
            reopenTitle: t("lbseason.reopen.title"),
            reopenText: t("lbseason.reopen.text"),
            reopenConfirm: t("lbseason.reopen.confirm"),
            reopenDone: t("lbseason.reopen.done"),
            deleteTitle: t("lbseason.delete.title"),
            deleteText: t("lbseason.delete.text"),
            deleteConfirm: t("lbseason.delete.confirm"),
            deleteDone: t("lbseason.delete.done"),
            standingsTitle: t("lbseason.standings.title"),
            standingsRank: t("lbseason.standings.rank"),
            standingsName: t("lbseason.standings.name"),
            standingsValue: t("lbseason.standings.value"),
            standingsAnon: t("lbseason.standings.anon"),
            standingsEmpty: t("lbseason.standings.empty"),
            standingsLoading: t("lbseason.standings.loading"),
            standingsFrozen: t("lbseason.standings.frozen"),
            standingsLive: t("lbseason.standings.live"),
            working: t("lbseason.working"),
            cancel: t("action.cancel"),
            close: t("modal.close"),
            error: t("lbseason.error"),
          }}
        />
      </section>

      {/* ---- Section 3: monthly board reset (SEPARATE from named seasons) ---- */}
      <section className="card">
        <h3>{t("lb.reset.title")}</h3>
        <p className="muted">{t("lb.reset.desc")}</p>
        <LeaderboardResetControls
          strings={{
            seasonButton: t("lb.reset.season.button"),
            seasonTitle: t("lb.reset.season.title"),
            seasonText: t("lb.reset.season.text"),
            seasonConfirm: t("lb.reset.season.confirm"),
            seasonDone: t("lb.reset.season.done"),
            hardButton: t("lb.reset.hard.button"),
            hardTitle: t("lb.reset.hard.title"),
            hardText: t("lb.reset.hard.text"),
            hardAck: t("lb.reset.hard.ack"),
            hardConfirm: t("lb.reset.hard.confirm"),
            hardDone: t("lb.reset.hard.done"),
            working: t("lb.reset.working"),
            cancel: t("action.cancel"),
            close: t("modal.close"),
            error: t("lb.reset.error"),
          }}
        />
      </section>
    </div>
  );
}
