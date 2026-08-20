// The bare page the bank returns the cardholder to — pure, no env, no DB.
//
// WHY IT IS BARE. docs/STORE_PAYMENTS_COMPLIANCE.md §5 DO-6: any page an
// external link or redirect can land on must be chrome-free — no site nav, no
// prices, no purchase CTA — because a store reviewer follows links, and the
// same page must be safe to show a minor's guardian mid-transaction. It also
// REFLECTS NOTHING: not the order id, not the amount, not a gateway message.
// Every character on the page comes from our own i18n dictionary, so there is
// no path from an attacker-controlled callback field into rendered HTML.
//
// It reports the result of a PAYMENT. It never says anything about access,
// because this integration grants no access (see store.ts).
import { messages } from "@/i18n/messages";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

/** What the page says. Mapped from the reconciled outcome, never from the callback. */
export type ResultKind = "ok" | "pending" | "failed";

/** Whitelist a locale that arrived as a query parameter. */
export function safeLocale(value: string | null | undefined): Locale {
  if (typeof value !== "string") return defaultLocale;
  const v = value.trim().toLowerCase();
  return (locales as readonly string[]).includes(v) ? (v as Locale) : defaultLocale;
}

function t(locale: Locale, key: string): string {
  const dict = messages[locale] as Record<string, string>;
  const fallback = messages[defaultLocale] as Record<string, string>;
  return dict[key] ?? fallback[key] ?? key;
}

/**
 * Escape for HTML text and attribute context. Applied to every interpolation
 * even though all of them are our own dictionary values — the rule is that the
 * template escapes, so a future edit that pipes something else through it
 * cannot introduce an injection.
 */
export function escapeHtml(value: string): string {
  return value
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
}

const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; padding: 24px;
    font-family: Arial, Helvetica, "Segoe UI", system-ui, sans-serif;
    background: #fffbf5; color: #1c1917;
  }
  main { max-width: 32rem; text-align: center; }
  h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 12px; }
  p { margin: 0 0 8px; line-height: 1.5; }
  .muted { color: #57534e; font-size: .875rem; }
  button {
    margin-top: 16px; padding: 12px 24px; border: 0; border-radius: 14px;
    background: #7c3aed; color: #fff; font: inherit; font-weight: 700;
    cursor: pointer;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #14110f; color: #f5f5f4; }
    .muted { color: #a8a29e; }
  }`;

/**
 * The interstitial that performs the FULL HTTP REDIRECT to the acquirer's
 * hosted page: a plain form POST, submitted by the person, to the gateway's own
 * origin.
 *
 * NOT AN IFRAME AND NOT A CARD FORM. PCI DSS v4.0.1 SAQ A (r1) added a
 * script-security criterion that applies only to merchants EMBEDDING a payment
 * form; a redirect keeps us on the simplest SAQ A and out of Requirements 6.4.3
 * and 11.6.1 entirely (docs/STORE_PAYMENTS_COMPLIANCE.md §8.3 rule 1). The
 * fields rendered here are protocol fields only — there is no input for a card
 * number, an expiry or a CVV anywhere in this codebase, and there must never be.
 *
 * There is deliberately NO auto-submitting script: the page needs nothing from
 * `script-src`, and a redirect that only happens on a real click cannot fire
 * from a prefetch or a crawler. The gateway origin does need to be in the CSP's
 * `form-action` list — see next.config.mjs.
 */
export function renderRedirectForm(
  action: string,
  fields: Record<string, string>,
  locale: Locale,
): string {
  const title = escapeHtml(t(locale, "payres.title"));
  const message = escapeHtml(t(locale, "payres.redirect"));
  const button = escapeHtml(t(locale, "payres.continue"));
  const inputs = Object.entries(fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${message}</p>
<form method="POST" action="${escapeHtml(action)}" accept-charset="UTF-8">
${inputs}
<button type="submit">${button}</button>
</form>
</main>
</body>
</html>`;
}

/**
 * A self-contained HTML document. No external stylesheet, no script, no image
 * and no link — which also means it needs nothing from the CSP beyond
 * `default-src 'self'` and the inline-style allowance the app already grants.
 */
export function renderResultPage(kind: ResultKind, locale: Locale): string {
  const title = escapeHtml(t(locale, "payres.title"));
  const message = escapeHtml(t(locale, `payres.${kind}`));
  const close = escapeHtml(t(locale, "payres.close"));
  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${message}</p>
<p class="muted">${close}</p>
</main>
</body>
</html>`;
}
