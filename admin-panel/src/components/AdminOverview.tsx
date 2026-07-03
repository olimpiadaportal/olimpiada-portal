// R9 (T6) — Admin dashboard "Platform overview": real KPI tiles + two small
// hand-rolled SVG trend charts fed by the get_admin_platform_overview RPC
// (admin-only; the page simply omits this section for content managers).
// Server component — no interactivity, all strings via the panel's t().

export type AdminOverviewData = {
  children_total?: number | null;
  parents_total?: number | null;
  active_children_7d?: number | null;
  attempts_30d?: number | null;
  platform_accuracy_30d?: number | null;
  questions_published?: number | null;
  active_subscriptions?: number | null;
  signups_trend?: { date: string; count: number }[] | null;
  attempts_trend?: { date: string; count: number }[] | null;
};

type Point = { date: string; count: number };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// dd.mm axis label from an ISO date, deterministic (no locale APIs).
function fmtDayMonth(iso: string): string {
  const [, m, d] = String(iso).slice(0, 10).split("-");
  return m && d ? `${d}.${m}` : "";
}

function cleanSeries(rows: Point[] | null | undefined): Point[] {
  return (rows ?? []).map((r) => ({
    date: String(r?.date ?? ""),
    count: num(r?.count),
  }));
}

/* ------------------------- hand-rolled charts -------------------------- */

// Sparkline: 2px brand line + soft area wash over hairline gridlines; value
// label on the last point, native <title> tooltips, sparse dd.mm x labels.
function SparkLine({ points, ariaLabel }: { points: Point[]; ariaLabel: string }) {
  const W = 420;
  const H = 150;
  const padL = 30;
  const padR = 14;
  const padT = 18;
  const padB = 24;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const baseY = padT + ih;
  const n = points.length;
  const max = Math.max(...points.map((p) => p.count), 1);
  const nice = Math.max(2, Math.ceil(max / 2) * 2);
  const xAt = (i: number) => (n === 1 ? padL + iw / 2 : padL + (iw * i) / (n - 1));
  const yAt = (v: number) => baseY - (v / nice) * ih;
  const pts = points.map((p, i) => [xAt(i), yAt(p.count)] as const);
  const line = pts.map((p) => `${p[0]},${p[1]}`).join(" ");
  const area = `${pts[0][0]},${baseY} ${line} ${pts[n - 1][0]},${baseY}`;
  const step = Math.max(1, Math.ceil(n / 6));
  const showLabel = (i: number) =>
    i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2);
  const last = pts[n - 1];

  return (
    <svg className="adash-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {[0, nice / 2, nice].map((tv) => (
        <g key={tv}>
          <line x1={padL} x2={W - padR} y1={yAt(tv)} y2={yAt(tv)} stroke="var(--border)" strokeWidth="1" />
          <text x={padL - 6} y={yAt(tv) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">
            {tv}
          </text>
        </g>
      ))}
      {n > 1 && (
        <>
          <polygon points={area} fill="var(--brand)" opacity="0.08" />
          <polyline
            points={line}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill="var(--brand)">
          <title>{`${fmtDayMonth(points[i].date)}: ${points[i].count}`}</title>
        </circle>
      ))}
      <text
        x={last[0]}
        y={Math.max(10, last[1] - 8)}
        textAnchor={n === 1 ? "middle" : "end"}
        fontSize="11"
        fontWeight="700"
        fill="var(--text)"
      >
        {points[n - 1].count}
      </text>
      {pts.map(([x], i) =>
        showLabel(i) ? (
          <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
            {fmtDayMonth(points[i].date)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

// Daily bars: brand fill, rounded tops, value label on the peak bar only,
// native tooltips, sparse dd.mm x labels.
function TrendBars({ points, ariaLabel }: { points: Point[]; ariaLabel: string }) {
  const W = 420;
  const H = 150;
  const padL = 30;
  const padR = 10;
  const padT = 18;
  const padB = 24;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const baseY = padT + ih;
  const values = points.map((p) => p.count);
  const max = Math.max(...values, 1);
  const nice = Math.max(2, Math.ceil(max / 2) * 2);
  const slot = iw / points.length;
  const bw = Math.min(20, slot * 0.6);
  const peak = values.indexOf(max);
  const step = Math.max(1, Math.ceil(points.length / 7));

  return (
    <svg className="adash-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {[0, nice / 2, nice].map((tv) => {
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
      {points.map((p, i) => {
        const h = (p.count / nice) * ih;
        const x = padL + slot * i + (slot - bw) / 2;
        const y = baseY - h;
        const r = Math.min(3, h);
        const d = `M ${x} ${baseY} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + bw - r} ${y} Q ${x + bw} ${y} ${x + bw} ${y + r} L ${x + bw} ${baseY} Z`;
        return (
          <g key={i}>
            <path d={d} fill="var(--brand)">
              <title>{`${fmtDayMonth(p.date)}: ${p.count}`}</title>
            </path>
            {i === peak && p.count > 0 && (
              <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)">
                {p.count}
              </text>
            )}
            {i % step === 0 && (
              <text x={padL + slot * i + slot / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {fmtDayMonth(p.date)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------- overview ------------------------------ */

export function AdminOverview({
  data,
  t,
}: {
  data: AdminOverviewData;
  t: (key: string) => string;
}) {
  const acc = data.platform_accuracy_30d;
  const kpis: { key: string; value: string }[] = [
    { key: "adash.children", value: String(num(data.children_total)) },
    { key: "adash.parents", value: String(num(data.parents_total)) },
    { key: "adash.active7d", value: String(num(data.active_children_7d)) },
    { key: "adash.attempts30d", value: String(num(data.attempts_30d)) },
    { key: "adash.accuracy30d", value: acc == null ? "—" : `${Math.round(num(acc))}%` },
    { key: "adash.questions", value: String(num(data.questions_published)) },
    { key: "adash.subs", value: String(num(data.active_subscriptions)) },
  ];

  const signups = cleanSeries(data.signups_trend);
  const attempts = cleanSeries(data.attempts_trend);

  return (
    <section className="adash-section">
      <div className="adash-head">
        <h2>{t("adash.title")}</h2>
        <p className="muted">{t("adash.subtitle")}</p>
      </div>

      <div className="adash-kpis">
        {kpis.map((k) => (
          <div className="adash-kpi" key={k.key}>
            <span className="adash-kpi-val">{k.value}</span>
            <span className="adash-kpi-label">{t(k.key)}</span>
          </div>
        ))}
      </div>

      <div className="adash-charts">
        <div className="adash-chart-card">
          <h3 className="adash-chart-title">{t("adash.signups")}</h3>
          <p className="adash-chart-sub">{t("adash.signupsSub")}</p>
          {signups.length > 0 && (
            <SparkLine points={signups} ariaLabel={t("adash.signups")} />
          )}
        </div>
        <div className="adash-chart-card">
          <h3 className="adash-chart-title">{t("adash.attemptsTrend")}</h3>
          <p className="adash-chart-sub">{t("adash.attemptsTrendSub")}</p>
          {attempts.length > 0 && (
            <TrendBars points={attempts} ariaLabel={t("adash.attemptsTrend")} />
          )}
        </div>
      </div>
    </section>
  );
}
