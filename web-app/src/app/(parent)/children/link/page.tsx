import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { getChildLinkState } from "@/lib/auth/childLinkCore";
import { getT } from "@/i18n/server";
import { ChildLinkPanel } from "@/components/ChildLinkPanel";

const KEYS = [
  "link.choice.existing", "link.subtitle", "link.childId", "link.code", "link.request",
  "link.pending", "link.success", "link.owner", "link.linked", "link.issue", "link.codeReady",
  "link.approve", "link.reject", "link.revoke", "link.leave", "link.noAdults",
  "link.err.forbidden", "link.err.invalid", "link.err.invalidInvite", "link.err.alreadyLinked",
  "link.err.unavailable", "link.err.creatorOnly", "link.err.limit", "link.err.needsId",
  "link.err.rate", "link.err.generic",
  "parent.child.idCopy",
];

export default async function ChildLinkPage() {
  const parent = await requireParent();
  const t = await getT();
  const initial = await getChildLinkState(parent.profileId);
  const dict = Object.fromEntries(KEYS.map((key) => [key, t(key)]));
  return (
    <section className="page stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div><h1>{t("link.title")}</h1><p className="muted">{t("link.subtitle")}</p></div>
        <Link className="btn secondary" href="/dashboard">{t("parent.nav.dashboard")}</Link>
      </div>
      <ChildLinkPanel initial={initial} dict={dict} />
    </section>
  );
}
