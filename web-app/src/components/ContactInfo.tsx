import { getT } from "@/i18n/server";
import { getPublicSiteSettings } from "@/lib/flags";

// Shared contact body — the equal-height info card + the keyless Google-Maps
// embed. Rendered by the public /contact page and the in-app parent
// (/help/contact) and student (/child/help/contact) pages from this single
// source.
//
// The card is organised by PURPOSE, not by field: a general block
// (contact.info_email — questions, suggestions, feedback) and a technical block
// (contact.support_email + the optional phone/WhatsApp rows), then the optional
// address. Both addresses come from admin Settings and fall back to the REAL
// mailboxes below rather than to a placeholder domain: a blanked setting, a
// missing row, an unconfigured service-role key and an unreachable database all
// still have to render an address a visitor can actually write to. Phone,
// WhatsApp and address keep the "empty hides the row" behaviour — they have no
// safe invented value.
//
// Migration 117 withdrew the "Report a bug" dialog this card used to mount:
// the platform has ONE reports section (question reports, triaged in the admin
// panel) and no report sends outbound mail. These mailto links are now the only
// inbound channel here, which is exactly why the fallback addresses above are
// real ones.
//
// The map always renders: it prefers the admin-configured precise pin
// (contact.support_map_query — a "lat,lng" pair or place query), else the
// admin-configured address, else a hardcoded Government House of Baku
// fallback — a contact page without a map looks broken.
const MAPS_FALLBACK_QUERY = "Government House of Baku, Baku, Azerbaijan";
const DEFAULT_INFO_EMAIL = "info@olympiq.ai";
const DEFAULT_SUPPORT_EMAIL = "support@olympiq.ai";

export async function ContactInfo() {
  const t = await getT();
  const site = await getPublicSiteSettings();
  const infoEmail = site.infoEmail || DEFAULT_INFO_EMAIL;
  const supportEmail = site.supportEmail || DEFAULT_SUPPORT_EMAIL;
  // wa.me accepts digits only — the row renders only when the admin-configured
  // value actually contains a dialable number.
  const whatsappDigits = site.whatsapp.replace(/\D/g, "");
  const mapQuery = site.mapQuery || site.address || MAPS_FALLBACK_QUERY;
  const mapsEmbed = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;

  return (
    <div className="contact-equal">
      <div className="info-card">
        <div className="contact-purposes">
          <section className="contact-purpose">
            <h2>{t("contact.generalTitle")}</h2>
            <p>{t("contact.generalDesc")}</p>
            <p className="contact-mail">
              {/* The scheme is a hardcoded prefix, so an admin-typed setting can
                  never turn this into a javascript:/data: href. */}
              <a href={`mailto:${infoEmail}`}>{infoEmail}</a>
            </p>
          </section>

          <section className="contact-purpose">
            <h2>{t("contact.supportTitle")}</h2>
            <p>{t("contact.supportDesc")}</p>
            <p className="contact-mail">
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
            </p>

            {site.supportPhone && (
              <div className="contact-row">
                <span className="contact-label">{t("contact.phoneLabel")}</span>
                <span className="contact-value">
                  <a href={`tel:${site.supportPhone.replace(/\s+/g, "")}`}>
                    {site.supportPhone}
                  </a>
                </span>
              </div>
            )}

            {whatsappDigits && (
              <div className="contact-row">
                <span className="contact-label">{t("contact.whatsappLabel")}</span>
                <span className="contact-value">
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {site.whatsapp}
                  </a>
                </span>
              </div>
            )}
          </section>

          {site.address && (
            <section className="contact-purpose">
              <h2>{t("contact.address")}</h2>
              <p>{site.address}</p>
            </section>
          )}
        </div>

        <p className="contact-note">{t("contact.responseTime")}</p>
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
