// Route-level skeleton for /locations: mirrors the page header + the three
// master-detail columns so the layout does not jump when data arrives.
// Pure presentational — no text, so nothing to translate.
export default function LocationsLoading() {
  return (
    <div className="page locations-page" aria-busy="true">
      <div className="page-head">
        <div className="loc-skel loc-skel-title" />
        <div className="loc-skel loc-skel-subtitle" />
      </div>
      <div className="loc-grid">
        {[0, 1, 2].map((col) => (
          <section key={col} className="loc-col">
            <header className="loc-col-head">
              <div className="loc-skel loc-skel-colhead" />
            </header>
            <div className="loc-list">
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="loc-skel loc-skel-row" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
