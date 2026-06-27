import Link from "next/link";

// Shared "unauthorized" state. Admin route guards in later stages redirect here
// when a user is not an Administrator/Content Manager or lacks a permission.
// Access is always enforced server-side, never by hiding this page.
export default function UnauthorizedPage() {
  return (
    <div className="container">
      <h1>Unauthorized</h1>
      <p className="muted">
        You don’t have permission to access this admin area.
      </p>
      <Link href="/">Go to admin home</Link>
    </div>
  );
}
