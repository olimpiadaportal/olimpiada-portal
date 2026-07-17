import { AboutContent } from "@/components/AboutContent";

// Public marketing "About us". The whole about2.* body (hero, story blocks,
// value grid) lives in the shared <AboutContent/> so the in-app parent and
// student versions render the exact same CMS-overridable content.
export default function AboutPage() {
  return <AboutContent />;
}
