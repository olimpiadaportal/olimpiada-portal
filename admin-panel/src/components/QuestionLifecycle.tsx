import { transitionQuestion } from "@/lib/admin/questions";
import { DeleteQuestionButton } from "@/components/DeleteQuestionButton";

// Renders the lifecycle transition buttons allowed for the current status + role.
// Server-side actions re-check permissions and validity; RLS is the final gate.
export function QuestionLifecycle({
  id,
  status,
  isAdmin,
  permissions,
  dict,
}: {
  id: string;
  status: string;
  isAdmin: boolean;
  permissions: string[];
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const can = (p: string) => isAdmin || permissions.includes(p);

  // Three-state model: in_review → publish/reject; published → reject/to_review;
  // rejected → publish/to_review.
  const buttons: { action: string; key: string }[] = [];
  if (status === "in_review") {
    if (can("content.publish")) buttons.push({ action: "publish", key: "qact.publish" });
    if (can("content.review")) buttons.push({ action: "reject", key: "qact.reject" });
  } else if (status === "published") {
    if (can("content.review"))
      buttons.push(
        { action: "reject", key: "qact.reject" },
        { action: "to_review", key: "qact.to_review" },
      );
  } else if (status === "rejected") {
    if (can("content.publish")) buttons.push({ action: "publish", key: "qact.publish" });
    if (can("content.review")) buttons.push({ action: "to_review", key: "qact.to_review" });
  }

  return (
    <div className="lifecycle">
      {buttons.map((b) => (
        <form key={b.action} action={transitionQuestion}>
          <input type="hidden" name="__id" value={id} />
          <input type="hidden" name="__action" value={b.action} />
          <button className="btn-ghost" type="submit">
            {tt(b.key)}
          </button>
        </form>
      ))}
      {isAdmin && (
        <DeleteQuestionButton
          id={id}
          label={tt("qact.delete")}
          confirmText={tt("qact.confirmDelete")}
        />
      )}
    </div>
  );
}
