import { requireChild } from "@/lib/auth/session";
import { PrivacyPolicy } from "@/components/PrivacyPolicy";

// Arena-shell privacy policy (student). Same shared body as the public and
// parent pages; the `.arena .pp` token remap in globals.css keeps the cards and
// tables on the arena palette (dark, light and every light palette).
export default async function ChildPrivacyPage() {
  await requireChild();
  return <PrivacyPolicy />;
}
