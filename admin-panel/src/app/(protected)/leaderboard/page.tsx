import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT, getLocale } from "@/i18n/server";
import { FilterBar, type FilterBarSelect } from "@/components/FilterBar";
import { SettingEditor, type SettingFieldKind } from "@/components/SettingEditor";
import { SETTING_META, LOCALE_OPTIONS } from "@/lib/admin/settings-meta";
import { getResource } from "@/lib/admin/resources";
import { LeaderboardResetControls } from "@/components/LeaderboardResetControls";
import { SeasonManager } from "@/components/SeasonManager";
import type { SeasonRow } from "@/lib/admin/leaderboard";

// ---------------------------------------------------------------------------
// Leaderboard management (L2) — Administrator-only.
//   1) Boards viewer: get_leaderboard RPC via the admin's SESSION client
//      (the RPC is granted to authenticated; privacy is applied server-side).
//   2) Points formula: the three leaderboard.points.* system_settings keys,
//      edited through the existing typed SettingEditor + updateSetting action
//      (requireAdmin + range validation + audit inside updateSetting).
//   3) Season close / hard reset: service-role-only RPC behind resetLeaderboard
//      (requireAdmin first, generic errors, audit row, double-confirm UI).
// All searchParams are validated against whitelists server-side; the FilterBar
// only writes the URL.
// ---------------------------------------------------------------------------

