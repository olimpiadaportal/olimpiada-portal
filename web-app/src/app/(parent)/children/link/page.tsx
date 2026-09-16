import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { getChildLinkState } from "@/lib/auth/childLinkCore";
import { getChildAccessAdults, type ChildAccessAdult } from "@/lib/auth/childCredentialLink";
import { getT } from "@/i18n/server";
import { ChildLinkPanel } from "@/components/ChildLinkPanel";

// The dictionary is a CLOSED ALLOWLIST and the client lookup is `dict[key] ?? key`,
// so a key missing from this array ships to the screen as the literal key string
// with no error and no failing test. Every key the panel can render must be here.
const KEYS = [
  "link.subtitle",
  "link.childId",
  "link.childPassword",
  "link.credentialsHint",
  "link.request",
  "link.linkedNotice",
  "link.success",
  "link.owner",
  "link.linked",
  "link.revoke",
  "link.leave",
  "link.noAdults",
  "link.access.title",
  "link.access.creator",
  "link.access.linked",
  "link.access.since",
  "link.err.forbidden",
  "link.err.invalid",
  "link.err.credentialsInvalid",
  "link.err.alreadyOwner",
  "link.err.alreadyLinked",
  "link.err.limit",
  "link.err.rate",
  "link.err.generic",
  "state.loading",
];

export default async function ChildLinkPage() {
  const parent = await requireParent();
  const t = await getT();
  const initial = await getChildLinkState(parent.profileId);

  // Resolved SERVER-SIDE for every child at once. The alternative - each card
  // fetching its own list on mount - turns one page into N round trips and
  // renders the "who has access" section empty on first paint, which is the one
  // section a parent opens this page to read.
  const access: Record<string, ChildAccessAdult[]> = {};
  await Promise.all(
    initial.children.map(async (child) => {
      access[child.id] = await getChildAccessAdults(parent.profileId, child.id);
    }),
  );

  const dict = Object.fromEntries(KEYS.map((key) => [key, t(key)]));

  return (
    <section className="page stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>{t("link.title")}</h1>
        </div>
        <Link className="btn secondary" href="/dashboard">
          {t("parent.nav.dashboard")}
        </Link>
      </div>
      <ChildLinkPanel initial={initial} access={access} dict={dict} />
    </section>
  );
}
