// Route-level skeleton for /questions, the heaviest list in the panel (server
// pagination + cascading filters + lifecycle counts + review chips).
//
// SCOPE, precisely — an earlier version of this comment claimed "every filter
// change, page step and search keystroke navigates and lands here first", and
// that is NOT true. This boundary covers arriving at /questions from another
// SEGMENT. Filter, search and page changes only rewrite searchParams, stay on
// this segment, and never re-suspend it — which is why the pager appeared to do
// nothing for several seconds. Feedback for those lives on the controls
// themselves (components/PendingLink.tsx, via useLinkStatus).
//
// Mirrors the real layout — head, stat cards, chips, filter row, rows — so
// nothing jumps when the data arrives. Built from the shared .loc-skel
// shimmer primitive; purely presentational, no text to translate.
export default function QuestionsLoading() {
  return (
    <div className="page" aria-busy="true">
      <div className="page-head">
        <div className="loc-skel loc-skel-title" />
        <div className="loc-skel loc-skel-subtitle" />
      </div>

      <div className="qstat-grid">
        {[0, 1, 2, 3].map((c) => (
          <div key={c} className="loc-skel qrep-skel-card" />
        ))}
      </div>

      <div className="review-chips">
        {[0, 1].map((c) => (
          <div key={c} className="loc-skel qrep-skel-chip" />
        ))}
      </div>

      <div className="qfilters flt-bar">
        {[0, 1, 2, 3, 4].map((f) => (
          <div key={f} className="loc-skel qrep-skel-filter" />
        ))}
      </div>

      <section className="card">
        <div className="qrep-skel-rows">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
            <div key={row} className="loc-skel loc-skel-row" />
          ))}
        </div>
      </section>
    </div>
  );
}
