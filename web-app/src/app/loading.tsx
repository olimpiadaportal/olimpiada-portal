// Transient suspense fallback — language-neutral so it stays instant.
export default function Loading() {
  return (
    <div className="container">
      <p className="muted">…</p>
    </div>
  );
}