const BOARDS = ["points", "streak"] as const;
const SCOPES = ["subject", "grade", "city", "school"] as const; // "" = global
const PERIODS = ["month", "all_time"] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The three formula keys shown in Section 2 (must exist in SETTING_META).
const LB_SETTING_KEYS = [
  "leaderboard.points.per_correct",
  "leaderboard.points.practice_daily_cap_per_subject",
  "leaderboard.points.olympiad_multiplier",
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

type BoardRow = {
  rank: number;
  display_name: string | null;
  anon_tag: string | null;
  value: number;
  is_self: boolean;
};

export default async function LeaderboardAdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Administrator-only (Content Managers are redirected to /unauthorized).
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const supabase = await createClient();
  const sp = await searchParams;

  // ---- Validated searchParams --------------------------------------------
  const boardRaw = first(sp, "board");
  const board: (typeof BOARDS)[number] =
    boardRaw === "streak" ? "streak" : "points"; // "" (default) = points
  const scopeRaw = first(sp, "scope");
  // The streak board is GLOBAL-ONLY (DB-enforced too) — force global there.
  const scope =
    board === "points" && (SCOPES as readonly string[]).includes(scopeRaw)
      ? (scopeRaw as (typeof SCOPES)[number])
      : ""; // "" = global
  const sidRaw = first(sp, "sid").trim();
  const sid = scope && UUID_RE.test(sidRaw) ? sidRaw : "";
  const periodRaw = first(sp, "period");
  const period: (typeof PERIODS)[number] =
    periodRaw === "all_time" ? "all_time" : "month"; // "" (default) = month

  // ---- Scope-id options (only the list the selected scope needs) -----------
  let scopeOptions: { value: string; label: string }[] = [];
  if (scope === "subject") {
    const { data } = await supabase.from("subjects").select("id, name").order("name");
    scopeOptions = ((data ?? []) as any[]).map((r) => ({
      value: r.id as string,
      label: String(r.name),
    }));
  } else if (scope === "grade") {
    const { data } = await supabase.from("grades").select("id, name").order("level");
    scopeOptions = ((data ?? []) as any[]).map((r) => ({
      value: r.id as string,
      label: String(r.name),
    }));
  } else if (scope === "city") {
    const { data } = await supabase.from("districts").select("id, name").order("name");
    scopeOptions = ((data ?? []) as any[]).map((r) => ({
      value: r.id as string,
      label: String(r.name),
    }));
  } else if (scope === "school") {
    const { data } = await supabase
      .from("schools")
      .select("id, name, districts(name)")
      .order("name");
    scopeOptions = ((data ?? []) as any[]).map((r) => ({
      value: r.id as string,
      label: r.districts?.name
        ? `${String(r.name)} — ${String(r.districts.name)}`
        : String(r.name),
    }));
  }

  // ---- Board rows (session client; the RPC is authenticated-granted) -------
  const needsScopeId = scope !== "";
  const canQuery = !needsScopeId || sid !== "";
  let rows: BoardRow[] = [];
  let loadError = false;
  if (canQuery) {
    const { data, error } = await supabase.rpc("get_leaderboard", {
      p_board: board,
      p_scope: scope === "" ? "global" : scope,
      p_scope_id: sid === "" ? null : sid,
      p_period: period,
      p_limit: 100,
    });
    if (error) {
      console.error("[admin] get_leaderboard failed", error.message);
      loadError = true;
    } else {
      rows = ((data ?? []) as any[]).map((r) => ({
        rank: Number(r.rank),
        display_name: r.display_name ?? null,
        anon_tag: r.anon_tag ?? null,
        value: Number(r.value),
        is_self: Boolean(r.is_self),
      }));
    }
  }

  // ---- Points-formula settings values --------------------------------------
  const { data: settingRows } = await supabase
    .from("system_settings")
    .select("key, value_json")
    .in("key", [...LB_SETTING_KEYS]);
  const settingValue = new Map<string, unknown>();
  for (const row of (settingRows ?? []) as { key: string; value_json: unknown }[]) {
    settingValue.set(row.key, row.value_json);
  }

  // ---- Named competition seasons (Section 3) --------------------------------
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

  // ---- FilterBar selects (conditional cascade, values already validated) ----
  const selects: FilterBarSelect[] = [
    {
      key: "board",
      value: board === "streak" ? "streak" : "",
      allLabel: t("lb.board.points"),
      ariaLabel: t("lb.board.label"),
      options: [{ value: "streak", label: t("lb.board.streak") }],
      resets: ["scope", "sid"],
    },
  ];
  if (board === "points") {
    selects.push({
      key: "scope",
      value: scope,
      allLabel: t("lb.scope.global"),
      ariaLabel: t("lb.scope.label"),
      options: SCOPES.map((s) => ({ value: s, label: t(`lb.scope.${s}`) })),
      resets: ["sid"],
    });
    if (scope) {
      selects.push({
        key: "sid",
        value: sid,
        allLabel: t("lb.scopeId.choose"),
        ariaLabel: t(`lb.scope.${scope}`),
        options: scopeOptions,
      });
    }
  }
  selects.push({
    key: "period",
    value: period === "all_time" ? "all_time" : "",
    allLabel: t("lb.period.month"),
    ariaLabel: t("lb.period.label"),
    options: [{ value: "all_time", label: t("lb.period.all") }],
  });

  const valueHeader =
    board === "streak" ? t("lb.col.streakDays") : t("lb.col.points");

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("lb.title")}</h1>
        <p className="muted">{t("lb.subtitle")}</p>
      </div>

      {/* ---- Section 1: boards viewer ---- */}
      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{t("lb.viewer.title")}</h3>
        {board === "streak" && (
          <p className="muted" style={{ marginTop: 4 }}>
            {t("lb.streakGlobalNote")}
          </p>
        )}
        <FilterBar
          basePath="/leaderboard"
          selects={selects}
          clearLabel={t("qfilter.clear")}
        />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>{t("lb.col.rank")}</th>
                <th>{t("lb.col.name")}</th>
                <th className="nowrap">{valueHeader}</th>
              </tr>
            </thead>
            <tbody>
              {loadError && (
                <tr>
                  <td colSpan={3} className="muted">
                    {t("lb.loadError")}
                  </td>
                </tr>
              )}
              {!loadError && !canQuery && (
                <tr>
                  <td colSpan={3} className="muted">
                    {t("lb.needScopeId")}
                  </td>
                </tr>
              )}
              {!loadError && canQuery && rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    {t("lb.empty")}
                  </td>
                </tr>
              )}
              {!loadError &&
                rows.map((r) => (
                  <tr key={r.rank}>
                    <td className="nowrap">{r.rank}</td>
                    <td>
                      {r.display_name ? (
                        r.display_name
                      ) : (
                        <span className="pill pill-muted">
                          {t("lb.anonymized")}
                          {r.anon_tag ? ` #${r.anon_tag}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="nowrap">{r.value}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- Section 2: points formula ---- */}
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

      {/* ---- Section 3: named competition seasons (full CRUD) ---- */}
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

      {/* ---- Section 4: monthly board reset (SEPARATE from named seasons) ---- */}
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
