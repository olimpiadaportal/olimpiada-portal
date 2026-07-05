import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guards";
import { getT, getLocale } from "@/i18n/server";
import { getStickerTheme } from "@/lib/admin/stickers";
import { StickerThemeControls } from "@/components/StickerThemeControls";
import { StickerThemeToggle } from "@/components/StickerThemeToggle";
import { StickerUploader } from "@/components/StickerUploader";
import { StickerImageDeleteButton } from "@/components/StickerImageDeleteButton";
import { localStrings } from "../labels";

// Sticker theme detail — Admin-only: rename, enable toggle (min-6 hint),
// typed-confirm delete, sticker grid (transparency-friendly backdrop) and the
// multi-file uploader. MIN_IMAGES mirrors the DB guard (migration 028).
const MIN_IMAGES = 6;

export default async function StickerThemePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const t = await getT();
  const locale = await getLocale();
  const lt = localStrings(locale);

  const theme = await getStickerTheme(id);
  if (!theme) notFound();

  const count = theme.images.length;
  const progress = Math.min(count, MIN_IMAGES);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{theme.name}</h1>
        <p className="muted">
          <Link href="/stickers">
            ← {t("manage.back")} · {lt("stkadm.title")}
          </Link>
        </p>
      </div>

      <div className="form-grid" style={{ marginBottom: 20 }}>
        <section className="card">
          <div className="row-actions" style={{ justifyContent: "flex-start" }}>
            <span
              className={`pill ${theme.isEnabled ? "pill-ok" : "pill-muted"}`}
            >
              {theme.isEnabled ? lt("stkadm.enabled") : lt("stkadm.disabled")}
            </span>
            <span className="stkadm-progress muted">
              {lt("stkadm.enableHint", { n: progress })}
            </span>
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
          </div>

          <StickerThemeControls
            id={theme.id}
            name={theme.name}
            strings={{
              renameLabel: lt("stkadm.themeName"),
              save: t("action.save"),
              saving: t("manage.saving"),
              saved: lt("stkadm.saved"),
              errName: lt("stkadm.errName"),
              errDuplicate: lt("stkadm.errDuplicate"),
              errGeneric: t("err.server"),
              deleteHeading: lt("stkadm.deleteHeading"),
              deleteOpen: lt("stkadm.deleteHeading"),
              deleteWarn: lt("stkadm.deleteWarn"),
              confirmLabel: lt("stkadm.deleteConfirmLabel"),
              confirmHint: lt("stkadm.deleteConfirmHint", {
                name: theme.name,
              }),
              deleteSubmit: t("action.delete"),
              deleting: lt("stkadm.deleting"),
              errConfirm: lt("stkadm.errConfirm"),
              cancel: t("action.cancel"),
            }}
          />
        </section>

        <section className="card">
          <h3>{lt("stkadm.uploadHeading")}</h3>
          <StickerUploader
            themeId={theme.id}
            strings={{
              button: lt("stkadm.uploadButton"),
              uploading: lt("stkadm.uploading"),
              hint: lt("stkadm.uploadHint"),
              transparencyHint: lt("stkadm.transparencyHint"),
              done: lt("stkadm.fileDone"),
              errType: lt("stkadm.fileErrType"),
              errSize: lt("stkadm.fileErrSize"),
              errUpload: lt("stkadm.fileErrUpload"),
              errGeneric: t("err.server"),
            }}
          />
        </section>
      </div>

      <section className="card">
        <h3>
          {lt("stkadm.images")} · {count}
        </h3>
        {count === 0 ? (
          <p className="muted">{lt("stkadm.noImages")}</p>
        ) : (
          <div className="stkadm-grid">
            {theme.images.map((img) => (
              <figure key={img.id} className="stkadm-thumb-wrap">
                {img.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.url} alt="" className="stkadm-thumb" />
                ) : (
                  <span className="stkadm-thumb" aria-hidden="true" />
                )}
                <StickerImageDeleteButton
                  id={img.id}
                  label={t("action.delete")}
                  confirmText={t("action.confirmDelete")}
                  errKeepFive={lt("stkadm.errKeepFive")}
                  errGeneric={t("err.server")}
                />
              </figure>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
