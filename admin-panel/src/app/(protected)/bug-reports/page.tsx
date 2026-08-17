import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getLocale, getT } from "@/i18n/server";
import { FilterBar } from "@/components/FilterBar";
import { sanitizeSearchTerm } from "@/lib/admin/search";
import { formatBakuDateTime } from "@/lib/admin/datetime";
import {
  REPORT_STATUSES,
  isReportStatus,
  reportStatusPill,
} from "@/lib/admin/question-report-status";
import {
  BUG_PRIORITIES,
  REPORTER_ROLES,
  bugPriorityPill,
  isBugPriority,
  isReporterRole,
} from "@/lib/admin/bug-report-meta";

// Platform bug reports (migration 116) — Administrator-only triage worklist.
// Structural mirror of /question-reports so the two report sections read as one
// product: requireAdmin() first, searchParams validated server-side, the URL as
// the single source of truth, and stat cards that are themselves status filters.
//
// The sibling difference is what each feature is ABOUT: a question report points
// at one question row, a bug report points at a broken page or flow, so the
// columns here are reporter/role/route/priority rather than question/subject.
const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

export default async function BugReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const [t, locale, supabase, sp] = await Promise.all([
    getT(),
    getLocale(),
    createClient(),
    searchParams,
  ]);

  // ---- Validated searchParams --------------------------------------------
  const q = first(sp, "q").trim().slice(0, 200);
  const statusRaw = first(sp, "status");
  const status = isReportStatus(statusRaw) ? statusRaw : "";
  const priorityRaw = first(sp, "priority");
  const priority = isBugPriority(priorityRaw) ? priorityRaw : "";
  const roleRaw = first(sp, "role");
  const role = isReporterRole(roleRaw) ? roleRaw : "";
  // The only non-default sort. Anything else falls back to newest-first rather
  // than reaching .order() as a client string.
  const sort = first(sp, "sort") === "oldest" ? "oldest" : "";
  const pageRaw = Math.floor(Number(first(sp, "page")));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  // ---- Stat cards: one head-only count per status -------------------------
  const countResults = await Promise.all(
    REPORT_STATUSES.map((s) =>
      supabase.from("bug_reports").select("id", { count: "exact", head: true }).eq("status", s),
    ),
  );
  const countByStatus = new Map<string, number>(
    REPORT_STATUSES.map((s, i) => [s, countResults[i]?.count ?? 0]),
  );

  // ---- The list -----------------------------------------------------------
  let listQuery = supabase
    .from("bug_reports")
    .select(
      "id, title, description, status, priority, reported_severity, reporter_profile_id, reporter_role, route_path, locale, platform, created_at",
      { count: "exact" },
    );
  if (status) listQuery = listQuery.eq("status", status);
  if (priority) listQuery = listQuery.eq("priority", priority);
  if (role) listQuery = listQuery.eq("reporter_role", role);
  const escaped = sanitizeSearchTerm(q);
  if (escaped) {
    // A bug is as often described in the body as named in the title, so the
    // search spans both. sanitizeSearchTerm has already stripped the characters
    // PostgREST's or() grammar treats specially and escaped the LIKE wildcards.
    listQuery = listQuery.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
  }

  const { data: rows, count } = await listQuery
    .order("created_at", { ascending: sort === "oldest" })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const list = (rows ?? []) as Record<string, any>[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ---- Reporter labels for the ids in the VISIBLE page only ---------------
  const reporterIds = Array.from(
    new Set(
      list
        .map((r) => r.reporter_profile_id)
        .filter((v: unknown): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  const { data: profiles } = reporterIds.length
    ? await supabase.from("profiles").select("id, display_name, email").in("id", reporterIds)
    : { data: [] as Record<string, any>[] };
  const profileById = new Map<string, any>(
    ((profiles ?? []) as Record<string, any>[]).map((p) => [p.id, p]),
  );

  // An anonymous report never had a profile; a null id on a non-anonymous row
  // means the account was deleted (the FK is ON DELETE SET NULL). Those two are
  // different facts and the list says which.
  const reporterLabel = (r: Record<string, any>): string => {
    if (r.reporter_role === "anonymous") return t("brep.role.anonymous");
    const id = r.reporter_profile_id as string | null;
    if (!id) return t("brep.deletedAccount");
    const p = profileById.get(id);
    return p?.display_name || p?.email || t("brep.deletedAccount");
  };

  const href = (over: Record<string, string | null>): string => {
    const base: Record<string, string> = {
      q,
      status,
      priority,
      role,
      sort,
      page: page > 1 ? String(page) : "",
    };
    const merged = { ...base, ...over };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/bug-reports?${qs}` : "/bug-reports";
  };

  const hasFilters = Boolean(q || status || priority || role);

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("nav.bugReports")}</h1>
            <p className="muted">{t("brep.subtitle")}</p>
          </div>
          {/* Date sort is a single toggle rather than a select: there are only
              two orders, and a two-option dropdown costs a click for nothing.
              The label names what the click DOES, not the current order — a
              toggle labelled with its own state reads as a broken button. */}
          <Link
            className="btn-ghost"
            href={href({ sort: sort ? null : "oldest", page: null })}
            aria-label={t("brep.filter.sortAria")}
          >
            {sort === "oldest" ? t("brep.filter.sortNewest") : t("brep.filter.sortOldest")}
          </Link>
        </div>
      </div>

      {/* Status cards double as filters; "New" answers "is there anything to do". */}
      <div className="qstat-grid">
        {REPORT_STATUSES.map((s) => (
          <Link
            key={s}
            className={`qstat-card${status === s ? " active" : ""}`}
            href={href({ status: status === s ? null : s, page: null })}
            aria-current={status === s ? "true" : undefined}
          >
            <span className="qstat-value">{countByStatus.get(s) ?? 0}</span>
            <span className="qstat-label">{t(`brep.status.${s}`)}</span>
          </Link>
        ))}
      </div>

      <FilterBar
        basePath="/bug-reports"
        search={{ value: q, placeholder: t("brep.filter.search") }}
        selects={[
          {
            key: "status",
            value: status,
            allLabel: t("brep.filter.allStatuses"),
            ariaLabel: t("brep.field.status"),
            options: REPORT_STATUSES.map((s) => ({ value: s, label: t(`brep.status.${s}`) })),
          },
          {
            key: "priority",
            value: priority,
            allLabel: t("brep.filter.allPriorities"),
            ariaLabel: t("brep.field.priority"),
            options: BUG_PRIORITIES.map((p) => ({ value: p, label: t(`brep.priority.${p}`) })),
          },
          {
            key: "role",
            value: role,
            allLabel: t("brep.filter.allRoles"),
            ariaLabel: t("brep.field.role"),
            options: REPORTER_ROLES.map((r) => ({ value: r, label: t(`brep.role.${r}`) })),
          },
        ]}
        clearLabel={t("qfilter.clear")}
      />

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t("brep.field.title")}</th>
                <th>{t("brep.field.reporter")}</th>
                <th>{t("brep.field.role")}</th>
                <th>{t("brep.field.route")}</th>
                <th>{t("brep.field.platform")}</th>
                <th>{t("brep.field.created")}</th>
                <th>{t("brep.field.priority")}</th>
                <th>{t("brep.field.status")}</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    {hasFilters ? t("flt.noMatches") : t("brep.none")}
                  </td>
                </tr>
              )}
              {list.map((r) => (
                <tr key={r.id}>
                  {/* Truncated with CSS, never by slicing markup — and rendered
                      as a text child, so reporter text is escaped by React.
                      A bug report may come from an UNAUTHENTICATED visitor, so
                      this is the strictest instance of that rule in the panel. */}
                  <td className="qrep-cell-clip">{r.title}</td>
                  <td className="muted">{reporterLabel(r)}</td>
                  <td className="nowrap">{t(`brep.role.${r.reporter_role}`)}</td>
                  {/* Text, never a link: the path is client-declared. */}
                  <td className="mono qrep-cell-clip">{r.route_path ?? "—"}</td>
                  <td className="nowrap">{t(`brep.platform.${r.platform}`)}</td>
                  <td className="muted nowrap">{formatBakuDateTime(r.created_at, locale)}</td>
                  <td className="nowrap">
                    <span className={`pill ${bugPriorityPill(r.priority)}`}>
                      {t(`brep.priority.${r.priority}`)}
                    </span>
                  </td>
                  <td className="nowrap">
                    <span className={`pill ${reportStatusPill(r.status)}`}>
                      {t(`brep.status.${r.status}`)}
                    </span>
                  </td>
                  <td className="row-actions nowrap">
                    <Link href={`/bug-reports/${r.id}`}>{t("brep.open")}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="qpager">
        <span className="qpager-info muted">
          {t("brep.showing")
            .replace("{shown}", String(list.length))
            .replace("{total}", String(total))}
        </span>
        <nav className="qpager-nav" aria-label="pagination">
          {page > 1 ? (
            <Link className="qpage-link" href={href({ page: String(page - 1) })}>
              {t("qpage.prev")}
            </Link>
          ) : (
            <span className="qpage-link disabled">{t("qpage.prev")}</span>
          )}
          <span className="qpage-link current" aria-current="page">
            {page}
          </span>
          {page < totalPages ? (
            <Link className="qpage-link" href={href({ page: String(page + 1) })}>
              {t("qpage.next")}
            </Link>
          ) : (
            <span className="qpage-link disabled">{t("qpage.next")}</span>
          )}
        </nav>
      </div>
    </div>
  );
}
