// Route-level skeleton for /questions. This is the heaviest list in the panel
// (server pagination + cascading filters + lifecycle counts + review chips), so
// every filter change, page step and search keystroke navigates and lands here
// first. Mirrors the real layout — head, stat cards, chips, filter row, rows —
// so nothing jumps when the data arrives. Built from the shared .loc-skel
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
