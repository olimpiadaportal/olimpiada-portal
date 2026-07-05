import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getT, getLocale } from "@/i18n/server";
import { listStickerThemes } from "@/lib/admin/stickers";
import { StickerThemeForm } from "@/components/StickerThemeForm";
import { StickerThemeToggle } from "@/components/StickerThemeToggle";
import { localStrings } from "./labels";

// Character Stickers — Admin-only (Content Managers are excluded, like
// News/Olympiad). Themes list + create form; per-theme detail at /stickers/[id].
// MIN_IMAGES mirrors the DB guard threshold (migration 028) — keep in sync.
const MIN_IMAGES = 6;

export default async function StickersPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const lt = localStrings(locale);
  const { rows, loadError } = await listStickerThemes();

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lt("stkadm.title")}</h1>
        <p className="muted">{lt("stkadm.subtitle")}</p>
      </div>

      {loadError && <p className="form-error">{lt("stkadm.listError")}</p>}

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{lt("stkadm.addHeading")}</h3>
        <StickerThemeForm
          strings={{
            name: lt("stkadm.themeName"),
            hint: lt("stkadm.nameHint"),
            submit: t("action.create"),
            saving: t("manage.saving"),
            saved: lt("stkadm.saved"),
            errName: lt("stkadm.errName"),
            errDuplicate: lt("stkadm.errDuplicate"),
            errGeneric: t("err.server"),
          }}
        />
      </section>

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{lt("stkadm.themeName")}</th>
                <th>{lt("stkadm.images")}</th>
                <th>{t("field.status")}</th>
                <th>{lt("stkadm.created")}</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {lt("stkadm.none")}
                  </td>
                </tr>
              )}
              {rows.map((theme) => (
                <tr key={theme.id}>
                  <td>
                    <Link href={`/stickers/${theme.id}`}>{theme.name}</Link>
                  </td>
                  <td className="nowrap">
                    <span
                      className={`pill ${
                        theme.imageCount >= MIN_IMAGES ? "pill-ok" : "pill-warn"
                      }`}
                    >
                      {theme.imageCount}
                    </span>
                    {theme.imageCount < MIN_IMAGES && (
                      <span className="stkadm-count-hint">
                        {lt("stkadm.needsMore", {
                          n: MIN_IMAGES - theme.imageCount,
                        })}
                      </span>
                    )}
                  </td>
                  <td className="nowrap">
                    <span
                      className={`pill ${theme.isEnabled ? "pill-ok" : "pill-muted"}`}
                    >
                      {theme.isEnabled
                        ? lt("stkadm.enabled")
                        : lt("stkadm.disabled")}
                    </span>
                  </td>
                  <td className="nowrap">
                    {dateFmt.format(new Date(theme.createdAt))}
                  </td>
                  <td className="row-actions nowrap">
                    <Link href={`/stickers/${theme.id}`}>
                      {lt("stkadm.open")}
                    </Link>
                    <StickerThemeToggle
                      id={theme.id}
                      enabled={theme.isEnabled}
                      strings={{
                        enable: lt("stkadm.enable"),
                        disable: lt("stkadm.disable"),
                        saving: t("manage.saving"),
                        errNeedsFive: lt("stkadm.errNeedsFive"),
                        errGeneric: t("err.server"),
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
