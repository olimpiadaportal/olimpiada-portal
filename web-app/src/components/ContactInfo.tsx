import { getT } from "@/i18n/server";
import { getPublicSiteSettings } from "@/lib/flags";

// Shared contact body — the equal-height info card (address / support email /
// optional phone / short note) + the keyless Google-Maps embed of the
// Government House of Baku. Rendered by the public /contact page and the
// in-app parent (/help/contact) and student (/child/help/contact) pages from
// this single source. Support email/phone come from admin Settings
// (contact.support_email/phone); email falls back to a placeholder until
// configured; phone renders only when set.
const MAPS_EMBED =
  "https://www.google.com/maps?q=Government%20House%20of%20Baku%2C%20Baku%2C%20Azerbaijan&output=embed";

export async function ContactInfo() {
  const t = await getT();
  const site = await getPublicSiteSettings();
  const email = site.supportEmail || "info@olimpiada.example";

  return (
    <div className="contact-equal">
      <div className="info-card">
        <h2>{t("contact.address")}</h2>
        <p>{t("contact.addressValue")}</p>

        <h2>{t("contact.emailLabel")}</h2>
        <p>
          <a href={`mailto:${email}`}>{email}</a>
        </p>

        {site.supportPhone && (
          <>
            <h2>{t("contact.phoneLabel")}</h2>
            <p>
              <a href={`tel:${site.supportPhone.replace(/\s+/g, "")}`}>
                {site.supportPhone}
              </a>
            </p>
          </>
        )}

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
  );
}
