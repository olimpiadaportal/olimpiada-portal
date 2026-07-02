import { getT } from "@/i18n/server";
import { getPublicSiteSettings } from "@/lib/flags";

const MAPS_EMBED =
  "https://www.google.com/maps?q=Government%20House%20of%20Baku%2C%20Baku%2C%20Azerbaijan&output=embed";

export default async function ContactPage() {
  const t = await getT();
  // Support email/phone come from admin Settings (contact.support_email/phone).
  // Email falls back to a placeholder until configured; phone renders only when set.
  const site = await getPublicSiteSettings();
  const email = site.supportEmail || "info@olimpiada.example";

  return (
    <section className="prose">
      <h1>{t("contact.title")}</h1>
      <p className="lead">{t("contact.lead")}</p>

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
    </section>
  );
}
