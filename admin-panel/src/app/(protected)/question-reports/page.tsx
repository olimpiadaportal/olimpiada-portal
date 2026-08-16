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

// Question reports (migration 115) — Administrator-only triage worklist.
// Same skeleton as every other admin list: requireAdmin() first, searchParams
// validated server-side, URL as the single source of truth, stat cards that are
// themselves status filters.
const PAGE_SIZE = 25;
const PLATFORMS = ["web", "android", "ios"] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREVIEW_CAP = 160;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

export default async function QuestionReportsPage({
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
  const platformRaw = first(sp, "platform");
  const platform = (PLATFORMS as readonly string[]).includes(platformRaw)
    ? platformRaw
    : "";
  const subjectRaw = first(sp, "subject").trim();
  const subject = UUID_RE.test(subjectRaw) ? subjectRaw : "";
  const pageRaw = Math.floor(Number(first(sp, "page")));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  // ---- Stat cards: one head-only count per status -------------------------
  const countResults = await Promise.all(
    REPORT_STATUSES.map((s) =>
      supabase
        .from("question_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", s),
    ),
  );
  const countByStatus = new Map<string, number>(
    REPORT_STATUSES.map((s, i) => [s, countResults[i]?.count ?? 0]),
  );

  // ---- The list -----------------------------------------------------------
  // The subject filter uses an INNER embed rather than the resolve-ids-then-
  // .in() pattern used elsewhere: that pattern caps at 2000 ids, and against a
  // ~2900-question bank it would silently truncate the result.
  let listQuery = supabase
    .from("question_reports")
    .select(
      "id, question_id, status, message, locale, platform, created_at, reporter_profile_id, olympiad_package_id, questions!inner(id, subject_id, question_translations(locale, body))",
      { count: "exact" },
    );
  if (status) listQuery = listQuery.eq("status", status);
  if (platform) listQuery = listQuery.eq("platform", platform);
  if (subject) listQuery = listQuery.eq("questions.subject_id", subject);
  const escaped = sanitizeSearchTerm(q);
  if (escaped) listQuery = listQuery.ilike("message", `%${escaped}%`);

  const { data: rows, count } = await listQuery
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const list = (rows ?? []) as any[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ---- Labels for the ids in the visible page only ------------------------
  const reporterIds = Array.from(
    new Set(
      list
        .map((r) => r.reporter_profile_id)
        .filter((v: unknown): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  const packageIds = Array.from(
    new Set(
      list
        .map((r) => r.olympiad_package_id)
        .filter((v: unknown): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  const [profilesRes, packagesRes, subjectsRes] = await Promise.all([
    reporterIds.length > 0
      ? supabase.from("profiles").select("id, display_name, email").in("id", reporterIds)
      : Promise.resolve({ data: [] as any[] }),
    packageIds.length > 0
      ? supabase
          .from("olympiad_packages")
          .select("id, code, olympiad_package_translations(locale, title)")
          .in("id", packageIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("subjects").select("id, name").order("name"),
  ]);
  const profileById = new Map<string, any>(
    ((profilesRes.data ?? []) as any[]).map((p) => [p.id, p]),
  );
  const packageById = new Map<string, any>(
    ((packagesRes.data ?? []) as any[]).map((p) => [p.id, p]),
  );

  const reporterLabel = (id: string | null): string =>
    id ? (profileById.get(id)?.display_name || profileById.get(id)?.email || id) : "—";
  const packageLabel = (id: string | null): string => {
    if (!id) return "—";
    const p = packageById.get(id);
    if (!p) return "—";
    return (
      (p.olympiad_package_translations ?? []).find((x: any) => x.locale === "az")?.title ??
      p.code ??
      "—"
    );
  };
  const questionPreview = (r: any): string => {
    const trs = (r.questions?.question_translations ?? []) as any[];
    const body: string = trs.find((x) => x.locale === "az")?.body ?? trs[0]?.body ?? "";
    return body.trim() === "" ? "—" : body.slice(0, PREVIEW_CAP);
  };

  const href = (over: Record<string, string | null>): string => {
    const base: Record<string, string> = {
      q,
      status,
      platform,
      subject,
      page: page > 1 ? String(page) : "",
    };
    const merged = { ...base, ...over };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/question-reports?${qs}` : "/question-reports";
  };

  const hasFilters = Boolean(q || status || platform || subject);

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("nav.questionReports")}</h1>
            <p className="muted">{t("qrep.subtitle")}</p>
          </div>
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
            <span className="qstat-label">{t(`qrep.status.${s}`)}</span>
          </Link>
        ))}
      </div>

      <FilterBar
        basePath="/question-reports"
        search={{ value: q, placeholder: t("qrep.filter.search") }}
        selects={[
          {
            key: "status",
            value: status,
            allLabel: t("qrep.filter.allStatuses"),
            ariaLabel: t("qrep.field.status"),
            options: REPORT_STATUSES.map((s) => ({
              value: s,
              label: t(`qrep.status.${s}`),
            })),
          },
          {
            key: "subject",
            value: subject,
            allLabel: t("qrep.filter.allSubjects"),
            ariaLabel: t("qrep.field.subject"),
            options: (((subjectsRes.data ?? []) as any[]) || []).map((s) => ({
              value: s.id as string,
              label: s.name as string,
            })),
          },
          {
            key: "platform",
            value: platform,
            allLabel: t("qrep.filter.allPlatforms"),
            ariaLabel: t("qrep.field.platform"),
            options: PLATFORMS.map((p) => ({
              value: p,
              label: t(`qrep.platform.${p}`),
            })),
          },
        ]}
        clearLabel={t("qfilter.clear")}
      />

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t("qrep.field.question")}</th>
                <th>{t("qrep.field.message")}</th>
                <th>{t("qrep.field.reporter")}</th>
                <th>{t("qrep.field.olympiad")}</th>
                <th>{t("qrep.field.locale")}</th>
                <th>{t("qrep.field.platform")}</th>
                <th>{t("qrep.field.created")}</th>
                <th>{t("qrep.field.status")}</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    {hasFilters ? t("flt.noMatches") : t("qrep.none")}
                  </td>
                </tr>
              )}
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="qrep-cell-clip">{questionPreview(r)}</td>
                  {/* Truncated with CSS, never by slicing markup — and rendered
                      as a text child, so report text is escaped by React. */}
                  <td className="qrep-cell-clip">{r.message}</td>
                  <td className="muted">
                    {r.reporter_profile_id ? (
                      reporterLabel(r.reporter_profile_id)
                    ) : (
                      <span className="muted">{t("qrep.deletedAccount")}</span>
                    )}
                  </td>
                  <td className="muted">{packageLabel(r.olympiad_package_id)}</td>
                  <td className="mono nowrap">{r.locale}</td>
                  <td className="nowrap">{t(`qrep.platform.${r.platform}`)}</td>
                  <td className="muted nowrap">
                    {formatBakuDateTime(r.created_at, locale)}
                  </td>
                  <td className="nowrap">
                    <span className={`pill ${reportStatusPill(r.status)}`}>
                      {t(`qrep.status.${r.status}`)}
                    </span>
                  </td>
                  <td className="row-actions nowrap">
                    <Link href={`/question-reports/${r.id}`}>{t("qrep.open")}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="qpager">
        <span className="qpager-info muted">
          {t("qrep.showing")
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
