import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { hasServiceRole } from "@/lib/supabase/admin";
import { CreateUserForm } from "@/components/CreateUserForm";
import { getT } from "@/i18n/server";

export default async function UsersPage() {
  await requireAdmin();
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
      .select("id, email, status, display_name")
      .in("id", profileIds);
    profileList = data ?? [];
  }
  const profileById = new Map<string, any>(profileList.map((p) => [p.id, p]));

  type U = { id: string; email: string; name: string; status: string; roles: string[] };
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
        status: p.status,
        roles: [],
      } as U);
    cur.roles.push(
      code === "administrator"
        ? t("role.administrator")
        : t("role.contentManager"),
    );
    map.set(p.id, cur);
  }
  const users = Array.from(map.values());

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
          }}
          roles={[
            { value: "administrator", label: t("role.administrator") },
            { value: "content_manager", label: t("role.contentManager") },
          ]}
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
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  {t("users.none")}
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name}</td>
                <td>{u.roles.join(", ")}</td>
                <td>{u.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
