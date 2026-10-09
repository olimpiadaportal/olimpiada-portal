// The password-reset flow on the website (Issue 2, 2026-10-09).
//
// The backend has existed since the parent-auth stage — requestPasswordReset,
// /auth/confirm, updatePassword — but the login form never linked to it, a
// failed reset link was explained as a failed EMAIL VERIFICATION, and the reset
// page rendered a form nobody could submit when no reset session existed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { linkFailurePath } from "@/lib/auth/confirmEmail";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${p}`, import.meta.url)), "utf8");
const u = (q: string) => new URL(`https://olympiq.ai/auth/confirm${q}`);

describe("a reset link that cannot be redeemed", () => {
  it("goes back to the reset request page with a reset-specific message", () => {
    expect(linkFailurePath(u("?token_hash=x&type=recovery&next=/reset-password"), "expired")).toBe(
      "/forgot-password?link=expired",
    );
    expect(linkFailurePath(u("?token_hash=x&type=recovery"), "invalid")).toBe("/forgot-password?link=invalid");
  });
  it("is recognised by its hand-off alone, for legacy PKCE links", () => {
    expect(linkFailurePath(u("?code=abc&next=/reset-password"), "expired")).toBe("/forgot-password?link=expired");
  });
  it("leaves every other failed link on the verification path it always had", () => {
    expect(linkFailurePath(u("?token_hash=x&type=signup"), "expired")).toBe("/login?verify=expired");
    expect(linkFailurePath(u("?code=abc"), "invalid")).toBe("/login?verify=failed");
  });
  it("cannot be steered by an unsafe next value", () => {
    expect(linkFailurePath(u("?next=//evil.com/reset-password"), "invalid")).toBe("/login?verify=failed");
  });
  it("is what both email-link routes use", () => {
    for (const route of ["src/app/auth/confirm/route.ts", "src/app/auth/callback/route.ts"]) {
      expect(read(route), route).toContain("linkFailurePath(url, result.reason)");
    }
  });
});

describe("the login form", () => {
  it("links the parent tab to the reset flow", () => {
    const src = read("src/components/ArenaLogin.tsx");
    expect(src).toContain('href="/forgot-password"');
    // Exactly once, and in the PARENT form: a child cannot reset by email.
    expect(src.split('href="/forgot-password"')).toHaveLength(2);
    expect(src.indexOf('href="/forgot-password"')).toBeGreaterThan(src.indexOf("action={parentAction}"));
    expect(read("src/app/(public)/login/page.tsx")).toContain('"forgot.link"');
  });
});

describe("the reset page", () => {
  it("explains instead of rendering an unusable form when there is no reset session", () => {
    const src = read("src/app/(public)/reset-password/page.tsx");
    expect(src).toMatch(/if \(!parent\)/);
    expect(src.indexOf("if (!parent)")).toBeLessThan(src.indexOf("<ResetPasswordForm"));
    expect(src).toContain('href="/forgot-password"');
  });
});

describe("copy", () => {
  it("exists in all three languages", () => {
    for (const loc of locales) {
      for (const k of ["forgot.link", "forgot.linkExpired", "forgot.linkInvalid", "reset.noSession", "reset.requestNew"]) {
        expect(messages[loc][k]?.trim(), `${loc} ${k}`).toBeTruthy();
      }
    }
  });
});
