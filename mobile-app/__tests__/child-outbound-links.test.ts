// Google Play Families, 2026-09-22. The Play target-audience declaration
// includes children, so the app must not lead a child out to content nobody
// here moderates — and the Contact screen, reachable from the account sheet in
// a STUDENT session, rendered the admin-configured social links, a WhatsApp
// hand-off and a maps/directions deep link. Two taps from a child login to
// TikTok.
//
// Three things are pinned here:
//   1. the role predicate itself (pure),
//   2. that the Contact screen actually applies it to all three surfaces,
//   3. that the two OTHER ways out of the app — the /gallery developer route
//      and the admin-configured store URL — cannot be walked either.
//
// Parts 2 and 3a read source text on purpose: jest here runs `*.test.ts` with
// no renderer, and the property that matters is structural ("this JSX sits
// behind that condition"), which is exactly what a rendering test of one
// fixture state would fail to prove.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { isStoreUrl, outboundLinksAllowed } from "@/lib/outboundLinks";

const SRC = resolve(__dirname, "..", "src");

/** Source with comments removed — a rule must be in the CODE, not in prose. */
function code(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// 1 — who may be handed off
// ---------------------------------------------------------------------------

describe("outboundLinksAllowed", () => {
  it("never hands off a CHILD session", () => {
    expect(outboundLinksAllowed("signedIn", "student")).toBe(false);
  });

  it("keeps every support channel for a PARENT — they are an adult", () => {
    // Deleting the links for everyone would trade a child-safety problem for a
    // support one; the parent rail is why this is a gate and not a cut.
    expect(outboundLinksAllowed("signedIn", "parent")).toBe(true);
  });

  it("leaves the signed-out marketing surface alone", () => {
    // No session, no child to protect: this is the audience the website serves,
    // and it is the state a store reviewer opens the app in.
    expect(outboundLinksAllowed("signedOut", null)).toBe(true);
    expect(outboundLinksAllowed("signedOut", "student")).toBe(true);
  });

  it("fails CLOSED on a role it has not resolved", () => {
    // "unknown" is what a failed has_role RPC looks like, and "restoring" is the
    // window before the answer arrives. Guessing "adult" there costs a policy
    // violation; guessing "child" costs a parent one row on one screen.
    expect(outboundLinksAllowed("signedIn", "unknown")).toBe(false);
    expect(outboundLinksAllowed("signedIn", null)).toBe(false);
    expect(outboundLinksAllowed("restoring", "parent")).toBe(false);
    expect(outboundLinksAllowed("restoring", null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2 — the Contact screen applies it
// ---------------------------------------------------------------------------

describe("(public)/contact.tsx gates every way out of the app", () => {
  const contact = code("app/(public)/contact.tsx");

  it("reads the role from the session store, like the /pricing bounce", () => {
    expect(contact).toContain("useAuthStore((s) => s.status)");
    expect(contact).toContain("useAuthStore((s) => s.role)");
    expect(contact).toContain("const canLeaveApp = outboundLinksAllowed(authStatus, role);");
  });

  it("builds NO social rows for a child session", () => {
    // Gated at the LIST, not only at the JSX: an empty list cannot be rendered
    // by a future edit that forgets the surrounding condition.
    expect(contact).toMatch(/const socials = canLeaveApp\s*\?\s*SOCIALS\.map/);
  });

  it("hides the WhatsApp hand-off from a child session", () => {
    expect(contact).toContain("{canLeaveApp && whatsapp && whatsappDigits ? (");
    // The ungated form this replaced.
    expect(contact).not.toContain("{whatsapp && whatsappDigits ? (");
  });

  it("does not mount the map, or its directions button, for a child session", () => {
    expect(contact).toMatch(/\{canLeaveApp \? \(\s*<View[\s\S]{0,80}?<ContactMap/);
  });

  it("leaves the address on screen but not pressable for a child session", () => {
    expect(contact).toContain(
      "onPress={canLeaveApp ? () => void openDirections() : undefined}",
    );
  });

  it("refuses the maps hand-off inside the opener too", () => {
    expect(contact).toMatch(
      /const openDirections = async \(\) => \{\s*if \(!canLeaveApp\) return;/,
    );
  });

  it("still gives EVERY session the operator's own inboxes", () => {
    // The fix gates unmoderated third parties, not being contactable: mailto:
    // and tel: reach this operator, and a child who needs help keeps them.
    expect(contact).toContain("{infoEmail ? (");
    expect(contact).toContain("{email ? (");
    expect(contact).toContain("{phone ? (");
  });
});

// ---------------------------------------------------------------------------
// 3a — the developer route
// ---------------------------------------------------------------------------

describe("the design gallery is not reachable in a release build", () => {
  const gallery = code("app/gallery.tsx");

  it("the route's default export is the guard, not the screen", () => {
    expect(gallery).toContain("export default function GalleryRoute() {");
    expect(gallery).not.toContain("export default function Gallery()");
  });

  it("a release bundle redirects instead of rendering the gallery", () => {
    // expo-router registers every file under src/app, so removing the link into
    // this screen never removed the ROUTE: olympiq://gallery still resolved.
    expect(gallery).toMatch(
      /if \(!__DEV__\) \{[\s\S]*?return <GroupRedirect href=\{home\} \/>;/,
    );
    // The redirect has to come FIRST — a guard after the screen is no guard.
    expect(gallery.indexOf("if (!__DEV__)")).toBeLessThan(
      gallery.indexOf("return <Gallery />;"),
    );
  });

  it("redirects with GroupRedirect, never a plain <Redirect>", () => {
    // A replace onto a root group that is already in the stack mints a second
    // copy of it, and back then pops between two identical Home screens.
    expect(gallery).toContain('from "@/lib/TabRedirect"');
    expect(gallery).not.toMatch(/import \{[^}]*\bRedirect\b[^}]*\} from "expo-router"/);
  });

  it("no OTHER unreviewed top-level route file has appeared next to it", () => {
    // Anything dropped directly into src/app becomes a deep-linkable production
    // surface the moment it is saved. This list is the review gate; extend it
    // deliberately, having decided the new route is meant for users.
    const top = readdirSync(resolve(SRC, "app"))
      .filter((f) => f.endsWith(".tsx"))
      .sort();
    expect(top).toEqual(["_layout.tsx", "gallery.tsx", "index.tsx"]);
  });
});

// ---------------------------------------------------------------------------
// 3b — the admin-configured store URL
// ---------------------------------------------------------------------------

describe("isStoreUrl", () => {
  it("accepts the real store destinations", () => {
    expect(isStoreUrl("https://play.google.com/store/apps/details?id=ai.olympiq.app")).toBe(
      true,
    );
    // The closed-testing opt-in link is a legitimate store URL — which is why
    // the path is not constrained, only the host.
    expect(isStoreUrl("https://play.google.com/apps/testing/ai.olympiq.app")).toBe(true);
    expect(isStoreUrl("https://apps.apple.com/az/app/olympiq/id1234567890")).toBe(true);
    expect(isStoreUrl("https://itunes.apple.com/app/id1234567890")).toBe(true);
    expect(isStoreUrl("https://play.google.com")).toBe(true);
    expect(isStoreUrl("  https://play.google.com/store  ")).toBe(true);
    expect(isStoreUrl("HTTPS://PLAY.GOOGLE.COM/store/apps/details?id=x")).toBe(true);
  });

  it("REFUSES a page of prices — the violation this exists to stop", () => {
    // store_url is admin-authored and the force-update button is the only
    // control on a screen the user cannot leave. "Starts with https://" pointed
    // it at the entire web, AZN price lists included.
    expect(isStoreUrl("https://olympiq.ai/pricing")).toBe(false);
    expect(isStoreUrl("https://olympiq.ai")).toBe(false);
  });

  it("refuses lookalike and smuggled hosts", () => {
    expect(isStoreUrl("https://play.google.com.evil.test/store")).toBe(false);
    expect(isStoreUrl("https://evil.test/play.google.com")).toBe(false);
    expect(isStoreUrl("https://play.google.com@evil.test/")).toBe(false);
    expect(isStoreUrl("https://play.google.com:8443/store")).toBe(false);
    expect(isStoreUrl("https://play.google.com\t/store")).toBe(false);
    expect(isStoreUrl("https://play.google.com /store")).toBe(false);
  });

  it("refuses anything that is not an https URL at all", () => {
    expect(isStoreUrl("")).toBe(false);
    expect(isStoreUrl("   ")).toBe(false);
    expect(isStoreUrl("https://")).toBe(false);
    expect(isStoreUrl("http://play.google.com/store")).toBe(false);
    expect(isStoreUrl("market://details?id=ai.olympiq.app")).toBe(false);
    expect(isStoreUrl("javascript:alert(1)")).toBe(false);
    expect(isStoreUrl("https://play.google.com/" + "a".repeat(600))).toBe(false);
    expect(isStoreUrl(null as unknown as string)).toBe(false);
  });
});

describe("both update surfaces use the allowlist", () => {
  const screens = code("features/boot/screens.tsx");
  const prompt = code("lib/updatePrompt.ts");

  it("the blocking force-update screen hides a button it may not open", () => {
    expect(screens).toContain("const canOpenStore = isStoreUrl(storeUrl);");
  });

  it("openStore refuses one last time, at the line that calls the OS", () => {
    expect(screens).toMatch(
      /async function openStore\(url: string\): Promise<boolean> \{\s*if \(!isStoreUrl\(url\)\) return false;/,
    );
  });

  it("the skippable prompt decides on the same rule", () => {
    expect(prompt).toContain("if (!isStoreUrl(input.storeUrl)) return false;");
  });

  it("neither of them still treats bare https as a destination check", () => {
    expect(screens).not.toContain('startsWith("https://")');
    expect(prompt).not.toContain('startsWith("https://")');
  });
});
