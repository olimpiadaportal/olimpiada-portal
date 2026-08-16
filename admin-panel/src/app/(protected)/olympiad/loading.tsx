// Route-level skeleton for /olympiad: page head, the filter bar and a handful
// of table rows. Every filter change and title search navigates, so this is the
// state an admin sees between keystroke and result. Built from the shared
// .loc-skel shimmer primitive (there is no components/skeletons library here).
// Purely presentational, no text to translate.
export default function OlympiadLoading() {
  return (
    <div className="page olympiad-page" aria-busy="true">
      <div className="page-head">
        <div className="loc-skel loc-skel-title" />
        <div className="loc-skel loc-skel-subtitle" />
      </div>

      <div className="qfilters flt-bar">
        {[0, 1, 2].map((f) => (
          <div key={f} className="loc-skel qrep-skel-filter" />
        ))}
      </div>

      <section className="card">
        <div className="qrep-skel-rows">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="loc-skel loc-skel-row" />
          ))}
        </div>
      </section>
    </div>
  );
}
