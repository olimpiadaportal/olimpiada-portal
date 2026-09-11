import type { T } from "@/i18n/server";

// "Creating a subject here does not create an Apple product."
//
// WHY THIS IS A CARD AND NOT A TOOLTIP. iOS sells subject access through
// StoreKit: 21 live non-renewing products (7 subjects × 3 durations), approved
// 2026-09-09, mapped to (subject, interval) by public.iap_products. Nothing in
// this panel creates an App Store product, and nothing in the iOS app reports a
// missing one — mobile-app/src/features/iap/catalog.ts intersects the ACTIVE
// rows of that table with StoreKit's own priced products and offers only what
// appears in both, so a subject with no product is simply not in the purchase
// list. No error, no log, no admin-side signal. An admin who creates a subject,
// prices it, publishes it and then checks an iPhone will conclude the platform
// is broken.
//
// The web rail (ABB, AZN) and Android are unaffected, which is the half that
// makes the omission plausible: the subject really does go on sale, just not
// everywhere. That asymmetry is the whole content of this notice.
//
// Rendered from the create form (where the decision is made) and from the edit
// page of any subject that is still missing products (where it can be acted
// on). Built from the panel's existing warn-card classes — no new component
// vocabulary for one message.
export function IapNotice({ t }: { t: T }) {
  return (
    <section className="card setting-card-warn">
      <div className="card-head">
        <h3>{t("subj.iapHeading")}</h3>
      </div>
      <p className="section-intro">{t("subj.iapNotice")}</p>
      <p className="hint">{t("subj.iapSteps")}</p>
    </section>
  );
}
