import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { listCities } from "@/lib/admin/cities";
import { CityForm } from "@/components/CityForm";
import { CityDeleteButton } from "@/components/CityDeleteButton";
import { getT, getLocale } from "@/i18n/server";
import { localStrings } from "./labels";

export default async function CitiesPage() {
  await requireAdmin();
  const t = await getT();
  const lt = localStrings(await getLocale());
  const cities = await listCities();

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.cities")}</h1>
        <p className="muted">{lt("cities.subtitle")}</p>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{lt("cities.addHeading")}</h3>
        <CityForm
          labels={{
            name: lt("cities.cityName"),
            countryCode: lt("cities.countryCode"),
            status: t("field.status"),
            statusActive: t("status.active"),
            statusInactive: t("status.inactive"),
            submit: t("action.create"),
            saving: t("manage.saving"),
            errMissingName: lt("cities.errMissingName"),
            errDuplicate: lt("cities.errDuplicate"),
            errGeneric: lt("common.errGeneric"),
          }}
        />
      </section>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>{lt("cities.cityName")}</th>
              <th>{lt("cities.countryCode")}</th>
              <th>{t("field.status")}</th>
              <th>{lt("cities.schoolCount")}</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {cities.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {lt("cities.noRecords")}
                </td>
              </tr>
            )}
            {cities.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.country_code}</td>
                <td>{t(`status.${c.status}`)}</td>
                <td>{c.school_count}</td>
                <td className="row-actions">
                  <Link href={`/cities/${c.id}/edit`}>{t("action.edit")}</Link>
                  <CityDeleteButton
                    id={c.id}
                    label={t("action.delete")}
                    confirmText={t("action.confirmDelete")}
                    errInUse={lt("cities.errInUse")}
                    errGeneric={lt("common.errGeneric")}
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
