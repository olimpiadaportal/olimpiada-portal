import { getT, type T } from "@/i18n/server";
import { CmsProse } from "@/components/CmsProse";
import { getPublicSiteSettings } from "@/lib/flags";
import { toPolicyList, toPolicyTable } from "@/lib/policyContent";
import { PRIVACY_POLICY, isPrivacyPolicyDraft } from "@/lib/privacyPolicy";

// Shared privacy-policy body — rendered by the public /privacy page, the in-app
// parent /help/privacy page and the student /child/help/privacy page from this
// single source, exactly like <AboutContent/> and <ContactInfo/>. One body means
// the three shells can never drift apart, and the store listings can point at
// the public URL while the in-app links satisfy the "reachable inside the app"
// expectation for a product directed at children.
//
// WHERE THE CONTENT COMES FROM
//   * the words  → the `privacy.*` keys in src/i18n/messages.ts (az/en/ru),
//     which mirror docs/PRIVACY_POLICY.md — the document the owner submits to
//     App Store Connect and Google Play. Nothing is hardcoded here.
//   * the facts the code cannot know (effective date, hosting region, retention
//     periods) → src/lib/privacyPolicy.ts. Each is answered ONCE there instead
//     of three times in three languages; an unanswered one renders a neutral
//     "to be confirmed" chip rather than an invented fact.
//   * the contact details → the admin Site-Settings the Contact page already
//     uses (contact.support_email / support_phone / address), so the policy can
//     never quote an address the rest of the site has moved on from.
//
// DRAFT STATE: with no effective date set the page leads with a plain notice
// that the document is not yet in force and has not been reviewed by a lawyer.
// Filling `effectiveDate` in is the single switch that removes it.
//
// Lists and tables are stored as ONE i18n string each (one item per line;
// "cell | cell" rows for tables) and parsed by src/lib/policyContent.ts. Every
// value is rendered as a React TEXT NODE — nothing here parses HTML.

const SECTION_IDS = [
  "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13",
] as const;

type ListVariant = "dot" | "yes" | "no" | "num";

