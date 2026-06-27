import Link from "next/link";

// Shared "unauthorized" state. Route guards in later stages redirect here when a
// user lacks access. Authorization is always enforced server-side / via RLS, not
// by hiding this page.
export default function UnauthorizedPage() {
  return (
    <div className="container">
      <h1>Unauthorized</h1>
      <p className="muted">You don’t have access to this page.</p>
      <Link href="/">Go home</Link>
    </div>
  );
}
