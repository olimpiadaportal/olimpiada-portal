import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { hasServiceRole } from "@/lib/supabase/admin";
import { getT, getLocale } from "@/i18n/server";
import { formatBakuDateTime } from "@/lib/admin/datetime";
import { listSubscriptions } from "@/lib/admin/subscriptions";
import {
  KNOWN_PROVIDERS,
  PLAN_INTERVALS,
  SUBSCRIPTION_PAGE_SIZE,
  SUBSCRIPTION_STATUSES,
  providerBadgeClass,
  providerKind,
  statusPillClass,
} from "@/lib/admin/subscription-lifecycle";
import { localStrings } from "./labels";

// Admin Subscriptions list — Administrator-only. A single plain server-rendered
// GET filter form (mirrors /audit's pattern) rather than the client FilterBar:
// FilterBar's buildHref only ever preserves ITS OWN search+select keys, which
// would silently drop the period-end date range whenever a select changed.
// One combined form keeps every filter (+ pagination reset) consistent.

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = localStrings(locale);
  const serviceReady = hasServiceRole();
  const sp = await searchParams;

  const q = firstParam(sp, "q").trim().slice(0, 200);
  const rawStatus = firstParam(sp, "status");
  const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(rawStatus)
    ? rawStatus
    : "";
  const rawInterval = firstParam(sp, "interval");
  const interval = (PLAN_INTERVALS as readonly string[]).includes(rawInterval)
    ? rawInterval
    : "";
  const rawProvider = firstParam(sp, "provider");
  const provider = (KNOWN_PROVIDERS as readonly string[]).includes(rawProvider)
    ? rawProvider
    : "";
  const rawFrom = firstParam(sp, "from").trim();
  const periodEndFrom = DATE_RE.test(rawFrom) ? rawFrom : "";
  const rawTo = firstParam(sp, "to").trim();
  const periodEndTo = DATE_RE.test(rawTo) ? rawTo : "";

  const pageRaw = Math.floor(Number(firstParam(sp, "page")));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const result = await listSubscriptions({
    page,
    q,
    status,
    interval,
    provider,
    periodEndFrom,
    periodEndTo,
  });

  const totalPages = Math.max(1, Math.ceil(result.total / SUBSCRIPTION_PAGE_SIZE));

  const pageHref = (p: number): string => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (interval) params.set("interval", interval);
    if (provider) params.set("provider", provider);
    if (periodEndFrom) params.set("from", periodEndFrom);
    if (periodEndTo) params.set("to", periodEndTo);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/subscriptions?${qs}` : "/subscriptions";
  };

  const hasActiveFilters = Boolean(
    q || status || interval || provider || periodEndFrom || periodEndTo,
  );

  const fmt = (iso: string | null): string =>
    iso ? formatBakuDateTime(iso, locale) : "—";

  const fmtAmount = (n: number | null, currency: string): string =>
    n === null || n === 0 ? "—" : `${n.toFixed(2)} ${currency}`;

  return (
    <div className="page subscriptions-page">
      <div className="page-head">
        <h1>{t("nav.subscriptions")}</h1>
        <p className="muted">{lt("subs.subtitle")}</p>
      </div>

      {!serviceReady && (
        <section className="card" style={{ marginBottom: 16 }}>
          <p className="form-error">{lt("subs.noServiceKey")}</p>
        </section>
      )}

      <form method="get" className="audit2-filter">
        <div className="audit-filter-row">
          <label htmlFor="subs-q">{lt("subs.filter.search")}</label>
          <input
            id="subs-q"
            type="text"
            name="q"
            defaultValue={q}
            placeholder={lt("subs.filter.search")}
          />

          <label htmlFor="subs-status">{lt("subs.filter.status")}</label>
          <select id="subs-status" name="status" defaultValue={status}>
            <option value="">{lt("subs.filter.all")}</option>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {lt(`subs.status.${s}`)}
              </option>
            ))}
          </select>

          <label htmlFor="subs-interval">{lt("subs.filter.interval")}</label>
          <select id="subs-interval" name="interval" defaultValue={interval}>
            <option value="">{lt("subs.filter.all")}</option>
            {PLAN_INTERVALS.map((i) => (
              <option key={i} value={i}>
                {lt(`subs.interval.${i}`)}
              </option>
            ))}
          </select>

          <label htmlFor="subs-provider">{lt("subs.filter.provider")}</label>
          <select id="subs-provider" name="provider" defaultValue={provider}>
            <option value="">{lt("subs.filter.all")}</option>
            {KNOWN_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {lt(`subs.source.${providerKind(p)}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="audit-filter-row">
          <label htmlFor="subs-from">{lt("subs.filter.periodEndFrom")}</label>
          <input id="subs-from" type="date" name="from" defaultValue={periodEndFrom} />

          <label htmlFor="subs-to">{lt("subs.filter.periodEndTo")}</label>
          <input id="subs-to" type="date" name="to" defaultValue={periodEndTo} />

          <button type="submit" className="btn-ghost btn-sm">
            {lt("subs.filter.apply")}
          </button>
          {hasActiveFilters && (
            <Link className="qfilters-clear" href="/subscriptions">
              {t("qfilter.clear")}
            </Link>
          )}
        </div>
      </form>

      <section className="card">
        {result.loadError && (
          <p className="form-error">{t("err.server")}</p>
        )}
        {!result.loadError && result.rows.length === 0 && (
          <p className="muted">{hasActiveFilters ? t("flt.noMatches") : lt("subs.none")}</p>
        )}
        {result.rows.length > 0 && (
          <div className="table-wrap">
            <table className="table subs-table">
              <thead>
                <tr>
                  <th>{lt("subs.col.child")}</th>
                  <th>{lt("subs.col.parent")}</th>
                  <th>{lt("subs.col.subjects")}</th>
                  <th>{lt("subs.col.interval")}</th>
                  <th>{lt("subs.col.status")}</th>
                  <th>{lt("subs.col.amount")}</th>
                  <th>{lt("subs.col.source")}</th>
                  <th>{lt("subs.col.trialEnd")}</th>
                  <th>{lt("subs.col.periodEnd")}</th>
                  <th>{lt("subs.col.updated")}</th>
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => {
                  const kind = providerKind(row.provider);
                  const providerLabel =
                    kind === "other" ? row.provider : lt(`subs.source.${kind}`);
                  return (
                    <tr key={row.id}>
                      <td className="subs-child">{row.childName}</td>
                      <td className="subs-parent">
                        {row.parentName}
                        {row.parentEmail && (
                          <>
                            <br />
                            <span className="muted">{row.parentEmail}</span>
                          </>
                        )}
                      </td>
                      <td className="subs-subjects">
                        {row.subjectNames.length ? row.subjectNames.join(", ") : "—"}
                      </td>
                      <td className="nowrap">{lt(`subs.interval.${row.interval}`)}</td>
                      <td className="nowrap">
                        <span className={`pill ${statusPillClass(row.status)}`}>
                          {lt(`subs.status.${row.status}`)}
                        </span>
                      </td>
                      <td className="nowrap">{fmtAmount(row.totalAmount, row.currency)}</td>
                      <td className="nowrap">
                        <span className={`pill pill-sm ${providerBadgeClass(kind)}`}>
                          {providerLabel}
                        </span>
                      </td>
                      <td className="nowrap muted">{fmt(row.trialEndsAt)}</td>
                      <td className="nowrap muted">{fmt(row.currentPeriodEnd)}</td>
                      <td className="nowrap muted">{fmt(row.updatedAt)}</td>
                      <td className="nowrap">
                        <Link className="btn-ghost btn-sm" href={`/subscriptions/${row.id}`}>
                          {lt("subs.action.view")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {result.total > SUBSCRIPTION_PAGE_SIZE && (
        <div className="qpager">
          <span className="qpager-info muted">
            {t("qpage.pageOf")
              .replace("{page}", String(page))
              .replace("{total}", String(totalPages))}
          </span>
          <nav className="qpager-nav" aria-label="pagination">
            {page > 1 ? (
              <Link className="qpage-link" href={pageHref(page - 1)}>
                {t("qpage.prev")}
              </Link>
            ) : (
              <span className="qpage-link disabled">{t("qpage.prev")}</span>
            )}
            {page < totalPages ? (
              <Link className="qpage-link" href={pageHref(page + 1)}>
                {t("qpage.next")}
              </Link>
            ) : (
              <span className="qpage-link disabled">{t("qpage.next")}</span>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
