import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { getChildLinkState } from "@/lib/auth/childLinkCore";
import { getChildAccessAdults, type ChildAccessAdult } from "@/lib/auth/childCredentialLink";
import { getLocale, getT } from "@/i18n/server";
import { ChildLinkPanel } from "@/components/ChildLinkPanel";

// The dictionary is a CLOSED ALLOWLIST and the client lookup is `dict[key] ?? key`,
// so a key missing from this array ships to the screen as the literal key string
// with no error and no failing test. Every key the panel can render must be here.
const KEYS = [
  "link.subtitle",
  "link.childId",
  "link.childPassword",
  "link.credentialsHint",
  "link.code",
  "link.codeHint",
  "link.codeReady",
  "link.codeExpires",
  "link.copyCode",
  "link.issue",
  "link.issueHint",
  "link.issueReplaces",
  "link.way.credentials",
  "link.way.credentialsBody",
  "link.way.code",
  "link.way.codeBody",
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
  // Every code CHILD_LINK_ERROR_KEYS can map (childLink.ts) plus the two the
  // credential path raises. `issue` and `redeem` reach codes the credential
  // path never did — needsId, creatorOnly, unavailable, invalidInvite — and a
  // rejection that renders as "link.err.invalidInvite" tells the parent nothing.
  "link.err.forbidden",
  "link.err.invalid",
  "link.err.invalidInvite",
  "link.err.credentialsInvalid",
  "link.err.alreadyOwner",
  "link.err.alreadyLinked",
  "link.err.unavailable",
  "link.err.creatorOnly",
  "link.err.needsId",
  "link.err.limit",
  "link.err.rate",
  "link.err.generic",
  // Shared with the 8-digit login id's copy control — the same two words, not a
  // second pair minted for a second copyable value.
  "parent.child.idCopy",
  "parent.child.idCopied",
  "state.loading",
];

export default async function ChildLinkPage() {
  const parent = await requireParent();
  const t = await getT();
  // The panel is a client component and formats the invite code's expiry
  // itself, so it needs the resolved locale — `getT` closes over it and does
  // not expose it.
  const locale = await getLocale();
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
      <ChildLinkPanel initial={initial} access={access} locale={locale} dict={dict} />
    </section>
  );
}
