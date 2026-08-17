// Route-level skeleton for one bug report: the report card, the metadata card
// and the triage card, so the page does not jump when the row and its profile
// lookup land. Same .loc-skel primitives as the list skeleton; no new CSS.
export default function BugReportDetailLoading() {
  return (
    <div className="page" aria-busy="true">
      <div className="page-head">
        <div className="loc-skel loc-skel-title" />
        <div className="loc-skel loc-skel-subtitle" />
      </div>

      <section className="card">
        <div className="qrep-skel-rows">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="loc-skel loc-skel-row" />
          ))}
        </div>
      </section>

      <section className="card">
        <div className="qrep-skel-rows">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="loc-skel loc-skel-row" />
          ))}
        </div>
      </section>

      <section className="card">
        <div className="qrep-skel-rows">
          {[0, 1, 2].map((row) => (
            <div key={row} className="loc-skel loc-skel-row" />
          ))}
        </div>
      </section>
    </div>
  );
}
