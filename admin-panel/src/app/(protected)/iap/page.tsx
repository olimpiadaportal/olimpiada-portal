import { requireAdmin } from "@/lib/admin/guards";
import { getLocale, getT } from "@/i18n/server";
import { formatBakuDateTime } from "@/lib/admin/datetime";
import { listIapCatalogue, type IapProductRow } from "@/lib/admin/iap";
import { IapToggle, type IapToggleStrings } from "./IapToggle";
import { IapRefreshButton } from "./IapRefreshButton";

// App Store products (public.iap_products) — ADMINISTRATOR ONLY, never Content
// Manager: this is a payment module, and CLAUDE.md keeps Content Managers out
// of every one of them. requireAdmin() is the boundary; the nav entry hiding it
// is cosmetic.
//
// WHAT THIS SCREEN IS (owner decision, 2026-09-16). A MIRROR, not a management
// area. It shows our rows beside what App Store Connect reports about the same
// product ids, and it names every place the two disagree. It creates nothing,
// edits nothing and deletes nothing — Apple-side products are created by
// mobile-app/scripts/create-iap-products.mjs, run by hand, and an admin form
// that looked like it did the same thing was a workflow that changed nothing in
// the store while minting permanent, unsellable ids in ours.
//
// THE ONE CONTROL LEFT is the offer switch, and it is deliberate: it is the
// only code path in the repository that can set active = false, which is how a
// live iOS product is withdrawn without raw SQL against production. It is
// LOCAL — it decides what our app offers and changes nothing at Apple — and
// every string around it says so.
//
// WHY THE FRESHNESS STAMP IS NOT DECORATION. Silent divergence is the failure
// mode that produced a Guideline 3.1.1 rejection here: both halves looked fine
// separately. A mirror whose age is invisible invites exactly that mistake
// again — an admin reading a picture of Apple taken before the change they are
// checking for.
//
// Reads go through the request-scoped client — iap_products_select returns
// every row to an admin (inactive ones included, which is the whole point) — so
// no service-role client is involved here. The single write lives in
// lib/admin/iap.ts.
export default async function IapProductsPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();

  const { rows, unmapped, store, loadFailed } = await listIapCatalogue();

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
    "iap.err.storeNotConfigured",
    "iap.err.storeUnreachable",
    "iap.err.storeMissingProduct",
    "iap.err.storeIncomplete",
    "iap.err.storeRejected",
    "iap.err.storeRemoved",
    "iap.err.storeUnknownState",
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
    localOnly: t("iap.confirm.localOnly"),
    storeLabel: t("iap.col.apple"),
    ack: t("iap.confirm.ack"),
    confirmOn: t("iap.confirm.yesOn"),
    confirmOff: t("iap.confirm.yesOff"),
    cancel: t("action.cancel"),
    close: t("modal.close"),
    blockedTitle: t("iap.blockedTitle"),
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

  // The store cell, with the tone that belongs to it. Apple's raw state code is
  // never printed: "MISSING_METADATA" is a status no App Store Connect screen
  // shows, so an admin would go hunting for it (see lib/admin/appStoreConnect).
  const storeCell = (row: IapProductRow) => {
    if (!store.ok) {
      return { text: t("iap.store.unread"), tone: "pill-muted" };
    }
    if (!row.store) {
      return { text: t("iap.store.absent"), tone: "pill-warn" };
    }
    return {
      text: t(row.store.labelKey),
      tone: row.store.verdict === "sellable" ? "pill-ok" : "pill-warn",
    };
  };

  // A disagreement we are OFFERING is an error; one we are merely sitting on is
  // a fact. Both are stated on the row — the difference is how loudly.
  const SEVERE = new Set(["offeredMissing", "offeredBlocked", "offeredUnknown"]);
  const divergenceOf = (row: IapProductRow) =>
    row.divergence
      ? {
          text: t(`iap.diverge.${row.divergence}`),
          severe: SEVERE.has(row.divergence),
        }
      : null;

  const activeCount = rows.filter((r) => r.active).length;
  const severeCount = rows.filter(
    (r) => r.divergence !== null && SEVERE.has(r.divergence),
  ).length;
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
                <th>{t("iap.col.ours")}</th>
                <th>{t("iap.col.apple")}</th>
                <th>{t("iap.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              {group.map((row) => {
                const problem = problemOf(row);
                const apple = storeCell(row);
                const gap = divergenceOf(row);
                return (
                  <tr key={row.id}>
                    <td>
                      <code>{row.product_id}</code>
                    </td>
                    <td>
                      {grantsOf(row)}
                      {/* An OFFERED row whose target died is the worst state
                          this side of the screen can be in — the app is taking
                          money for something the platform will not serve — so
                          it is called out on the row rather than only when
                          somebody clicks. */}
                      {problem && row.active ? (
                        <span
                          className="form-error"
                          style={{ display: "block", marginTop: 4 }}
                        >
                          {problem}
                        </span>
                      ) : null}
                      {/* …and this is the same idea across the two halves: the
                          row states its own disagreement instead of leaving an
                          admin to compare two pills. */}
                      {gap ? (
                        <span
                          className={gap.severe ? "form-error" : "muted"}
                          style={{ display: "block", marginTop: 4 }}
                        >
                          {gap.text}
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
                    <td className="nowrap">
                      <span className={`pill pill-sm ${apple.tone}`}>
                        {apple.text}
                      </span>
                    </td>
                    <td>
                      <IapToggle
                        id={row.id}
                        productId={row.product_id}
                        grants={grantsOf(row)}
                        active={row.active}
                        storeText={store.ok ? apple.text : null}
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

      {/* WHAT THIS SCREEN CANNOT DO, said before anything else. An admin who
          believes the switch below reaches App Store Connect will stop looking
          for the real problem at exactly the wrong moment. */}
      <div className="card setting-card-info">
        <h3>{t("iap.readonly.title")}</h3>
        <p className="muted">{t("iap.readonly.body")}</p>
      </div>

      {/* The freshness line: WHEN this picture of Apple was taken, how the read
          went, and how to take a new one. */}
      <div className="card">
        <div className="head-row">
          <div>
            <p style={{ margin: 0 }}>
              {t("iap.refresh.stamp").replace(
                "{at}",
                formatBakuDateTime(store.fetchedAt, locale),
              )}
            </p>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {store.ok
                ? t("iap.store.link.ok")
                : store.problem === "storeNotConfigured"
                  ? t("iap.store.link.notConfigured")
                  : t("iap.store.link.unreachable")}
            </p>
          </div>
          <IapRefreshButton
            label={t("iap.refresh.action")}
            workingLabel={t("iap.refresh.working")}
          />
        </div>
      </div>

      {loadFailed ? (
        <div className="card">
          <p className="form-error" role="alert">
            {t("iap.loadError")}
          </p>
        </div>
      ) : null}

      {/* THE DIVERGENCE COUNT, above the tables. A disagreement discovered by
          scrolling is a disagreement nobody discovers. */}
      {severeCount > 0 ? (
        <div className="card setting-card-warn" role="alert">
          <h3>{t("iap.diverge.summary").replace("{n}", String(severeCount))}</h3>
          <p className="muted">{t("iap.diverge.summaryBody")}</p>
        </div>
      ) : null}

      {/* THE STATE-OF-THE-STORE BANNER. Zero offered products is a state this
          platform has shipped in, and an admin who does not know that reads the
          whole screen as broken. It is amber rather than red because it can be
          entirely correct — and it must not be dismissible, because it stops
          being true only when somebody switches a row on. */}
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

      {/* THE OTHER DIRECTION OF DIVERGENCE. A product Apple sells that no row
          here maps is a purchase the server cannot turn into an entitlement:
          the family is charged and granted nothing. Invisible in the tables
          above by construction, so it gets its own section — and the section
          disappears when there is nothing to say. */}
      {unmapped.length > 0 ? (
        <section className="card-stack">
          <div className="card-head">
            <h3>{t("iap.unmapped.heading")}</h3>
            <span className="muted">{unmapped.length}</span>
          </div>
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
              {t("iap.unmapped.body")}
            </p>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("iap.col.productId")}</th>
                  <th>{t("iap.unmapped.col.name")}</th>
                  <th>{t("iap.col.apple")}</th>
                </tr>
              </thead>
              <tbody>
                {unmapped.map((p) => (
                  <tr key={p.productId}>
                    <td>
                      <code>{p.productId}</code>
                    </td>
                    <td>{p.name ?? "—"}</td>
                    <td className="nowrap">
                      <span
                        className={`pill pill-sm ${
                          p.verdict === "sellable" ? "pill-ok" : "pill-warn"
                        }`}
                      >
                        {t(p.labelKey)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
