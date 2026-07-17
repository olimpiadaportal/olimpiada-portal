import { requireParent } from "@/lib/auth/session";
import { AboutContent } from "@/components/AboutContent";

// In-app (parent-shell) About. Lives at /help/about to avoid colliding with the
// public /about route. Renders the exact same shared about2.* body as the
// public page (admin Site-Content overrides apply through getT inside it).
export default async function ParentAboutPage() {
  await requireParent();
  return <AboutContent />;
}
