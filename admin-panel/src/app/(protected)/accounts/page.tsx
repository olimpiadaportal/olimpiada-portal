import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { sanitizeSearchTerm } from "@/lib/admin/search";
import { ChildPasswordReset } from "@/components/ChildPasswordReset";
import { AccountEditForm } from "@/components/AccountEditForm";
import { ChildEditForm } from "@/components/ChildEditForm";
import type {
  GradeOption,
  CityOption,
  SchoolOpt,
} from "@/components/CreateChildForm";
import { AccountDeleteButton } from "@/components/AccountDeleteButton";
import { getT, getLocale } from "@/i18n/server";
import { FilterBar } from "@/components/FilterBar";
import { localStrings } from "./labels";

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
  const la = localStrings(await getLocale());
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
      "id, display_name, email, phone, status, profile_roles!profile_id!inner(roles!inner(code))",
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
        "profile_id, created_by_parent_profile_id, first_name, last_name, child_unique_id, access_status, grade_id, district_id, school_id, class_grade, avatar_kind, avatar_key",
      )
      .in("created_by_parent_profile_id", shownParentIds)
      .order("created_at", { ascending: true });
    children = data ?? [];
  }

  // Grades + city→school lists feed the child editor's dropdowns (same sources
  // and ordering as the parent Add-Child flow / Free-Access page). Loaded only
  // when the service key is present (children editing needs it anyway).
  let editGrades: GradeOption[] = [];
  let editCities: CityOption[] = [];
  let editSchools: SchoolOpt[] = [];
  if (serviceReady && children.length) {
    const [gradesRes, citiesRes, schoolsRes] = await Promise.all([
      supabase.from("grades").select("id, name, level").order("level"),
      supabase
        .from("districts")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("schools")
        .select("id, name, district_id, is_private, school_number")
        .eq("status", "active")
        .order("is_private", { ascending: false })
        .order("school_number", { ascending: true, nullsFirst: false })
        .order("name"),
    ]);
    editGrades = ((gradesRes.data ?? []) as any[]).map((g) => ({
      id: g.id,
      name: g.name,
    }));
    editCities = ((citiesRes.data ?? []) as any[]).map((c) => ({
      id: c.id,
      name: c.name,
    }));
    editSchools = ((schoolsRes.data ?? []) as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      district_id: s.district_id,
      is_private: !!s.is_private,
    }));
  }

  const childrenByParent = new Map<string, any[]>();
  for (const c of children) {
    const pid = c.created_by_parent_profile_id;
    const list = childrenByParent.get(pid) ?? [];
    list.push(c);
    childrenByParent.set(pid, list);
  }

  // Child avatar (READ-ONLY): preset → the shared boy/girl art from
  // public/avatars (same PNGs as the web-app); custom photo → a plain
  // indicator pill. The photo lives in the PRIVATE child-avatars bucket and
  // the panel has no signed-URL preview path, so the object is deliberately
  // NOT fetched here. Labels are trilingual via ./labels.
  function childAvatar(c: any) {
    if (c.avatar_kind === "photo") {
      return (
        <span className="pill pill-muted">{la("accounts.avatar.photo")}</span>
      );
    }
    const key =
      c.avatar_key === "girl" ? "girl" : c.avatar_key === "boy" ? "boy" : null;
    if (!key) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/avatars/child-${key}.png`}
        alt={la(`accounts.avatar.${key}`)}
        title={la(`accounts.avatar.${key}`)}
        width={28}
        height={28}
        style={{ borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }}
      />
    );
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
    phone: t("accounts.edit.phone"),
    phoneHint: t("accounts.edit.phoneHint"),
    email: t("accounts.edit.email"),
    status: t("accounts.edit.status"),
    statusActive: t("accounts.status.active"),
    statusSuspended: t("accounts.status.suspended"),
    profileId: t("accounts.edit.profileId"),
    submit: t("accounts.edit.submit"),
    submitting: t("accounts.edit.submitting"),
    done: t("accounts.edit.done"),
    cancel: t("action.cancel"),
  };

  const childEditStrings = {
    open: t("accounts.childEdit.open"),
    title: t("accounts.childEdit.title"),
    firstName: t("accounts.create.firstName"),
    lastName: t("accounts.create.lastName"),
    grade: t("accounts.child.create.grade"),
    gradeNone: t("accounts.child.create.gradeNone"),
    city: t("accounts.child.create.city"),
    cityChoose: t("accounts.child.create.cityChoose"),
    school: t("accounts.child.create.school"),
    schoolChoose: t("accounts.child.create.schoolChoose"),
    cityFirst: t("accounts.child.create.cityFirst"),
    privateSchools: t("accounts.child.create.privateSchools"),
    publicSchools: t("accounts.child.create.publicSchools"),
    classGrade: t("accounts.childEdit.classGrade"),
    classGradeHint: t("accounts.childEdit.classGradeHint"),
    idLabel: t("accounts.childEdit.idLabel"),
    idPending: t("accounts.child.create.idPending"),
    profileId: t("accounts.childEdit.profileId"),
    readOnlyNote: t("accounts.childEdit.readOnlyNote"),
    submit: t("accounts.childEdit.submit"),
    submitting: t("accounts.childEdit.submitting"),
    done: t("accounts.childEdit.done"),
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
                  currentEmail={p.email ?? ""}
                  currentPhone={p.phone ?? ""}
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
                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            {childAvatar(c)}
                            {name}
                          </span>
                        </td>
                        <td className="muted nowrap">{c.child_unique_id ?? "—"}</td>
                        <td className="nowrap">
                          <span className={`pill ${accessPill(c.access_status)}`}>
                            {t(`accounts.access.${c.access_status}`)}
                          </span>
                        </td>
                        <td className="row-actions nowrap">
                          {serviceReady && (
                            <ChildEditForm
                              studentProfileId={c.profile_id}
                              childUniqueId={c.child_unique_id ?? null}
                              current={{
                                firstName: c.first_name ?? "",
                                lastName: c.last_name ?? "",
                                gradeId: c.grade_id ?? "",
                                districtId: c.district_id ?? "",
                                schoolId: c.school_id ?? "",
                                classGrade: c.class_grade ?? "",
                              }}
                              grades={editGrades}
                              cities={editCities}
                              schools={editSchools}
                              strings={childEditStrings}
                            />
                          )}
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
