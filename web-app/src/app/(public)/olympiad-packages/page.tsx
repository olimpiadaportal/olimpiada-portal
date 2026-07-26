import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { getChildResolution } from "@/lib/auth/session";
import { PublicOlympiadPackages } from "@/components/PublicOlympiadPackages";

export const metadata: Metadata = {
  title: "Olympiad Packages — OlympIQ",
  description:
    "Browse every active olympiad package available for purchase on OlympIQ.",
};

// Public full olympiad listing. Round 49 removed the landing-page band; this
// page is reached from the landing hero's "Olimpiadalara bax" button and by
// direct link. Renders the SAME <PublicOlympiadPackages/> component as
// /services, so the two surfaces can never drift.
export default async function OlympiadPackagesPage() {
  // Round 51 (audit F12): signed-in children browse the arena's own olympiad
  // screen (no prices) — never the priced public listing.
  if ((await getChildResolution()).kind === "yes") redirect("/child/olympiads");

  const t = await getT();
  return (
    <section className="prose">
      <h1>{t("polyPub.pageTitle")}</h1>
      <p className="lead">{t("polyPub.pageLead")}</p>
      <PublicOlympiadPackages />
    </section>
  );
}
