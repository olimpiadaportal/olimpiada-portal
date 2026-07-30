// The privacy policy is ONE legal document rendered by two codebases. Its words
// are shared properly — web-app/src/i18n/messages.ts is the source and
// scripts/sync-i18n.mjs copies it into messages.generated.ts — but the ten
// values the code cannot know (effective date, hosting region, retention
// periods, the push/payments switches) are build-time constants, and the mobile
// bundle cannot import from web-app/. So src/lib/privacyPolicy.ts is a MIRROR.
//
// A mirror with no guard is a promise nobody keeps: the owner fills in a
// hosting region on the web, ships, and the phone keeps telling parents the
// region is "to be confirmed" — two answers to the same regulator-facing
// question. This test reads the web file directly and fails the moment the two
// disagree, naming the fields that drifted.
//
// The web file is the SOURCE OF TRUTH; when this fails, copy web → mobile.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { PRIVACY_POLICY, isPrivacyPolicyDraft } from "@/lib/privacyPolicy";

const WEB_FILE = join(
  __dirname,
  "..",
  "..",
  "web-app",
  "src",
  "lib",
  "privacyPolicy.ts",
);

/**
 * Slice the object literal assigned to `export const PRIVACY_POLICY` and
 * evaluate it in an empty sandbox. Same string-aware brace walk that
 * scripts/sync-i18n.mjs and scripts/check-i18n-keys.mjs use on the catalogs —
 * the value is plain string and boolean literals, so nothing else is needed and
 * no web module is actually imported (it is TypeScript, and jest-expo would
 * have to transform a file outside this project's roots).
 */
function readWebStatus(): Record<string, unknown> {
  const source = readFileSync(WEB_FILE, "utf8");
  const marker = source.indexOf("export const PRIVACY_POLICY");
  if (marker === -1) {
    throw new Error(`could not find \`export const PRIVACY_POLICY\` in ${WEB_FILE}`);
  }
  const braceStart = source.indexOf("{", marker);
  let depth = 0;
  let end = -1;
  let inString: string | null = null;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i === -1) break;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`could not find the end of PRIVACY_POLICY in ${WEB_FILE}`);
  return vm.runInNewContext(
    `(${source.slice(braceStart, end + 1)})`,
    Object.create(null),
    { timeout: 5000 },
  ) as Record<string, unknown>;
}

describe("privacy-policy status mirror", () => {
  it("matches web-app/src/lib/privacyPolicy.ts field for field", () => {
    const web = readWebStatus();
    const mobile = PRIVACY_POLICY as unknown as Record<string, unknown>;

    // Same field SET first: a value added on the web that never reached the
    // mobile screen is exactly the drift this guards, and comparing only the
    // fields mobile happens to know would miss it.
    expect(Object.keys(mobile).sort()).toEqual(Object.keys(web).sort());

    const drifted = Object.keys(web).filter((k) => mobile[k] !== web[k]);
    expect({ drifted, web, mobile }).toEqual({ drifted: [], web, mobile: web });
  });

  it("treats an empty effective date as a draft", () => {
    expect(isPrivacyPolicyDraft({ ...PRIVACY_POLICY, effectiveDate: "" })).toBe(true);
    expect(isPrivacyPolicyDraft({ ...PRIVACY_POLICY, effectiveDate: "   " })).toBe(true);
    expect(isPrivacyPolicyDraft({ ...PRIVACY_POLICY, effectiveDate: "15.08.2026" })).toBe(
      false,
    );
  });
});
