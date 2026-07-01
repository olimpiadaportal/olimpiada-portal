// Zero-JS collapsible FAQ using native <details>/<summary>.
// Server-rendered: strings are translated upstream and passed in.

export type FaqItem = { q: string; a: string };

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <div className="faq-list">
      {items.map((item, i) => (
        <details className="faq-item" key={i}>
          <summary className="faq-q">{item.q}</summary>
          <div className="faq-a">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
