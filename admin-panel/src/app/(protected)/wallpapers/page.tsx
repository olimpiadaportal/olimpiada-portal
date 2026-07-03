import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { listWallpapers, setWallpaperStatus } from "@/lib/admin/wallpapers";
import { WallpaperImageUploader } from "@/components/WallpaperImageUploader";
import { WallpaperColorForm } from "@/components/WallpaperColorForm";

function statusPill(s: string): string {
  return s === "active" ? "pill-ok" : "pill-muted";
}

export default async function WallpapersPage() {
  await requireAdmin();
  const t = await getT();
  const { rows, loadError } = await listWallpapers();

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("wallpaper.title")}</h1>
        <p className="muted">{t("wallpaper.subtitle")}</p>
      </div>

      {/* R9 (T9a): a failed list load is VISIBLE — never a silent empty list. */}
      {loadError && <p className="form-error">{t("wallpaper.listError")}</p>}

      <div className="form-grid" style={{ marginBottom: 20 }}>
        <section className="card">
          <h3>{t("wallpaper.addColor")}</h3>
          <WallpaperColorForm
            strings={{
              name: t("wallpaper.name"),
              hex: t("wallpaper.hex"),
              submit: t("wallpaper.addColor"),
              saving: t("manage.saving"),
              saved: t("wallpaper.saved"),
            }}
          />
        </section>

        <section className="card">
          <h3>{t("wallpaper.addImage")}</h3>
          <WallpaperImageUploader
            strings={{
              name: t("wallpaper.name"),
              upload: t("wallpaper.upload"),
              uploading: t("manage.saving"),
              hint: t("wallpaper.imageHint"),
              saved: t("wallpaper.saved"),
            }}
          />
        </section>
      </div>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>{t("wallpaper.preview")}</th>
              <th>{t("wallpaper.name")}</th>
              <th>{t("wallpaper.kindLabel")}</th>
              <th>{t("field.status")}</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {t("wallpaper.none")}
                </td>
              </tr>
            )}
            {rows.map((w) => (
              <tr key={w.id}>
                <td>
                  {w.kind === "image" && w.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.imageUrl} alt="" className="wallpaper-swatch" />
                  ) : (
                    <span
                      className="wallpaper-swatch"
                      style={{ background: w.value ?? "#e5e7eb" }}
                      aria-hidden="true"
                    />
                  )}
                </td>
                <td>{w.name}</td>
                <td>
                  {w.kind === "image"
                    ? t("wallpaper.kind.image")
                    : t("wallpaper.kind.color")}
                </td>
                <td>
                  <span className={`pill ${statusPill(w.status)}`}>
                    {w.status === "active"
                      ? t("wallpaper.statusActive")
                      : t("wallpaper.statusArchived")}
                  </span>
                </td>
                <td className="row-actions">
                  <form action={setWallpaperStatus}>
                    <input type="hidden" name="__id" value={w.id} />
                    <input
                      type="hidden"
                      name="__status"
                      value={w.status === "active" ? "archived" : "active"}
                    />
                    <button type="submit" className="link-button">
                      {w.status === "active"
                        ? t("wallpaper.archive")
                        : t("wallpaper.activate")}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
