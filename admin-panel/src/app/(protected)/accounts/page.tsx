import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { ChildPasswordReset } from "@/components/ChildPasswordReset";
import { AccountCreateForm } from "@/components/AccountCreateForm";
import {
  CreateChildForm,
  type GradeOption,
  type ParentOption,
  type SubjectOption,
} from "@/components/CreateChildForm";
import { AccountEditForm } from "@/components/AccountEditForm";
import { AccountDeleteButton } from "@/components/AccountDeleteButton";
import { getT } from "@/i18n/server";
import { FilterBar } from "@/components/FilterBar";

// Round 10 (F5) — debounced account search applied at QUERY level over the
// useful identifiers: parent display name OR email (profiles .or(ilike)).
// The q param is trimmed, capped and LIKE-escaped; characters that PostgREST's
// or() grammar treats specially (comma/parens/quotes) are stripped so raw user
// input can never alter the filter expression.
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

  // ---- Validated search param ---------------------------------------------
  const q = firstParam(sp, "q").trim().slice(0, 200);

  // Parents = profiles holding the 'parent' role (resolved explicitly, since
  // profile_roles has two FKs to profiles and an embedded select is ambiguous).
  const { data: parentRole } = await supabase
    .from("roles")
    .select("id")
    .eq("code", "parent")
    .maybeSingle();

  let parentProfileIds: string[] = [];
  if (parentRole?.id) {
    const { data: prRows } = await supabase
      .from("profile_roles")
      .select("profile_id")
      .eq("role_id", parentRole.id);
    parentProfileIds = Array.from(
      new Set((prRows ?? []).map((r: any) => r.profile_id)),
    );
  }

  // Parent profile details — the search is applied HERE, at query level.
  let parentProfiles: any[] = [];
  if (parentProfileIds.length) {
    let qb = supabase
      .from("profiles")
      .select("id, display_name, email, status")
      .in("id", parentProfileIds);
    if (q) {
      // Neutralize PostgREST or()-grammar characters, then escape LIKE
      // wildcards so the term is matched literally.
      const safe = q.replace(/[,()"']/g, " ").trim();
      const escaped = safe.replace(/[\\%_]/g, (m) => `\\${m}`);
      if (escaped) {
        qb = qb.or(
          `display_name.ilike.%${escaped}%,email.ilike.%${escaped}%`,
        );
      }
    }
    const { data } = await qb.order("display_name");
    parentProfiles = data ?? [];
  }

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

  // ---- Create-child form data (Round 11, admin payment bypass) --------------
  // The parent PICKER needs the FULL parent list (independent of the page's
  // search filter). Grades feed the optional grade select; subjects are limited
  // to those with ACTIVE pricing per interval (mirrors the grant RPC's check).
  let childParents: ParentOption[] = [];
  let childGrades: GradeOption[] = [];
  let childSubjects: SubjectOption[] = [];
  if (serviceReady) {
    const [allParentsRes, gradesRes, pricingRes] = await Promise.all([
      parentProfileIds.length
        ? supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", parentProfileIds)
            .order("display_name")
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("grades").select("id, name, level").order("level"),
      supabase
        .from("subjects_pricing")
        .select("subject_id, interval, subjects(name)")
        .eq("status", "active"),
    ]);
    childParents = ((allParentsRes.data ?? []) as any[]).map((p) => ({
      id: p.id,
      label: [p.display_name, p.email].filter(Boolean).join(" — ") || p.id,
    }));
    childGrades = ((gradesRes.data ?? []) as any[]).map((g) => ({
      id: g.id,
      name: g.name,
    }));
    const bySubject = new Map<string, { name: string; intervals: Set<string> }>();
    for (const r of (pricingRes.data ?? []) as any[]) {
      const name = r.subjects?.name ?? "—";
      const entry = bySubject.get(r.subject_id) ?? {
        name,
        intervals: new Set<string>(),
      };
      entry.intervals.add(r.interval);
      bySubject.set(r.subject_id, entry);
    }
    childSubjects = Array.from(bySubject, ([id, s]) => ({
      id,
      name: s.name,
      intervals: Array.from(s.intervals),
    })).sort((a, b) => a.name.localeCompare(b.name));
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

  const childCreateStrings = {
    open: t("accounts.child.create.open"),
    title: t("accounts.child.create.title"),
    intro: t("accounts.child.create.intro"),
    parent: t("accounts.child.create.parent"),
    parentFilter: t("accounts.child.create.parentFilter"),
    parentChoose: t("accounts.child.create.parentChoose"),
    firstName: t("accounts.create.firstName"),
    lastName: t("accounts.create.lastName"),
    password: t("accounts.create.password"),
    passwordHint: t("accounts.create.passwordHint"),
    grade: t("accounts.child.create.grade"),
    gradeNone: t("accounts.child.create.gradeNone"),
    grant: t("accounts.child.create.grant"),
    grantHelp: t("accounts.child.create.grantHelp"),
    interval: t("accounts.child.create.interval"),
    intervalWeek: t("accounts.child.interval.week"),
    intervalMonth: t("accounts.child.interval.month"),
    intervalYear: t("accounts.child.interval.year"),
    subjects: t("accounts.child.create.subjects"),
    subjectsNone: t("accounts.child.create.subjectsNone"),
    days: t("accounts.child.create.days"),
    daysHelp: t("accounts.child.create.daysHelp"),
    submit: t("accounts.child.create.submit"),
    submitting: t("accounts.child.create.submitting"),
    done: t("accounts.child.create.done"),
    idLabel: t("accounts.child.create.idLabel"),
    idPending: t("accounts.child.create.idPending"),
    bypassNote: t("accounts.child.create.bypassNote"),
    close: t("accounts.child.create.close"),
    cancel: t("action.cancel"),
    showPassword: t("auth.showPassword"),
    hidePassword: t("auth.hidePassword"),
  };

  const createStrings = {
    open: t("accounts.create.open"),
    title: t("accounts.create.title"),
    firstName: t("accounts.create.firstName"),
    lastName: t("accounts.create.lastName"),
    email: t("accounts.create.email"),
    password: t("accounts.create.password"),
    passwordHint: t("accounts.create.passwordHint"),
    submit: t("accounts.create.submit"),
    submitting: t("accounts.create.submitting"),
    done: t("accounts.create.done"),
    cancel: t("action.cancel"),
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

      {serviceReady && (
        <section className="card" style={{ marginBottom: 16 }}>
          <AccountCreateForm strings={createStrings} />
          <div style={{ marginTop: 12 }}>
            <CreateChildForm
              parents={childParents}
              grades={childGrades}
              subjects={childSubjects}
              strings={childCreateStrings}
            />
          </div>
        </section>
      )}

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
    </div>
  );
}
