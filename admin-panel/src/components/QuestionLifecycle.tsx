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

  const buttons: { action: string; key: string }[] = [];
  if (status === "draft" || status === "rejected")
    buttons.push({ action: "submit", key: "qact.submit" });
  if (status === "in_review" && can("content.review"))
    buttons.push(
      { action: "approve", key: "qact.approve" },
      { action: "reject", key: "qact.reject" },
    );
  if (status === "approved" && can("content.publish"))
    buttons.push({ action: "publish", key: "qact.publish" });
  if (status === "published" && can("content.publish"))
    buttons.push({ action: "unpublish", key: "qact.unpublish" });
  if (status !== "archived" && can("content.archive"))
    buttons.push({ action: "archive", key: "qact.archive" });

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
