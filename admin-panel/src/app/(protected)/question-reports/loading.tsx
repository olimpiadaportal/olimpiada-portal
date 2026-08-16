// Route-level skeleton for /question-reports. Every filter, search keystroke
// and page change navigates (the URL is the source of truth), so this is the
// indicator an admin actually sees between click and result. Built from the
// shared .loc-skel shimmer primitive and its page-agnostic size modifiers —
// there is no components/skeletons library in this repo to import from.
// Purely presentational, no text to translate.
export default function QuestionReportsLoading() {
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

      <div className="qfilters flt-bar">
        {[0, 1, 2, 3].map((f) => (
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
