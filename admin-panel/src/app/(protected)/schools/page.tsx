import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { listSchools, listCityOptions } from "@/lib/admin/schools";
import { SchoolForm } from "@/components/SchoolForm";
import { SchoolDeleteButton } from "@/components/SchoolDeleteButton";
import { getT, getLocale } from "@/i18n/server";
import { localStrings } from "../cities/labels";

export default async function SchoolsPage() {
  await requireAdmin();
  const t = await getT();
  const lt = localStrings(await getLocale());
  const [schools, cityOptions] = await Promise.all([
    listSchools(),
    listCityOptions(),
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.schools")}</h1>
        <p className="muted">{lt("schools.subtitle")}</p>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{lt("schools.addHeading")}</h3>
        <SchoolForm
          cityOptions={cityOptions}
          labels={{
            name: lt("schools.schoolName"),
            city: lt("schools.city"),
            status: t("field.status"),
            statusActive: t("status.active"),
            statusInactive: t("status.inactive"),
            selectPlaceholder: t("manage.select"),
            submit: t("action.create"),
            saving: t("manage.saving"),
            errMissingName: lt("schools.errMissingName"),
            errMissingCity: lt("schools.errMissingCity"),
            errGeneric: lt("common.errGeneric"),
          }}
        />
      </section>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>{lt("schools.schoolName")}</th>
              <th>{lt("schools.city")}</th>
              <th>{t("field.status")}</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {schools.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  {lt("schools.noRecords")}
                </td>
              </tr>
            )}
            {schools.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.city_name}</td>
                <td>{t(`status.${s.status}`)}</td>
                <td className="row-actions">
                  <Link href={`/schools/${s.id}/edit`}>{t("action.edit")}</Link>
                  <SchoolDeleteButton
                    id={s.id}
                    label={t("action.delete")}
                    confirmText={t("action.confirmDelete")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
