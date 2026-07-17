import { requireChild } from "@/lib/auth/session";
import { AboutContent } from "@/components/AboutContent";

// Arena-shell About (student). Same shared about2.* body as the public and
// parent pages; the `.arena .about2` token remap in globals.css keeps the
// cards/hero on the arena palette (dark, light and every light palette).
export default async function ChildAboutPage() {
  await requireChild();
  return <AboutContent />;
}
