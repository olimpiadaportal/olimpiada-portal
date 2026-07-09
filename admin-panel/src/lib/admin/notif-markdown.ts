// Minimal, SAFE markdown renderer for admin notification bodies.
//
// CONTRACT (must match the web inbox renderer so the preview here shows exactly
// what a user will see): FIRST escape every HTML metacharacter, THEN convert a
// tiny markdown subset into tags. Because the whole string is HTML-escaped
// BEFORE any tag is inserted, the only tags in the output are the ones we add,
// so the result is safe to inject via dangerouslySetInnerHTML.
//
// The stored/sent body stays the RAW markdown text — this helper only produces
// the preview/inbox HTML; the server never converts the body to HTML.
//
// Supported subset:
//   **bold**            -> <strong>bold</strong>
//   *italic*            -> <em>italic</em>
//   [label](url)        -> <a href="url">label</a>  (only http(s):// or /… urls)

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

// Only absolute http(s) links or site-relative paths are turned into anchors.
// Anything else (javascript:, data:, mailto:, bare text, …) stays literal.
function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith("/");
}

export function renderNotificationMarkdown(input: string): string {
  let out = escapeHtml(input ?? "");

  // Bold BEFORE italic — a `**` pair must be consumed before the single-`*`
  // italic rule runs, otherwise it would be read as two empty italics.
  out = out.replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^\n*]+?)\*/g, "<em>$1</em>");

  // [label](url) — the url was already HTML-escaped, so an attacker-supplied
  // quote is now &quot; and cannot break out of the href attribute. We still
  // only emit an anchor for http(s)/relative urls; other schemes stay as text.
  out = out.replace(
    /\[([^\]\n]*)\]\(([^)\s]+)\)/g,
    (match, label: string, url: string) =>
      isSafeUrl(url)
        ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : match,
  );

  return out;
}
