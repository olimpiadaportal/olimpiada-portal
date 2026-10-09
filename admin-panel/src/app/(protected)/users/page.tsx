import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { CreateUserForm } from "@/components/CreateUserForm";
import { PanelUserActions } from "@/components/PanelUserActions";
import { getT } from "@/i18n/server";

export default async function UsersPage() {
  // Administrators only (the Super Admin is one). Content Managers are sent to
  // /unauthorized here, and every action this page calls re-checks the role.
  const ctx = await requireAdmin();
  const t = await getT();
  const supabase = await createClient();

  // Panel users = profiles holding administrator / content_manager roles.
  // NOTE: profile_roles has two FKs to profiles (profile_id, assigned_by), so an
  // embedded `profiles(...)` select is ambiguous and returns nothing. We resolve
  // it explicitly with separate queries instead. (Admin RLS returns all rows.)
  const { data: roleRows } = await supabase
    .from("roles")
    .select("id, code")
    .in("code", ["administrator", "content_manager"]);
  const roleCodeById = new Map<string, string>(
    (roleRows ?? []).map((r: any) => [r.id, r.code]),
  );
  const roleIds = Array.from(roleCodeById.keys());

  let prRows: any[] = [];
  if (roleIds.length) {
    const { data } = await supabase
      .from("profile_roles")
      .select("profile_id, role_id")
      .in("role_id", roleIds);
    prRows = data ?? [];
  }

  const profileIds = Array.from(new Set(prRows.map((r) => r.profile_id)));
  let profileList: any[] = [];
  if (profileIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, status, display_name, is_super_admin")
      .in("id", profileIds);
    profileList = data ?? [];
  }
  const profileById = new Map<string, any>(profileList.map((p) => [p.id, p]));

  type U = {
    id: string;
    email: string;
    name: string;
    rawName: string;
    status: string;
    roles: string[];
    roleCode: string;
    isSuperAdmin: boolean;
  };
  const map = new Map<string, U>();
  for (const pr of prRows) {
    const p = profileById.get(pr.profile_id);
    if (!p) continue;
    const code = roleCodeById.get(pr.role_id);
    if (!code) continue;
    const cur =
      map.get(p.id) ??
      ({
        id: p.id,
        email: p.email ?? "—",
        name: p.display_name ?? "—",
        rawName: p.display_name ?? "",
        status: p.status,
        roles: [],
        roleCode: code,
        isSuperAdmin: p.is_super_admin === true,
      } as U);
    cur.roles.push(
      code === "administrator"
        ? t("role.administrator")
        : t("role.contentManager"),
    );
    // An administrator role wins for the editor's default selection.
    if (code === "administrator") cur.roleCode = "administrator";
    map.set(p.id, cur);
  }
  // Super Admin first, then administrators, then content managers.
  const rank = (u: U) => (u.isSuperAdmin ? 0 : u.roleCode === "administrator" ? 1 : 2);
  const users = Array.from(map.values()).sort((a, b) => rank(a) - rank(b) || (a.email < b.email ? -1 : a.email > b.email ? 1 : 0) /* emails: a machine-key sort, deliberately locale-free */);
  const roleOptions = [
    { value: "administrator", label: t("role.administrator") },
    { value: "content_manager", label: t("role.contentManager") },
  ];
  const actionStrings = {
    edit: t("users.edit"),
    delete: t("users.delete"),
    editTitle: t("users.editTitle"),
    name: t("users.name"),
    role: t("users.role"),
    save: t("users.save"),
    saving: t("users.saving"),
    cancel: t("users.cancel"),
    updated: t("users.updated"),
    deleteTitle: t("users.deleteTitle"),
    deleteBody: t("users.deleteBody"),
    deleteConfirm: t("users.deleteConfirm"),
    deleting: t("users.deleting"),
    close: t("modal.close"),
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("users.title")}</h1>
        <p className="muted">{t("users.subtitle")}</p>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{t("users.addTitle")}</h3>
        {!hasServiceRole() && (
          <p className="form-error">{t("users.noServiceKey")}</p>
        )}
        <CreateUserForm
          strings={{
            email: t("users.email"),
            name: t("users.name"),
            role: t("users.role"),
            password: t("users.password"),
            passwordHint: t("users.passwordHint"),
            submit: t("users.create"),
            submitting: t("users.creating"),
            created: t("users.created"),
            select: t("manage.select"),
            showPassword: t("auth.showPassword"),
            hidePassword: t("auth.hidePassword"),
          }}
          roles={roleOptions}
        />
      </section>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>{t("users.email")}</th>
              <th>{t("users.name")}</th>
              <th>{t("users.role")}</th>
              <th>{t("users.status")}</th>
              <th>{t("users.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {t("users.none")}
                </td>
              </tr>
            )}
            {users.map((u) => {
              const isSelf = u.id === ctx.profileId;
              const locked = u.isSuperAdmin ? "super" : isSelf ? "self" : null;
              const lockedReason = u.isSuperAdmin ? t("users.err.superAdmin") : isSelf ? t("users.err.self") : undefined;
              return (
                <tr
                  key={u.id}
                  className={u.isSuperAdmin ? "user-row-locked" : undefined}
                  title={u.isSuperAdmin ? lockedReason : undefined}
                >
                  <td>
                    {u.email}
                    {isSelf && <span className="user-you"> · {t("users.you")}</span>}
                  </td>
                  <td>{u.name}</td>
                  <td>
                    {u.isSuperAdmin && <span className="role-pill-super">{t("users.superAdmin")}</span>}
                    {u.roles.join(", ")}
                  </td>
                  <td>{u.status}</td>
                  <td>
                    <PanelUserActions
                      profileId={u.id}
                      email={u.email}
                      name={u.rawName}
                      role={u.roleCode}
                      roles={roleOptions}
                      locked={locked}
                      lockedReason={lockedReason}
                      strings={actionStrings}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
