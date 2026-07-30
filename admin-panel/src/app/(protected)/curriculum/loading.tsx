// Route-level skeleton for /curriculum. Every search, filter and page change
// navigates (the URL is the source of truth), so this is the loading indicator
// the admin actually sees between keystroke and result — it mirrors the page
// head, the filter bar, the toolbar and a few tree rows so the layout does not
// jump when the data lands. Purely presentational, no text to translate.
export default function CurriculumLoading() {
  return (
    <div className="page curriculum-page" aria-busy="true">
      <div className="page-head">
        <div className="cur-skel cur-skel-title" />
        <div className="cur-skel cur-skel-subtitle" />
      </div>

      <div className="cur-skel-filters">
        <div className="cur-skel cur-skel-filter wide" />
        <div className="cur-skel cur-skel-filter" />
        <div className="cur-skel cur-skel-filter" />
        <div className="cur-skel cur-skel-filter" />
      </div>

      <div className="cur-toolbar">
        <div className="cur-skel cur-skel-btn" />
        <div className="cur-skel cur-skel-btn" />
      </div>

      <section className="card cur-card">
        <div className="cur-skel-tree">
          {[0, 1].map((group) => (
            <div key={group} className="cur-skel-group">
              <div className="cur-skel cur-skel-grouphead" />
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="cur-skel cur-skel-row" />
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
