import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { sanitizeSearchTerm } from "@/lib/admin/search";
import { ChildPasswordReset } from "@/components/ChildPasswordReset";
import { AccountEditForm } from "@/components/AccountEditForm";
import { AccountDeleteButton } from "@/components/AccountDeleteButton";
import { getT } from "@/i18n/server";
import { FilterBar } from "@/components/FilterBar";

// Round 10 (F5) — debounced account search applied at QUERY level over the
// useful identifiers: parent display name OR email (profiles .or(ilike));
// sanitized by the shared sanitizeSearchTerm (M18).
// H10 — server-side pagination: 20 parents per page (.range + exact count),
// prev/next links preserve the search param.
const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

function accessPill(s: string): string {
  if (s === "active") return "pill-ok";
  if (s === "trialing") return "pill-muted";
  if (s === "locked" || s === "expired") return "pill-warn";
  return "pill-muted";
}

function parentStatusPill(s: string): string {
  if (s === "active") return "pill-ok";
  if (s === "suspended") return "pill-warn";
  return "pill-muted";
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const t = await getT();
  const supabase = await createClient();
  const serviceReady = hasServiceRole();
  const sp = await searchParams;

  // ---- Validated search + page params ---------------------------------------
  const q = firstParam(sp, "q").trim().slice(0, 200);
  const pageRaw = Math.floor(Number(firstParam(sp, "page")));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Parents = profiles holding the 'parent' role — resolved in ONE query via
  // an inner join through profile_roles. profile_roles has two FKs to profiles
  // (profile_id + assigned_by), so the embed names the profile_id FK explicitly
  // to stay unambiguous. H10: the list is paginated server-side (.range +
  // exact count) instead of loading every parent.
  let qb = supabase
    .from("profiles")
    .select(
      "id, display_name, email, status, profile_roles!profile_id!inner(roles!inner(code))",
      { count: "exact" },
    )
    .eq("profile_roles.roles.code", "parent");
  // M18: shared sanitizer (strips or()-grammar chars, escapes LIKE wildcards).
  const escaped = sanitizeSearchTerm(q);
  if (escaped) {
    qb = qb.or(`display_name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
  }
  const { data: parentRows, count: parentCount } = await qb
    .order("display_name")
    .range(from, to);
  const parentProfiles: any[] = parentRows ?? [];
  const totalParents = parentCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalParents / PAGE_SIZE));

  // Prev/next links preserve the search param; page 1 keeps a clean URL.
  const pageHref = (p: number): string => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/accounts?${qs}` : "/accounts";
  };

  // Children only for the parents actually shown (RLS lets admins read all
  // students) — keeps the search cheap when it narrows the list.
  const shownParentIds = parentProfiles.map((p: any) => p.id);
  let children: any[] = [];
  if (shownParentIds.length) {
    const { data } = await supabase
      .from("students")
      .select(
        "profile_id, created_by_parent_profile_id, first_name, last_name, child_unique_id, access_status",
      )
      .in("created_by_parent_profile_id", shownParentIds)
      .order("created_at", { ascending: true });
    children = data ?? [];
  }

  const childrenByParent = new Map<string, any[]>();
  for (const c of children) {
    const pid = c.created_by_parent_profile_id;
    const list = childrenByParent.get(pid) ?? [];
    list.push(c);
    childrenByParent.set(pid, list);
  }

  const resetStrings = {
    reset: t("accounts.reset.open"),
    cancel: t("action.cancel"),
    newPassword: t("accounts.reset.newPassword"),
    hint: t("accounts.reset.hint"),
    submit: t("accounts.reset.submit"),
    submitting: t("accounts.reset.submitting"),
    done: t("accounts.reset.done"),
    showPassword: t("auth.showPassword"),
    hidePassword: t("auth.hidePassword"),
  };

  const editStrings = {
    open: t("accounts.edit.open"),
    title: t("accounts.edit.title"),
    displayName: t("accounts.edit.displayName"),
    status: t("accounts.edit.status"),
    statusActive: t("accounts.status.active"),
    statusSuspended: t("accounts.status.suspended"),
    submit: t("accounts.edit.submit"),
    submitting: t("accounts.edit.submitting"),
    done: t("accounts.edit.done"),
    cancel: t("action.cancel"),
  };

  const deleteParentStrings = {
    open: t("accounts.delete.parent"),
    title: t("accounts.delete.parentTitle"),
    warn: t("accounts.delete.parentWarn"),
    confirmLabel: t("accounts.delete.confirmLabel"),
    confirmWord: t("accounts.delete.confirmWord"),
    confirmHint: t("accounts.delete.confirmHint"),
    submit: t("accounts.delete.submit"),
    submitting: t("accounts.delete.submitting"),
    done: t("accounts.delete.done"),
    cancel: t("action.cancel"),
  };

  const deleteChildStrings = {
    open: t("accounts.delete.child"),
    title: t("accounts.delete.childTitle"),
    warn: t("accounts.delete.childWarn"),
    confirmLabel: t("accounts.delete.confirmLabel"),
    confirmWord: t("accounts.delete.confirmWord"),
    confirmHint: t("accounts.delete.confirmHint"),
    submit: t("accounts.delete.submit"),
    submitting: t("accounts.delete.submitting"),
    done: t("accounts.delete.done"),
    cancel: t("action.cancel"),
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.accounts")}</h1>
        <p className="muted">{t("accounts.subtitle")}</p>
      </div>

      {!serviceReady && (
        <section className="card" style={{ marginBottom: 16 }}>
          <p className="form-error">{t("accounts.reset.noServiceKey")}</p>
        </section>
      )}

      {/* Round 12.1: account CREATION moved to the Free Access page (the
          admin's one-stop create-parent → create-child → schedule flow).
          This section stays list/manage-only: search, edit, delete, reset. */}
      <FilterBar
        basePath="/accounts"
        search={{ value: q, placeholder: t("flt.accountSearch") }}
        clearLabel={t("qfilter.clear")}
      />

      {parentProfiles.length === 0 && (
        <section className="card">
          <p className="muted">{q ? t("flt.noMatches") : t("accounts.none")}</p>
        </section>
      )}

      {parentProfiles.map((p) => {
        const kids = childrenByParent.get(p.id) ?? [];
        const status = p.status ?? "pending";
        return (
          <section className="card" key={p.id} style={{ marginBottom: 16 }}>
            <div className="head-row">
              <div>
                <h3>{p.display_name || t("accounts.parentNoName")}</h3>
                <p className="muted">{p.email ?? "—"}</p>
              </div>
              <div className="row-actions">
                <span className={`pill ${parentStatusPill(status)}`}>
                  {t(`accounts.status.${status}`)}
                </span>
                <span className="pill pill-muted">
                  {t("accounts.childCount")}: {kids.length}
                </span>
              </div>
            </div>

            {serviceReady && (
              <div className="row-actions" style={{ marginTop: 8 }}>
                <AccountEditForm
                  parentProfileId={p.id}
                  currentName={p.display_name ?? ""}
                  currentStatus={status}
                  strings={editStrings}
                />
                <AccountDeleteButton
                  kind="parent"
                  targetId={p.id}
                  strings={deleteParentStrings}
                />
              </div>
            )}

            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("accounts.childName")}</th>
                    <th>{t("accounts.childId")}</th>
                    <th>{t("accounts.accessStatus")}</th>
                    <th aria-label="actions" />
                  </tr>
                </thead>
                <tbody>
                  {kids.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        {t("accounts.noChildren")}
                      </td>
                    </tr>
                  )}
                  {kids.map((c) => {
                    const name =
                      [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
                    return (
                      <tr key={c.profile_id}>
                        <td>{name}</td>
                        <td className="muted nowrap">{c.child_unique_id ?? "—"}</td>
                        <td className="nowrap">
                          <span className={`pill ${accessPill(c.access_status)}`}>
                            {t(`accounts.access.${c.access_status}`)}
                          </span>
                        </td>
                        <td className="row-actions nowrap">
                          <ChildPasswordReset
                            studentProfileId={c.profile_id}
                            strings={resetStrings}
                          />
                          {serviceReady && (
                            <AccountDeleteButton
                              kind="child"
                              targetId={c.profile_id}
                              strings={deleteChildStrings}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {/* H10: footer pager — server-rendered prev/next preserving the search. */}
      {totalParents > PAGE_SIZE && (
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
