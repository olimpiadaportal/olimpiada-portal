import { requireAdmin } from "@/lib/admin/guards";
import { hasServiceRole } from "@/lib/supabase/admin";
import { listFreeAccessIntervals } from "@/lib/admin/freeAccess";
import {
  FreeAccessManager,
  type FreeAccessStrings,
} from "@/components/FreeAccessManager";
import { getT, getLocale } from "@/i18n/server";

// Admin-only Free-Access module: schedule/list/deactivate per-parent or
// per-child free-access windows. All strings are resolved here (via getT) and
// passed to the client — the client never calls t().
export default async function FreeAccessPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const serviceReady = hasServiceRole();

  const intervals = serviceReady ? await listFreeAccessIntervals() : [];

  const strings: FreeAccessStrings = {
    createHeading: t("freeAccess.createHeading"),
    listHeading: t("freeAccess.listHeading"),
    parent: t("freeAccess.parent"),
    parentSearch: t("freeAccess.parentSearch"),
    parentSearching: t("freeAccess.parentSearching"),
    parentEmpty: t("freeAccess.parentEmpty"),
    parentChildren: t("freeAccess.parentChildren"),
    parentClear: t("freeAccess.parentClear"),
    child: t("freeAccess.child"),
    childAll: t("freeAccess.childAll"),
    childLoading: t("freeAccess.childLoading"),
    start: t("freeAccess.start"),
    end: t("freeAccess.end"),
    note: t("freeAccess.note"),
    notePlaceholder: t("freeAccess.notePlaceholder"),
    create: t("freeAccess.create"),
    creating: t("freeAccess.creating"),
    created: t("freeAccess.created"),
    scheduleAnother: t("freeAccess.scheduleAnother"),
    deactivate: t("freeAccess.deactivate"),
    deactivateConfirm: t("freeAccess.deactivateConfirm"),
    endBeforeStart: t("freeAccess.endBeforeStart"),
    target: t("freeAccess.target"),
    window: t("freeAccess.window"),
    statusHeading: t("freeAccess.statusHeading"),
    statusActive: t("freeAccess.status.active"),
    statusScheduled: t("freeAccess.status.scheduled"),
    statusExpired: t("freeAccess.status.expired"),
    statusInactive: t("freeAccess.status.inactive"),
    none: t("freeAccess.none"),
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("freeAccess.title")}</h1>
        <p className="muted">{t("freeAccess.subtitle")}</p>
      </div>

      {!serviceReady ? (
        <section className="card">
          <p className="form-error">{t("accounts.reset.noServiceKey")}</p>
        </section>
      ) : (
        <FreeAccessManager
          intervals={intervals}
          locale={locale}
          strings={strings}
        />
      )}
    </div>
  );
}
