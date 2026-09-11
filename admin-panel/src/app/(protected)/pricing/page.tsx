import { redirect } from "next/navigation";

// 2026-09-10: Subscription Pricing merged into the Subjects screen. A subject
// and its three cycle prices are one thing to manage, and keeping them apart
// meant two screens rendering the same subjects × subjects_pricing join and two
// write paths onto the same rows.
//
// The route stays as a redirect rather than being deleted, exactly like the
// Cities / Districts / Schools pages Round 21 folded into Locations: this was a
// sidebar entry for months, so it is bookmarked, and a 404 would read as "the
// pricing feature is gone" rather than "it moved".
export default function PricingRedirect() {
  redirect("/manage/subjects");
}
