import { requireParent } from "@/lib/auth/session";
import { PrivacyPolicy } from "@/components/PrivacyPolicy";

// In-app (parent-shell) privacy policy. Lives at /help/privacy to avoid
// colliding with the public /privacy route, and renders the exact same shared
// body — a parent who is deleting their family account should be able to read
// what deletion does without being pushed back out to the marketing site.
export default async function ParentPrivacyPage() {
  await requireParent();
  return <PrivacyPolicy />;
}
