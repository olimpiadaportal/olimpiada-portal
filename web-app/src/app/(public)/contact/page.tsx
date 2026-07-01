import { getT } from "@/i18n/server";

const MAPS_EMBED =
  "https://www.google.com/maps?q=Government%20House%20of%20Baku%2C%20Baku%2C%20Azerbaijan&output=embed";

export default async function ContactPage() {
  const t = await getT();
  return (
    <section className="prose">
      <h1>{t("contact.title")}</h1>
      <p className="lead">{t("contact.lead")}</p>

      <div className="contact-grid">
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
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}
