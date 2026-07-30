import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/PrivacyPolicy";

// Public privacy policy. This is the URL the App Store Connect "Privacy Policy
// URL" field and the Google Play Data-safety section point at, so it must stay
// reachable WITHOUT a session and must never move. The body is the shared
// <PrivacyPolicy/> (same component as /help/privacy and /child/help/privacy).
export const metadata: Metadata = {
  title: "Privacy Policy — OlympIQ",
  description:
    "How OlympIQ handles parent and child data: what is collected, who can see it, how long it is kept and how to delete an account.",
};

export default function PrivacyPage() {
  return <PrivacyPolicy />;
}
