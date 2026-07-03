"use client";

// R9 (T6) — Parent analytics dashboard (client). Renders the per-child,
// per-subject progress area under the real top-level metric cards: child
// selector (only when >1 child), subject tabs (active subjects come from the
// child's live subscription; inactive subjects render disabled with a lock),
// KPI tiles, hand-rolled inline-SVG charts and two topic tables.
//
// Round 9 replaces the Round-8 demo data with REAL aggregates from the
// get_child_subject_dashboard RPC: the server page resolves the URL selection
// (?child=<profileId>&subject=<subjectId|all>), calls the RPC once and passes
// the payload here; the selector/tabs just NAVIGATE (router.replace, scroll
// kept) so the server refetches. All copy arrives pre-translated in `dict`
// (existing server->client pattern).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type AnalyticsSubject = {
  /** Subject uuid (RPC filter + URL value). */
  id: string;
  /** One of the 4 platform slugs: math | science | logic | english. */
  slug: string;
};

export type AnalyticsChild = {
  id: string;
  name: string;
  /** Active subjects from the child's live subscription (canonical tab order). */
  activeSubjects: AnalyticsSubject[];
};

// get_child_subject_dashboard → jsonb payload (every field defensive-optional:
// an RPC error upstream is passed down as {}).
export type DashPayload = {
  totals?: {
    attempts?: number | null;
    questions?: number | null;
    correct?: number | null;
    wrong?: number | null;
    accuracy?: number | null;
  } | null;
  time_spent_minutes?: number | null;
  last_activity?: string | null;
  weekly_activity?: { date: string; attempts: number }[] | null;
  accuracy_trend?: { date: string; accuracy: number | null }[] | null;
  per_topic?: {
    topic_id: string;
    topic: string;
    answered: number;
    correct: number;
    wrong: number;
    accuracy: number | null;
  }[] | null;
  mistakes?: {
    topic: string;
    subtopic: string;
    wrong: number;
    accuracy: number | null;
  }[] | null;
};

const SUBJECTS = ["math", "science", "logic", "english"] as const;

