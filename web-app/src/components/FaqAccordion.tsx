// Zero-JS collapsible FAQ using native <details>/<summary>.
// Server-rendered: strings are translated upstream and passed in.
// Each question shows a right-aligned down-chevron (.faq-chevron, L1 class) that
// rotates when the <details> is open (handled in globals.css via [open]).

export type FaqItem = { q: string; a: string };

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <div className="faq-list">
      {items.map((item, i) => (
        <details className="faq-item" key={i}>
          <summary className="faq-q">
            <span>{item.q}</span>
            <svg
              className="faq-chevron"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M6 9 L12 15 L18 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <div className="faq-a">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
