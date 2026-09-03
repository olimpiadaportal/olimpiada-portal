import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { listIapCatalogue, type IapProductRow } from "@/lib/admin/iap";
import { IapToggle, type IapToggleStrings } from "./IapToggle";
import { IapCreateForm, type IapCreateStrings } from "./IapCreateForm";

// App Store products (public.iap_products) — ADMINISTRATOR ONLY, never Content
// Manager: this is a payment module, and CLAUDE.md keeps Content Managers out
// of every one of them. requireAdmin() is the boundary; the nav entry hiding it
// is cosmetic.
//
// WHAT AN ADMIN COMES HERE TO DO. Migration 164 seeded 21 iOS subject products
// with active = false, which means the iOS app is currently selling NOTHING.
// Flipping `active` is the go-live step, and until this screen existed it
// required raw SQL against production. The banner at the top states the current
// posture in plain words for exactly that reason: "nothing is turned on" is a
// deliberate state, not a broken screen, and an admin has to be able to tell
// the difference at a glance.
//
// Reads go through the request-scoped client — iap_products_select returns
// every row to an admin (inactive ones included, which is the whole point) — so
// no service-role client is involved here. All writes live in lib/admin/iap.ts.
export default async function IapProductsPage() {
  await requireAdmin();
  const t = await getT();

  const { rows, subjects, packages, loadFailed } = await listIapCatalogue();

  // The action returns i18n KEYS, never prose (project law: no raw server text
  // reaches a user). The client components cannot call getT(), so the whole
  // error vocabulary is resolved here and handed down.
  const ERROR_KEYS = [
    "iap.err.server",
    "iap.err.notFound",
    "iap.err.iosOnly",
    "iap.err.targetMissing",
    "iap.err.targetArchived",
    "iap.err.gradeMissing",
    "iap.err.duplicateActive",
    "iap.err.duplicateId",
    "iap.err.scope",
    "iap.err.target",
    "iap.err.slug",
    "iap.err.interval",
  ] as const;
  const errors: Record<string, string> = {};
  for (const k of ERROR_KEYS) errors[k] = t(k);

  const toggleStrings: IapToggleStrings = {
    activate: t("iap.action.activate"),
    deactivate: t("iap.action.deactivate"),
    working: t("pend.saving"),
    title: t("iap.confirm.title"),
    consequenceOn: t("iap.confirm.on"),
    consequenceOff: t("iap.confirm.off"),
    ack: t("iap.confirm.ack"),
    confirmOn: t("iap.confirm.yesOn"),
    confirmOff: t("iap.confirm.yesOff"),
    cancel: t("action.cancel"),
    close: t("modal.close"),
    blockedTitle: t("iap.blockedTitle"),
    errors,
    errFallback: t("iap.err.server"),
  };

  const createStrings: IapCreateStrings = {
    heading: t("iap.create.heading"),
    intro: t("iap.create.intro"),
    scope: t("iap.create.scope"),
    scopeSubject: t("iap.group.subject"),
    scopePackage: t("iap.group.package"),
    target: t("iap.create.target"),
    targetPlaceholder: t("iap.create.targetPlaceholder"),
    interval: t("iap.col.interval"),
    intervalWeek: t("iap.interval.week"),
    intervalMonth: t("iap.interval.month"),
    intervalYear: t("iap.interval.year"),
    slug: t("iap.create.slug"),
    slugHint: t("iap.create.slugHint"),
    preview: t("iap.create.preview"),
    platformNote: t("iap.androidNote"),
    inactiveNote: t("iap.create.inactiveNote"),
    submit: t("iap.create.submit"),
    working: t("pend.creating"),
    saved: t("iap.create.saved"),
    noTargets: t("iap.create.noTargets"),
    errors,
    errFallback: t("iap.err.server"),
  };

  const intervalLabel = (iv: string | null) =>
    iv ? t(`iap.interval.${iv}`) : "—";

  // What the product actually sells, in one sentence — the reason this screen
  // resolves names at all. A grid of uuids tells an admin nothing about which
  // row is safe to turn on.
  const grantsOf = (row: IapProductRow): string => {
    const name = row.targetName ?? t("iap.target.unknown");
    if (row.scope === "subject") return `${name} · ${intervalLabel(row.interval)}`;
    return row.gradeLabel ? `${name} · ${row.gradeLabel}` : name;
  };

  const problemOf = (row: IapProductRow): string | null => {
    if (!row.problem) return null;
    if (row.problem === "targetArchived") {
      // Name the actual status: "archived" and "unpublished" are different
      // problems with different fixes, and the admin needs to know which.
      const status = row.targetStatus ? t(`status.${row.targetStatus}`) : "";
      return `${t("iap.problem.targetArchived")} (${status})`;
    }
    return t(`iap.problem.${row.problem}`);
  };

  const activeCount = rows.filter((r) => r.active).length;
  const subjectRows = rows.filter((r) => r.scope === "subject");
  const packageRows = rows.filter((r) => r.scope === "olympiad_package");

  const renderTable = (group: IapProductRow[], heading: string) => (
    <section className="card-stack">
      <div className="card-head">
        <h3>{heading}</h3>
        <span className="muted">
          {t("iap.groupCount")
            .replace("{active}", String(group.filter((r) => r.active).length))
            .replace("{total}", String(group.length))}
        </span>
      </div>
      {group.length === 0 ? (
        <div className="card">
          <p className="muted">{t("iap.groupEmpty")}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t("iap.col.productId")}</th>
                <th>{t("iap.col.grants")}</th>
                <th>{t("iap.col.platform")}</th>
                <th>{t("iap.col.state")}</th>
                <th>{t("iap.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              {group.map((row) => {
                const problem = problemOf(row);
                return (
                  <tr key={row.id}>
                    <td>
                      <code>{row.product_id}</code>
                    </td>
                    <td>
                      {grantsOf(row)}
                      {/* An ACTIVE row whose target died is the worst state on
                          this screen — the app is taking money for something
                          the platform will not serve — so it is called out on
                          the row rather than only when somebody clicks. */}
                      {problem && row.active ? (
                        <span
                          className="form-error"
                          style={{ display: "block", marginTop: 4 }}
                        >
                          {problem}
                        </span>
                      ) : null}
                    </td>
                    <td className="nowrap">{row.platform}</td>
                    <td className="nowrap">
                      <span
                        className={`pill pill-sm ${
                          row.active ? "pill-ok" : "pill-muted"
                        }`}
                      >
                        {row.active ? t("iap.state.on") : t("iap.state.off")}
                      </span>
                    </td>
                    <td>
                      <IapToggle
                        id={row.id}
                        productId={row.product_id}
                        grants={grantsOf(row)}
                        active={row.active}
                        blockedReason={problem}
                        strings={toggleStrings}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("iap.title")}</h1>
        <p className="muted">{t("iap.subtitle")}</p>
      </div>

      {loadFailed ? (
        <div className="card">
          <p className="form-error" role="alert">
            {t("iap.loadError")}
          </p>
        </div>
      ) : null}

      {/* THE STATE-OF-THE-STORE BANNER. Zero active products is the state this
          platform ships in, and an admin who does not know that reads the whole
          screen as broken. It is amber rather than red because it is correct
          until App Store Connect approval lands — and it must not be dismissible,
          because it stops being true only when somebody activates a row. */}
      {activeCount === 0 ? (
        <div className="card setting-card-warn" role="status">
          <h3>{t("iap.banner.none.title")}</h3>
          <p className="muted">{t("iap.banner.none.body")}</p>
        </div>
      ) : (
        <div className="card setting-card-info" role="status">
          <h3>
            {t("iap.banner.live.title").replace("{n}", String(activeCount))}
          </h3>
          <p className="muted">{t("iap.banner.live.body")}</p>
        </div>
      )}

      <p className="hint">{t("iap.androidNote")}</p>
      <p className="hint">{t("iap.priceNote")}</p>

      {rows.length === 0 && !loadFailed ? (
        <div className="card">
          <p className="muted">{t("iap.empty")}</p>
        </div>
      ) : (
        <>
          {renderTable(subjectRows, t("iap.group.subject"))}
          {renderTable(packageRows, t("iap.group.package"))}
        </>
      )}

      <IapCreateForm
        subjects={subjects}
        packages={packages}
        strings={createStrings}
      />
    </div>
  );
}