// Best/weakest topic need a minimum sample before they mean anything.
const MIN_TOPIC_SAMPLE = 3;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// dd.mm.yyyy from an ISO date/timestamp string — deterministic (no locale
// APIs), so SSR and hydration always match.
function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}.${m}.${y}`;
}

// dd.mm short label for chart axes.
function fmtDayMonth(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return m && d ? `${d}.${m}` : "";
}

// Weekday dict key ("mon".."sun") for an ISO date, UTC-stable.
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
function dayKey(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "mon" : DAY_KEYS[d.getUTCDay()];
}

/* ------------------------------- icons -------------------------------- */

function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function TrendUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

function TrendDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M14 17h7v-7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ChartIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </svg>
  );
}

/* ------------------------- hand-rolled charts -------------------------- */

// Weekly practice: 7 labeled bars. Single series (accent), rounded data-end,
// hairline gridlines, muted axis text, value label on the peak bar only,
// native <title> tooltip on every bar.
function WeeklyBars({
  values,
  days,
  ariaLabel,
}: {
  values: number[];
  days: string[];
  ariaLabel: string;
}) {
  const W = 340;
  const H = 180;
  const padL = 30;
  const padR = 10;
  const padT = 20;
  const padB = 28;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const baseY = padT + ih;
  const max = Math.max(...values, 1);
  const nice = Math.max(4, Math.ceil(max / 2) * 2);
  const slot = iw / values.length;
  const bw = Math.min(24, slot * 0.55);
  const peak = values.indexOf(max);
  const ticks = [0, nice / 2, nice];

  return (
    <svg className="ana-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {ticks.map((tv) => {
        const y = baseY - (tv / nice) * ih;
        return (
          <g key={tv}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">
              {tv}
            </text>
          </g>
        );
      })}
      {values.map((v, i) => {
        const h = (v / nice) * ih;
        const x = padL + slot * i + (slot - bw) / 2;
        const y = baseY - h;
        const r = Math.min(4, h);
        const d = `M ${x} ${baseY} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + bw - r} ${y} Q ${x + bw} ${y} ${x + bw} ${y + r} L ${x + bw} ${baseY} Z`;
        return (
          <g key={i}>
            <path d={d} fill="var(--accent)">
              <title>{`${days[i]}: ${v}`}</title>
            </path>
            {i === peak && v > 0 && (
              <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)">
                {v}
              </text>
            )}
            <text x={padL + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">
              {days[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Accuracy trend: single 2px line (secondary accent) + soft area wash,
// surface-ringed dots, endpoint direct label, native tooltips. Handles a
// variable number of daily points (sparse x labels) and degrades gracefully
// to a single centered dot when only one day has data.
function TrendLine({
  points,
  ariaLabel,
}: {
  points: { label: string; value: number }[];
  ariaLabel: string;
}) {
  const W = 340;
  const H = 180;
  const padL = 34;
  const padR = 26;
  const padT = 16;
  const padB = 28;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const baseY = padT + ih;
  const n = points.length;
  const xAt = (i: number) => (n === 1 ? padL + iw / 2 : padL + (iw * i) / (n - 1));
  const pts = points.map(
    (p, i) => [xAt(i), baseY - (Math.min(100, Math.max(0, p.value)) / 100) * ih] as const,
  );
  const line = pts.map((p) => `${p[0]},${p[1]}`).join(" ");
  const area = `${pts[0][0]},${baseY} ${line} ${pts[n - 1][0]},${baseY}`;
  const stroke = "var(--accent-2, #ff8a00)";
  const last = pts[n - 1];
  // Sparse x labels: at most ~6, always including the last point.
  const step = Math.max(1, Math.ceil(n / 6));
  const showLabel = (i: number) =>
    i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2);

  return (
    <svg className="ana-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {[0, 25, 50, 75, 100].map((tv) => {
        const y = baseY - (tv / 100) * ih;
        return (
          <g key={tv}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
            {tv % 50 === 0 && (
              <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">
                {tv}
              </text>
            )}
          </g>
        );
      })}
      {n > 1 && (
        <>
          <polygon points={area} fill={stroke} opacity="0.08" />
          <polyline
            points={line}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill={stroke} stroke="var(--surface)" strokeWidth="2">
          <title>{`${points[i].label} — ${Math.round(points[i].value)}%`}</title>
        </circle>
      ))}
      <text
        x={last[0]}
        y={Math.max(11, last[1] - 10)}
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="var(--text)"
      >
        {Math.round(points[n - 1].value)}%
      </text>
      {pts.map(([x], i) =>
        showLabel(i) ? (
          <text key={i} x={x} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">
            {points[i].label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/* ------------------------------ dashboard ------------------------------ */

export function AnalyticsDashboard({
  kids,
  dict,
  selectedChildId,
  selectedSubject,
  data,
}: {
  kids: AnalyticsChild[];
  dict: Record<string, string>;
  /** Resolved by the server from ?child= (defaults to the first child). */
  selectedChildId: string;
  /** "all" | subject uuid | "" (child has no active subjects). */
  selectedSubject: string;
  /** get_child_subject_dashboard payload for the selection ({} on error). */
  data: DashPayload | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  if (kids.length === 0) return null;
  const kid = kids.find((k) => k.id === selectedChildId) ?? kids[0];
  const activeBySlug = new Map(kid.activeSubjects.map((s) => [s.slug, s.id]));

  // Selection is URL state: replace (not push) so back doesn't step through
  // every tab click, and keep the scroll position while the server refetches.
  const go = (childId: string, subject: string | null) => {
    const qs = new URLSearchParams();
    qs.set("child", childId);
    if (subject) qs.set("subject", subject);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  };

  let body: React.ReactNode;
  if (!selectedSubject) {
    // No active subject subscription for this child → single locked panel.
    body = (
      <div className="ana-locked-panel">
        <span className="ana-locked-ico" aria-hidden="true">
          <LockIcon size={22} />
        </span>
        <p>{dict["ana.noActive"]}</p>
        <p className="ana-locked-sub">{dict["ana.locked"]}</p>
        <Link className="btn" href={`/children/${kid.id}/subscribe`}>
          {dict["ana.goSubscribe"]}
        </Link>
      </div>
    );
  } else {
    const d = data ?? {};
    const totals = d.totals ?? {};
    const questions = num(totals.questions);

    if (questions === 0) {
      // Honest empty state: no graded practice in the window for this
      // child/subject → say so instead of rendering all-zero charts.
      body = (
        <div className="ana-locked-panel">
          <span className="ana-locked-ico" aria-hidden="true">
            <ChartIcon />
          </span>
          <p>{dict["ana.empty.title"]}</p>
          <p className="ana-locked-sub">{dict["ana.empty.sub"]}</p>
        </div>
      );
    } else {
      const weekly = (d.weekly_activity ?? []).map((w) => ({
        date: String(w?.date ?? ""),
        attempts: num(w?.attempts),
      }));
      const weeklyCount = weekly.reduce((a, b) => a + b.attempts, 0);
      const dayLabels = weekly.map((w) => dict[`ana.day.${dayKey(w.date)}`] ?? "");

      const trendPts = (d.accuracy_trend ?? [])
        .filter((p) => p && p.accuracy != null)
        .map((p) => ({ label: fmtDayMonth(String(p.date)), value: num(p.accuracy) }));

      const topics = (d.per_topic ?? []).map((r) => ({
        id: String(r?.topic_id ?? r?.topic ?? ""),
        topic: String(r?.topic ?? "—"),
        answered: num(r?.answered),
        accuracy: r?.accuracy == null ? null : num(r.accuracy),
      }));
      const mistakes = (d.mistakes ?? []).map((r) => ({
        topic: String(r?.topic ?? "—"),
        subtopic: String(r?.subtopic ?? "—"),
        wrong: num(r?.wrong),
      }));

      // Best/weakest topic, client-side, with a min-sample rule so one lucky
      // answer never becomes "best topic". Falls back to "—".
      const sampled = topics.filter(
        (r) => r.answered >= MIN_TOPIC_SAMPLE && r.accuracy != null,
      );
      const best = sampled.reduce<typeof sampled[number] | null>(
        (a, b) => (a == null || (b.accuracy ?? 0) > (a.accuracy ?? 0) ? b : a),
        null,
      );
      const weak = sampled.reduce<typeof sampled[number] | null>(
        (a, b) => (a == null || (b.accuracy ?? 0) < (a.accuracy ?? 0) ? b : a),
        null,
      );

      const totalMin = Math.max(0, Math.round(num(d.time_spent_minutes)));
      const hours = Math.floor(totalMin / 60);
      const mins = totalMin % 60;
      const timeLabel =
        hours > 0
          ? `${hours} ${dict["ana.unit.h"]} ${mins} ${dict["ana.unit.m"]}`
          : `${mins} ${dict["ana.unit.m"]}`;

      // T4: exactly 5 KPI tiles ("Average accuracy" removed — accuracy still
      // lives in the trend chart + topic table).
      const kpis: { label: string; value: string }[] = [
        { label: dict["ana.kpi.last7"], value: String(weeklyCount) },
        { label: dict["ana.kpi.tests"], value: String(num(totals.attempts)) },
        { label: dict["ana.kpi.correct"], value: String(num(totals.correct)) },
        { label: dict["ana.kpi.wrong"], value: String(num(totals.wrong)) },
        { label: dict["ana.kpi.time"], value: timeLabel },
      ];

      body = (
        <>
          <p className="ana-lockhint">{dict["ana.rangeNote"]}</p>

          {/* KPI tiles — 5 across on desktop (ana-kpis-5) */}
          <div className="ana-kpis ana-kpis-5">
            {kpis.map((k) => (
              <div className="ana-kpi" key={k.label}>
                <span className="ana-kpi-val">{k.value}</span>
                <span className="ana-kpi-label">{k.label}</span>
              </div>
            ))}
          </div>

          {/* Best topic / weakest topic / last activity */}
          <div className="ana-facts">
            <div className="ana-fact">
              <span className="ana-fact-ico ok" aria-hidden="true">
                <TrendUpIcon />
              </span>
              <span className="ana-fact-txt">
                <span className="ana-fact-val">{best ? best.topic : "—"}</span>
                <span className="ana-fact-label">{dict["ana.kpi.best"]}</span>
              </span>
            </div>
            <div className="ana-fact">
              <span className="ana-fact-ico warn" aria-hidden="true">
                <TrendDownIcon />
              </span>
              <span className="ana-fact-txt">
                <span className="ana-fact-val">{weak ? weak.topic : "—"}</span>
                <span className="ana-fact-label">{dict["ana.kpi.weak"]}</span>
              </span>
            </div>
            <div className="ana-fact">
              <span className="ana-fact-ico" aria-hidden="true">
                <ClockIcon />
              </span>
              <span className="ana-fact-txt">
                <span className="ana-fact-val">
                  {d.last_activity ? fmtDate(String(d.last_activity)) : "—"}
                </span>
                <span className="ana-fact-label">{dict["ana.kpi.last"]}</span>
              </span>
            </div>
          </div>

          {/* Charts */}
          <div className="ana-charts">
            <div className="ana-chart-card">
              <h3 className="ana-chart-title">{dict["ana.chart.weekly"]}</h3>
              <p className="ana-chart-sub">{dict["ana.chart.weeklySub"]}</p>
              <WeeklyBars
                values={weekly.map((w) => w.attempts)}
                days={dayLabels}
                ariaLabel={dict["ana.chart.weekly"]}
              />
            </div>
            <div className="ana-chart-card">
              <h3 className="ana-chart-title">{dict["ana.chart.trend"]}</h3>
              <p className="ana-chart-sub">{dict["ana.chart.trendSub30"]}</p>
              {trendPts.length === 0 ? (
                <p className="ana-chart-sub">{dict["ana.empty.trend"]}</p>
              ) : (
                <TrendLine points={trendPts} ariaLabel={dict["ana.chart.trend"]} />
              )}
            </div>
          </div>

          {/* Tables */}
          <div className="ana-tables">
            <div className="ana-chart-card">
              <h3 className="ana-chart-title">{dict["ana.chart.topics"]}</h3>
              <div className="ana-tablewrap">
                <table className="ana-table">
                  <thead>
                    <tr>
                      <th>{dict["ana.th.topic"]}</th>
                      <th className="ana-right">{dict["ana.th.questions"]}</th>
                      <th>{dict["ana.th.accuracy"]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topics.map((row) => (
                      <tr key={row.id}>
                        <td>{row.topic}</td>
                        <td className="ana-right">
                          <span className="ana-num">{row.answered}</span>
                        </td>
                        <td>
                          <span className="ana-acc">
                            <span className="ana-meter" aria-hidden="true">
                              <span
                                className="ana-meter-fill"
                                style={{
                                  width: `${Math.min(100, Math.max(0, row.accuracy ?? 0))}%`,
                                }}
                              />
                            </span>
                            <span className="ana-num">
                              {row.accuracy == null ? "—" : `${Math.round(row.accuracy)}%`}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ana-chart-card">
              <h3 className="ana-chart-title">{dict["ana.chart.mistakes"]}</h3>
              {mistakes.length === 0 ? (
                <p className="ana-chart-sub">{dict["ana.empty.mistakes"]}</p>
              ) : (
                <div className="ana-tablewrap">
                  <table className="ana-table">
                    <thead>
                      <tr>
                        <th>{dict["ana.th.topic"]}</th>
                        <th>{dict["ana.th.subtopic"]}</th>
                        <th className="ana-right">{dict["ana.th.mistakes"]}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mistakes.map((row) => (
                        <tr key={`${row.topic}|${row.subtopic}`}>
                          <td>{row.topic}</td>
                          <td>{row.subtopic}</td>
                          <td className="ana-right">
                            <span className="ana-num strong">{row.wrong}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      );
    }
  }

  return (
    <div className="ana-dash">
      <div className="ana-controls">
        {kids.length > 1 && (
          <div className="ana-ctl">
            <span className="ana-ctl-label">{dict["ana.childLabel"]}</span>
            <div className="ana-seg" role="group" aria-label={dict["ana.childLabel"]}>
              {kids.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className={k.id === kid.id ? "ana-seg-btn active" : "ana-seg-btn"}
                  aria-pressed={k.id === kid.id}
                  onClick={() => go(k.id, null)}
                >
                  {k.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="ana-ctl">
          <span className="ana-ctl-label">{dict["ana.subjectLabel"]}</span>
          <div className="ana-tabs" role="tablist" aria-label={dict["ana.subjectLabel"]}>
            {kid.activeSubjects.length > 1 && (
              <button
                type="button"
                role="tab"
                aria-selected={selectedSubject === "all"}
                className={selectedSubject === "all" ? "ana-tab active" : "ana-tab"}
                onClick={() => go(kid.id, "all")}
              >
                {dict["ana.subject.all"]}
              </button>
            )}
            {SUBJECTS.map((s) => {
              const subjectId = activeBySlug.get(s);
              const on = Boolean(subjectId);
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={on && selectedSubject === subjectId}
                  disabled={!on}
                  title={on ? undefined : dict["ana.locked"]}
                  className={
                    on && selectedSubject === subjectId ? "ana-tab active" : "ana-tab"
                  }
                  onClick={() => on && go(kid.id, subjectId!)}
                >
                  {!on && <LockIcon />}
                  {dict[`ana.subject.${s}`]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeBySlug.size > 0 && activeBySlug.size < SUBJECTS.length && (
        <p className="ana-lockhint">
          <LockIcon /> {dict["ana.locked"]}
        </p>
      )}

      {body}
    </div>
  );
}
