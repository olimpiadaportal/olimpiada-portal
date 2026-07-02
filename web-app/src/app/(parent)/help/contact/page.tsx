import { requireParent } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

// In-app (parent-shell) Contact. Lives at /help/contact to avoid colliding with the
// public /contact route. Reuses contact.* copy + the keyless Google-Maps embed of
// the Government House of Baku.
const MAPS_EMBED =
  "https://www.google.com/maps?q=Government%20House%20of%20Baku%2C%20Baku%2C%20Azerbaijan&output=embed";

export default async function ParentContactPage() {
  await requireParent();
  const t = await getT();

  return (
    <section className="prose help-page">
      <h1>{t("help.contactTitle")}</h1>

      <div className="contact-equal">
        <div className="info-card">
          <h2>{t("contact.address")}</h2>
          <p>{t("contact.addressValue")}</p>

          <h2>{t("contact.emailLabel")}</h2>
          <p>
            <a href="mailto:info@olimpiada.example">info@olimpiada.example</a>
          </p>

          <p className="muted">{t("contact.shortNote")}</p>
        </div>

        <div className="map-frame">
          <iframe
            src={MAPS_EMBED}
            title={t("contact.mapsCaption")}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}
