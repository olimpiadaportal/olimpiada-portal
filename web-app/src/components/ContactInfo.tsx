import { getT } from "@/i18n/server";
import { getPublicSiteSettings } from "@/lib/flags";

// Shared contact body — the equal-height info card (address / support email /
// optional phone / short note) + the keyless Google-Maps embed. Rendered by
// the public /contact page and the in-app parent (/help/contact) and student
// (/child/help/contact) pages from this single source. Support
// email/phone/WhatsApp/address come from admin Settings
// (contact.support_email/phone/whatsapp/address); email falls back to a
// placeholder until configured; phone, WhatsApp and address render only when
// set. The map always renders: it prefers the admin-configured precise pin
// (contact.support_map_query — a "lat,lng" pair or place query), else the
// admin-configured address, else a hardcoded Government House of Baku
// fallback — a contact page without a map looks broken.
const MAPS_FALLBACK_QUERY = "Government House of Baku, Baku, Azerbaijan";

export async function ContactInfo() {
  const t = await getT();
  const site = await getPublicSiteSettings();
  const email = site.supportEmail || "info@olimpiada.example";
  // wa.me accepts digits only — the row renders only when the admin-configured
  // value actually contains a dialable number.
  const whatsappDigits = site.whatsapp.replace(/\D/g, "");
  const mapQuery = site.mapQuery || site.address || MAPS_FALLBACK_QUERY;
  const mapsEmbed = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;

  return (
    <div className="contact-equal">
      <div className="info-card">
        {site.address && (
          <>
            <h2>{t("contact.address")}</h2>
            <p>{site.address}</p>
          </>
        )}

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

        {whatsappDigits && (
          <>
            <h2>{t("contact.whatsappLabel")}</h2>
            <p>
              <a
                href={`https://wa.me/${whatsappDigits}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {site.whatsapp}
              </a>
            </p>
          </>
        )}

        <p className="muted">{t("contact.shortNote")}</p>
      </div>

      <div className="map-frame">
        <iframe
          src={mapsEmbed}
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
