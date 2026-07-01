import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { ChildPasswordReset } from "@/components/ChildPasswordReset";
import { AccountCreateForm } from "@/components/AccountCreateForm";
import { AccountEditForm } from "@/components/AccountEditForm";
import { AccountDeleteButton } from "@/components/AccountDeleteButton";
import { getT } from "@/i18n/server";

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

export default async function AccountsPage() {
  await requireAdmin();
  const t = await getT();
  const supabase = await createClient();
  const serviceReady = hasServiceRole();

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

  // Parent profile details.
  let parentProfiles: any[] = [];
  if (parentProfileIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, email, status")
      .in("id", parentProfileIds);
    parentProfiles = data ?? [];
  }

  // Children for those parents (RLS lets admins read all students).
  let children: any[] = [];
  if (parentProfileIds.length) {
    const { data } = await supabase
      .from("students")
      .select(
        "profile_id, created_by_parent_profile_id, first_name, last_name, child_unique_id, access_status",
      )
      .in("created_by_parent_profile_id", parentProfileIds)
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
        </section>
      )}

      {parentProfiles.length === 0 && (
        <section className="card">
          <p className="muted">{t("accounts.none")}</p>
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

            <table className="table" style={{ marginTop: 12 }}>
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
                      <td className="muted">{c.child_unique_id ?? "—"}</td>
                      <td>
                        <span className={`pill ${accessPill(c.access_status)}`}>
                          {t(`accounts.access.${c.access_status}`)}
                        </span>
                      </td>
                      <td className="row-actions">
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
          </section>
        );
      })}
    </div>
  );
}
