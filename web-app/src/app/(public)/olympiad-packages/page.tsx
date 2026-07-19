import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { PublicOlympiadPackages } from "@/components/PublicOlympiadPackages";

export const metadata: Metadata = {
  title: "Olympiad Packages — OlympIQ",
  description:
    "Browse every active olympiad package available for purchase on OlympIQ.",
};

// Public "see all" overflow page for the capped landing-page band (limit={6}).
// Reachable only via that band's "see all" link — no nav entry by design; the
// capped bands on the landing page and /services stay the discovery surfaces.
// Renders the SAME <PublicOlympiadPackages/> component with no limit, so the
// full active/on-sale listing shows here.
export default async function OlympiadPackagesPage() {
  const t = await getT();
  return (
    <section className="prose">
      <h1>{t("polyPub.pageTitle")}</h1>
      <p className="lead">{t("polyPub.pageLead")}</p>
      <PublicOlympiadPackages />
    </section>
  );
}
