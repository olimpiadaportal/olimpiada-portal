import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import {
  listWallpapers,
  createSolidWallpaper,
  setWallpaperStatus,
} from "@/lib/admin/wallpapers";
import { WallpaperImageUploader } from "@/components/WallpaperImageUploader";

function statusPill(s: string): string {
  return s === "active" ? "pill-ok" : "pill-muted";
}

export default async function WallpapersPage() {
  await requireAdmin();
  const t = await getT();
  const rows = await listWallpapers();

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("wallpaper.title")}</h1>
        <p className="muted">{t("wallpaper.subtitle")}</p>
      </div>

      <div className="form-grid" style={{ marginBottom: 20 }}>
        <section className="card">
          <h3>{t("wallpaper.addColor")}</h3>
          <form action={createSolidWallpaper} className="form">
            <label className="field">
              <span className="field-label">
                {t("wallpaper.name")}
                <span className="req"> *</span>
              </span>
              <input type="text" name="name" required maxLength={60} />
            </label>
            <label className="field">
              <span className="field-label">
                {t("wallpaper.hex")}
                <span className="req"> *</span>
              </span>
              <input
                type="color"
                name="hex"
                defaultValue="#3b82f6"
                required
                className="color-input"
              />
            </label>
            <button className="btn" type="submit">
              {t("wallpaper.addColor")}
            </button>
          </form>
        </section>

        <section className="card">
          <h3>{t("wallpaper.addImage")}</h3>
          <WallpaperImageUploader
            strings={{
              name: t("wallpaper.name"),
              upload: t("wallpaper.upload"),
              uploading: t("manage.saving"),
              hint: t("wallpaper.imageHint"),
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
