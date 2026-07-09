// XSS-safe renderer for the MINIMAL markdown subset admin notification bodies may
// contain: `**bold**`, `*italic*`, and `[label](url)` links. The algorithm is:
//   1. Escape EVERY HTML-significant character first (& < > " '), so no attacker
//      markup can survive.
//   2. Only THEN convert the whitelisted markdown tokens into a fixed set of tags
//      (<strong>, <em>, <a>). Nothing else ever becomes HTML.
//   3. Links are emitted only when the URL is a real http(s) or root-relative
//      path; anything else (javascript:, data:, mailto:, protocol-relative //host,
//      backslash tricks) is left as the literal `[label](url)` text.
// The output is meant to be fed to dangerouslySetInnerHTML — never feed a raw body
// to that API, only the { __html } this function returns.

// Escape the five HTML-significant characters. Runs on the WHOLE input before any
// token conversion, and (because the token bodies come from this escaped string)
// link labels/urls are already attribute- and text-safe by the time we build tags.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A link URL is allowed only when it is an absolute http(s) URL or a same-origin
// root-relative path. Note: escapeHtml() has already run, so `&` appears as
// `&amp;` here — the scheme/`/` prefixes we test are untouched by escaping. We
// reject protocol-relative `//host` and any backslash to avoid open-redirect and
// scheme-injection tricks.
function isAllowedLinkUrl(url: string): boolean {
  if (url.includes("\\")) return false;
  if (/^https?:\/\//i.test(url)) return true;
  if (url[0] === "/" && url[1] !== "/") return true; // root-relative, not //host
  return false;
}

/**
 * Convert the minimal markdown subset to safe HTML and return it wrapped for
 * dangerouslySetInnerHTML. Order of operations is escape → links → bold → italic
 * so that `**` is consumed as bold before the single-`*` italic pass runs.
 */
export function renderNotificationMarkdown(text: string | null | undefined): {
  __html: string;
} {
  if (typeof text !== "string" || text.length === 0) return { __html: "" };

  // Hard length cap to keep the regex passes cheap on hostile input.
  let html = escapeHtml(text.slice(0, 4000));

  // Links: [label](url) — emit an <a> only for whitelisted URLs, else keep the
  // literal (already-escaped) match. External links open in a new, isolated tab.
  html = html.replace(
    /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
    (match, label: string, url: string) => {
      if (!isAllowedLinkUrl(url)) return match; // leave literal text
      const external = /^https?:\/\//i.test(url);
      const attrs = external
        ? ` href="${url}" target="_blank" rel="noopener noreferrer"`
        : ` href="${url}" rel="noopener noreferrer"`;
      return `<a${attrs}>${label}</a>`;
    },
  );

  // Bold before italic so `**x**` isn't mis-parsed by the single-`*` pass.
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  return { __html: html };
}