/** One item per line. `yes`/`no` draw a check/cross marker in CSS. */
function PolicyList({
  t,
  k,
  variant = "dot",
}: {
  t: T;
  k: string;
  variant?: ListVariant;
}) {
  const items = toPolicyList(t(k));
  if (items.length === 0) return null;
  const className = `pp-list pp-list-${variant}`;
  if (variant === "num") {
    return (
      <ol className={className}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    );
  }
  return (
    <ul className={className}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * "cell | cell | cell" rows, first line = header. The first cell of each row is
 * a `<th scope="row">` so the stacked ≤700px layout can use it as the row title
 * while the other cells label themselves from the `data-h` attribute.
 *
 * The explicit ARIA roles are NOT redundant here: below 700px globals.css sets
 * `display: block` on the table parts to stack them, and that strips the native
 * table semantics from the accessibility tree. Restating the roles keeps the
 * table readable to a screen reader at every width — remove the roles only if
 * the stacked layout goes away too.
 */
function PolicyTable({ t, k }: { t: T; k: string }) {
  const { head, rows } = toPolicyTable(t(k));
  if (head.length === 0 || rows.length === 0) return null;
  return (
    <div className="pp-tablewrap">
      <table className="pp-table" role="table">
        <thead role="rowgroup">
          <tr role="row">
            {head.map((cell, i) => (
              <th key={i} scope="col" role="columnheader">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row, ri) => (
            <tr key={ri} role="row">
              {row.map((cell, ci) =>
                ci === 0 ? (
                  <th key={ci} scope="row" role="rowheader">
                    {cell}
                  </th>
                ) : (
                  <td key={ci} role="cell" data-h={head[ci]}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A value the owner has not supplied yet renders as a neutral chip. */
function Val({ value, tbd }: { value: string; tbd: string }) {
  const v = value.trim();
  if (!v) return <span className="pp-tbd">{tbd}</span>;
  return <>{v}</>;
}

/** Label + value row used for the contact block and the open questions. */
function Kv({
  label,
  value,
  tbd,
  href,
}: {
  label: string;
  value: string;
  tbd: string;
  href?: string;
}) {
  const v = value.trim();
  return (
    <div className="pp-kv-row">
      <dt>{label}</dt>
      <dd>
        {v && href ? <a href={href}>{v}</a> : <Val value={value} tbd={tbd} />}
      </dd>
    </div>
  );
}

export async function PrivacyPolicy() {
  const t = await getT();
  const site = await getPublicSiteSettings();
  const draft = isPrivacyPolicyDraft();
  const tbd = t("privacy.tbd");

  const supportEmail = site.supportEmail.trim();
  // Dedicated privacy mailbox if the owner set one, otherwise the same support
  // address the Contact page publishes — never a made-up one.
  const privacyEmail = PRIVACY_POLICY.privacyEmail.trim() || supportEmail;

  return (
    <article className="pp">
      <header className="pp-hero">
        <span className="pp-eyebrow">{t("privacy.eyebrow")}</span>
        <h1>{t("privacy.title")}</h1>
        <CmsProse className="pp-lead" text={t("privacy.lead")} />
        <dl className="pp-dates">
          <div className="pp-kv-row">
            <dt>{t("privacy.effective")}</dt>
            <dd>
              <Val value={PRIVACY_POLICY.effectiveDate} tbd={tbd} />
            </dd>
          </div>
          <div className="pp-kv-row">
            <dt>{t("privacy.updated")}</dt>
            <dd>
              <Val value={PRIVACY_POLICY.lastUpdated} tbd={tbd} />
            </dd>
          </div>
        </dl>
      </header>

      {draft && (
        <aside className="pp-draft" role="note">
          <p className="pp-draft-title">{t("privacy.draft.title")}</p>
          <CmsProse text={t("privacy.draft.body")} />
        </aside>
      )}

      <nav className="pp-toc" aria-label={t("privacy.toc")}>
        <p className="pp-toc-title">{t("privacy.toc")}</p>
        <ol className="pp-toc-list">
          {SECTION_IDS.map((id) => (
            <li key={id}>
              <a href={`#privacy-${id}`}>{t(`privacy.${id}.title`)}</a>
            </li>
          ))}
        </ol>
      </nav>

      {/* 1 — the short version */}
      <section className="pp-sec" id="privacy-s1">
        <h2>{t("privacy.s1.title")}</h2>
        <h3>{t("privacy.s1.doTitle")}</h3>
        <PolicyList t={t} k="privacy.s1.do" variant="yes" />
        <h3>{t("privacy.s1.dontTitle")}</h3>
        <PolicyList t={t} k="privacy.s1.dont" variant="no" />
      </section>

      {/* 2 — who we are */}
      <section className="pp-sec" id="privacy-s2">
        <h2>{t("privacy.s2.title")}</h2>
        <dl className="pp-kv">
          <div className="pp-kv-row">
            <dt>{t("privacy.s2.product")}</dt>
            <dd>{t("privacy.s2.productValue")}</dd>
          </div>
          <div className="pp-kv-row">
            <dt>{t("privacy.s2.operator")}</dt>
            <dd>{t("privacy.s2.operatorValue")}</dd>
          </div>
          <div className="pp-kv-row">
            {/* The REGISTERED address (same value the About page's legal card
                shows), deliberately not the admin `contact.support_address` —
                that field holds the office you write to, which is a different
                Baku address, and publishing it under "Legal address" would make
                the policy state something untrue about the operator. */}
            <dt>{t("privacy.s2.address")}</dt>
            <dd>{t("privacy.s2.addressValue")}</dd>
          </div>
          <Kv
            label={t("privacy.s2.email")}
            value={supportEmail}
            tbd={tbd}
            href={supportEmail ? `mailto:${supportEmail}` : undefined}
          />
          <Kv
            label={t("privacy.s2.phone")}
            value={site.supportPhone}
            tbd={tbd}
            href={
              site.supportPhone.trim()
                ? `tel:${site.supportPhone.replace(/\s+/g, "")}`
                : undefined
            }
          />
          <Kv label={t("privacy.s2.website")} value={PRIVACY_POLICY.websiteUrl} tbd={tbd} />
          <Kv
            label={t("privacy.s2.requests")}
            value={privacyEmail}
            tbd={tbd}
            href={privacyEmail ? `mailto:${privacyEmail}` : undefined}
          />
        </dl>
        <CmsProse text={t("privacy.s2.note")} />
      </section>

      {/* 3 — family account model */}
      <section className="pp-sec" id="privacy-s3">
        <h2>{t("privacy.s3.title")}</h2>
        <CmsProse text={t("privacy.s3.intro")} />
        <PolicyList t={t} k="privacy.s3.points" />
        <CmsProse className="pp-strong" text={t("privacy.s3.result")} />
      </section>

      {/* 4 — what we collect */}
      <section className="pp-sec" id="privacy-s4">
        <h2>{t("privacy.s4.title")}</h2>

        <h3>{t("privacy.s4.parentTitle")}</h3>
        <PolicyTable t={t} k="privacy.s4.parentTable" />
        <CmsProse text={t("privacy.s4.parentNote")} />

        <h3>{t("privacy.s4.childTitle")}</h3>
        <PolicyTable t={t} k="privacy.s4.childTable" />
        <CmsProse className="pp-strong" text={t("privacy.s4.childNoDob")} />
        <CmsProse text={t("privacy.s4.childEditable")} />

        <h3>{t("privacy.s4.techTitle")}</h3>
        <PolicyTable t={t} k="privacy.s4.techTable" />
        <dl className="pp-kv">
          <div className="pp-kv-row">
            <dt>{t("privacy.s4.logRetention")}</dt>
            <dd>
              <Val value={PRIVACY_POLICY.serverLogRetention} tbd={tbd} />
            </dd>
          </div>
        </dl>

        <h3>{t("privacy.s4.deviceTitle")}</h3>
        <CmsProse text={t("privacy.s4.deviceIntro")} />
        <PolicyList t={t} k="privacy.s4.deviceList" />
        <CmsProse text={t("privacy.s4.deviceNote")} />

        <h3>{t("privacy.s4.cookiesTitle")}</h3>
        <CmsProse text={t("privacy.s4.cookiesIntro")} />
        <PolicyList t={t} k="privacy.s4.cookiesList" />
        <CmsProse className="pp-strong" text={t("privacy.s4.cookiesNote")} />
      </section>

      {/* 5 — children's data (doubles as the children's privacy policy) */}
      <section className="pp-sec" id="privacy-s5">
        <h2>{t("privacy.s5.title")}</h2>
        <CmsProse className="pp-callout" text={t("privacy.s5.callout")} />

        <h3>{t("privacy.s5.storedTitle")}</h3>
        <CmsProse text={t("privacy.s5.stored")} />
        <CmsProse className="pp-strong" text={t("privacy.s5.notCollected")} />

        <h3>{t("privacy.s5.neverTitle")}</h3>
        <PolicyList t={t} k="privacy.s5.never" variant="no" />

        <h3>{t("privacy.s5.lbTitle")}</h3>
        <CmsProse text={t("privacy.s5.lbIntro")} />
        <p className="pp-subhead">{t("privacy.s5.lb1Title")}</p>
        <CmsProse text={t("privacy.s5.lb1Intro")} />
        <PolicyTable t={t} k="privacy.s5.lb1Table" />
        <CmsProse text={t("privacy.s5.lb1Note")} />
        <p className="pp-subhead">{t("privacy.s5.lb2Title")}</p>
        <CmsProse text={t("privacy.s5.lb2Body")} />
        <CmsProse className="pp-warn" text={t("privacy.s5.lbWarn")} />
        <CmsProse text={t("privacy.s5.lbNoMedals")} />

        <h3>{t("privacy.s5.avatarTitle")}</h3>
        <PolicyTable t={t} k="privacy.s5.avatarTable" />
        <CmsProse className="pp-warn" text={t("privacy.s5.avatarWarn")} />
        <CmsProse text={t("privacy.s5.avatarUnlink")} />

        <h3>{t("privacy.s5.removeTitle")}</h3>
        <PolicyList t={t} k="privacy.s5.removeList" />
        <CmsProse text={t("privacy.s5.removeNote")} />
      </section>

      {/* 6 — how we use the data */}
      <section className="pp-sec" id="privacy-s6">
        <h2>{t("privacy.s6.title")}</h2>
        <h3>{t("privacy.s6.useTitle")}</h3>
        <PolicyList t={t} k="privacy.s6.use" variant="num" />
        <h3>{t("privacy.s6.notTitle")}</h3>
        <PolicyList t={t} k="privacy.s6.not" variant="no" />
      </section>

      {/* 7 — who we share with */}
      <section className="pp-sec" id="privacy-s7">
        <h2>{t("privacy.s7.title")}</h2>
        {/* Internal access comes FIRST: "who at the company can see my child's
            data" is the question a parent actually has, and answering it after
            eight third-party processors would bury it. */}
        <h3>{t("privacy.s7.staffTitle")}</h3>
        <CmsProse text={t("privacy.s7.staff")} />
        <CmsProse text={t("privacy.s7.intro")} />
        <PolicyTable t={t} k="privacy.s7.table" />
        <CmsProse
          text={PRIVACY_POLICY.pushLive ? t("privacy.s7.pushOn") : t("privacy.s7.pushOff")}
        />
        <CmsProse text={t("privacy.s7.otherIntro")} />
        <PolicyList t={t} k="privacy.s7.other" />
        <dl className="pp-kv">
          <div className="pp-kv-row">
            <dt>{t("privacy.s7.regionLabel")}</dt>
            <dd>
              <Val value={PRIVACY_POLICY.hostingRegion} tbd={tbd} />
            </dd>
          </div>
        </dl>
      </section>

      {/* 8 — payments */}
      <section className="pp-sec" id="privacy-s8">
        <h2>{t("privacy.s8.title")}</h2>
        <PolicyList t={t} k="privacy.s8.list" />
        <CmsProse
          className="pp-strong"
          text={
            PRIVACY_POLICY.paymentsLive
              ? t("privacy.s8.statusOn")
              : t("privacy.s8.statusOff")
          }
        />
      </section>

      {/* 9 — retention and deletion */}
      <section className="pp-sec" id="privacy-s9">
        <h2>{t("privacy.s9.title")}</h2>

        <h3>{t("privacy.s9.activeTitle")}</h3>
        <CmsProse text={t("privacy.s9.activeBody")} />
        <CmsProse text={t("privacy.s9.notifRetention")} />
        <dl className="pp-kv">
          <div className="pp-kv-row">
            <dt>{t("privacy.s9.otherRetention")}</dt>
            <dd>
              <Val value={PRIVACY_POLICY.learningDataRetention} tbd={tbd} />
            </dd>
          </div>
        </dl>

        <h3>{t("privacy.s9.howTitle")}</h3>
        <CmsProse text={t("privacy.s9.howBody")} />
        <CmsProse className="pp-strong" text={t("privacy.s9.howNote")} />

        <h3>{t("privacy.s9.erasedTitle")}</h3>
        <CmsProse text={t("privacy.s9.erasedIntro")} />
        <PolicyList t={t} k="privacy.s9.erased" />

        <h3>{t("privacy.s9.survivesTitle")}</h3>
        <CmsProse text={t("privacy.s9.survivesIntro")} />
        <PolicyTable t={t} k="privacy.s9.survivesTable" />
        <CmsProse text={t("privacy.s9.backupNote")} />
        <dl className="pp-kv">
          <div className="pp-kv-row">
            <dt>{t("privacy.s9.backupLabel")}</dt>
            <dd>
              <Val value={PRIVACY_POLICY.backupRetention} tbd={tbd} />
            </dd>
          </div>
        </dl>

        <h3>{t("privacy.s9.copyTitle")}</h3>
        <CmsProse text={t("privacy.s9.copyBody")} />
      </section>

      {/* 10 — security */}
      <section className="pp-sec" id="privacy-s10">
        <h2>{t("privacy.s10.title")}</h2>
        <CmsProse text={t("privacy.s10.intro")} />
        <PolicyList t={t} k="privacy.s10.list" variant="yes" />
        <CmsProse className="pp-warn" text={t("privacy.s10.caveat")} />
      </section>

      {/* 11 — your rights */}
      <section className="pp-sec" id="privacy-s11">
        <h2>{t("privacy.s11.title")}</h2>
        <PolicyTable t={t} k="privacy.s11.table" />
        <CmsProse text={t("privacy.s11.note")} />
      </section>

      {/* 12 — device permissions */}
      <section className="pp-sec" id="privacy-s12">
        <h2>{t("privacy.s12.title")}</h2>
        <PolicyTable t={t} k="privacy.s12.table" />
        <CmsProse className="pp-strong" text={t("privacy.s12.never")} />
      </section>

      {/* 13 — changes */}
      <section className="pp-sec" id="privacy-s13">
        <h2>{t("privacy.s13.title")}</h2>
        <CmsProse text={t("privacy.s13.body")} />
        <dl className="pp-kv">
          <div className="pp-kv-row">
            <dt>{t("privacy.s13.contact")}</dt>
            <dd>
              {privacyEmail ? (
                <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>
              ) : (
                <span className="pp-tbd">{tbd}</span>
              )}
            </dd>
          </div>
        </dl>
      </section>
    </article>
  );
}
