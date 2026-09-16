"use server";

// ---------------------------------------------------------------------------
// THE STORE PRODUCT MAP (public.iap_products) — Administrator-only, READ-ONLY
// except for one switch.
//
// WHAT THIS TABLE IS. Apple's signed transaction carries a productId and
// nothing else about our catalogue. iap_products is the ONLY place that string
// is turned into something we can grant (a subject + interval, or an olympiad
// package). Migration 164 seeded 21 iOS subject rows with active = false, and
// nothing is sellable until an admin turns a row on. Before this screen existed
// that go-live step required raw SQL against production, which is not an
// acceptable release procedure.
//
// WHY THERE IS NO CREATE, EDIT OR DELETE (owner decision, 2026-09-16).
// Creating a row here NEVER created anything at Apple. Apple-side product
// creation lives in mobile-app/scripts/create-iap-products.mjs, run by hand by
// the owner, and this panel holds a READ client only. So an admin "adding a
// product" was a workflow that changed nothing in the store and left a
// permanent, unsellable id behind in our database — the screen's own preflight
// would then refuse to activate it, correctly, forever. The create form is
// gone. What is left is a MIRROR: our rows beside what App Store Connect
// actually reports, with the disagreements named on the row.
//
// WHY setIapProductActive SURVIVED THE CUT. It is the only code path in this
// repository that can set active = false, which is how a live iOS product is
// withdrawn. Without it that operation is raw SQL against production during
// whatever incident prompted it. It is a LOCAL decision — whether OUR app
// offers the product — and it changes nothing in App Store Connect; every
// string around it has to say so, because an admin who believes this button
// pulled the product from Apple will stop looking for the real problem.
//
// WHY `active` IS DANGEROUS IN BOTH DIRECTIONS.
//   * ON, with no approved App Store Connect product behind it → the iOS app
//     lists a product StoreKit cannot resolve, and the purchase fails for every
//     user who taps it. That is worse than not selling at all: Apple reviews the
//     buy button, not our intentions.
//   * ON, pointing at an archived subject → we take money for access the
//     platform will not serve.
//   * OFF → the app simply does not offer that product. Always safe, always
//     allowed. Deactivation is therefore NEVER blocked by any check below; it
//     is the way OUT of a bad state, exactly as archiving an unpriced subject
//     is (see subject-status.ts).
//
// ANDROID PURCHASE-SILENCE — READ BEFORE ADDING A PLATFORM CONTROL.
// The Play build is consumption-only by store policy, not by preference
// (docs/STORE_PAYMENTS_COMPLIANCE.md). With NO android/google_play rows in this
// table the purchase endpoint has literally nothing to sell on Android, so the
// silence is STRUCTURAL rather than a flag somebody can flip. Nothing in this
// module can produce a row at all any more, and the one write it has refuses a
// non-ios row outright. The day Google forces IAP is a deliberate migration
// plus a build, not a dropdown on an admin screen.
//
// WHY A ROW IS NEVER DELETED. A store product id is permanent and public — App
// Store Connect never renames one and never lets the string be reused — and an
// intent row pins the product (fk_iap_intent_product is ON DELETE RESTRICT), so
// a product anybody ever tapped Buy on cannot be deleted anyway. Retirement is
// deactivation; the row stays as the record of what that id sold.
//
// AUTHORIZATION: requireAdmin() is the FIRST statement of every export, before
// any FormData is read. RLS (iap_products_write) is the backstop, and the
// request-scoped session client is used throughout — no service-role client is
// needed here (the audit helper creates its own).
//
// AUDIT: public.iap_products carries trg_audit_iap_products, so the DB already
// records a before/after diff of every row change. The explicit writeAuditLog()
// calls below are NOT redundant with it: the trigger records WHAT changed, this
// records the admin's INTENT under a searchable action name
// (admin.iap.product.activate / .deactivate) together with the product id,
// which is what somebody reconstructing a bad release day will actually search
// for.
// ---------------------------------------------------------------------------
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  fetchStoreCatalogue,
  preflightStoreProduct,
  storeStateLabelKey,
  storeStateVerdict,
  type StoreStateVerdict,
} from "@/lib/admin/appStoreConnect";
import { getLocale } from "@/i18n/server";
import {
  SUBJECT_DISPLAY_SELECT,
  subjectDisplayName,
  type SubjectTranslationRow,
} from "@/lib/admin/subject-display";

// The ONLY platform we offer. Never read from client input, and the one thing
// the toggle checks that has nothing to do with the target being live.
// See ANDROID PURCHASE-SILENCE above.
const IOS_PLATFORM = "ios";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IapScope = "subject" | "olympiad_package";
export type IapInterval = "week" | "month" | "year";

/**
 * Why a row must not be activated. `null` = the target is live and sellable.
 * Rendered per row on the screen AND re-derived inside the toggle action —
 * the screen is a hint, the action is the rule.
 */
export type IapTargetProblem =
  | null
  | "targetMissing"
  | "targetArchived"
  | "gradeMissing";

/**
 * A disagreement between the two halves of this screen, named on the row.
 *
 * SILENT DIVERGENCE IS THE FAILURE MODE. Both halves looking plausible on their
 * own is exactly how a build reaches App Review offering a product StoreKit
 * cannot resolve. `null` means the two agree (or that Apple could not be read
 * at all, which the page states once at the top rather than sixty times).
 *
 *   offeredMissing  — we offer it; Apple has no such product id. Every tap
 *                     fails. This is the 3.1.1 shape.
 *   offeredBlocked  — we offer it; Apple's state cannot produce a sale
 *                     (rejected, removed, incomplete).
 *   offeredUnknown  — we offer it; Apple reports a state we cannot classify.
 *   approvedIdle    — Apple has it approved; we do not offer it. Usually a
 *                     deliberate local decision, so it is stated, not alarmed.
 *   absentAtApple   — we do not offer it, and Apple has never had this id. A
 *                     row that can never be turned on as things stand.
 */
export type IapDivergence =
  | null
  | "offeredMissing"
  | "offeredBlocked"
  | "offeredUnknown"
  | "approvedIdle"
  | "absentAtApple";

/** What App Store Connect says about one product, ready to render. */
export type IapStoreState = {
  /** i18n key carrying App Store Connect's OWN wording — never the API code. */
  labelKey: string;
  verdict: StoreStateVerdict;
  /** Apple's reference name, shown when it disagrees with what we think it is. */
  name: string | null;
};

export type IapProductRow = {
  id: string;
  platform: string;
  product_id: string;
  scope: IapScope;
  interval: IapInterval | null;
  active: boolean;
  /** Subject name / olympiad package title, already resolved. */
  targetName: string | null;
  /** The target's catalog_status, so the row can show WHY it is refused. */
  targetStatus: string | null;
  /** Only for grade-pinned package products (the rare case). */
  gradeLabel: string | null;
  problem: IapTargetProblem;
  /** null when Apple has no such id, or when Apple could not be read at all. */
  store: IapStoreState | null;
  divergence: IapDivergence;
};

/** A product Apple holds that `iap_products` does not map to anything. */
export type IapUnmappedProduct = {
  productId: string;
  name: string | null;
  labelKey: string;
  verdict: StoreStateVerdict;
};

/** How the App Store Connect half of the screen went, and when. */
export type IapStoreStatus = {
  ok: boolean;
  /** Set when ok is false: "storeNotConfigured" | "storeUnreachable". */
  problem: string | null;
  /** ISO instant the read was attempted — the screen's "last refreshed". */
  fetchedAt: string;
};

export type IapCatalogue = {
  rows: IapProductRow[];
  /**
   * Apple ids with no row here. Invisible to any per-row check and worth its
   * own section: a purchase of one of these reaches the server as a productId
   * that maps to nothing, so the family is charged and granted nothing.
   */
  unmapped: IapUnmappedProduct[];
  store: IapStoreStatus;
  /** A load failure is reported, never rendered as an empty catalogue. */
  loadFailed: boolean;
};

export type IapActionState = { ok?: boolean; error?: string } | null;

type ProductRecord = {
  id: string;
  platform: string;
  product_id: string;
  scope: IapScope;
  subject_id: string | null;
  package_id: string | null;
  grade_id: string | null;
  interval: IapInterval | null;
  active: boolean;
};

const PRODUCT_COLUMNS =
  "id, platform, product_id, scope, subject_id, package_id, grade_id, interval, active";

/**
 * THE ONE RULE, in one place: may this product be sold right now?
 *
 * Used to render the row and re-used to decide the toggle, so the screen can
 * never disagree with the server about what is allowed. `targets` are the rows
 * actually found in the database — an id that resolves to nothing is
 * `targetMissing`, which is the "subject was hard-deleted" case.
 */
function targetProblem(
  product: Pick<ProductRecord, "scope" | "subject_id" | "package_id" | "grade_id">,
  targetStatus: string | null | undefined,
  gradeFound: boolean,
): IapTargetProblem {
  const targetId =
    product.scope === "subject" ? product.subject_id : product.package_id;
  if (!targetId) return "targetMissing";
  if (targetStatus === null || targetStatus === undefined) return "targetMissing";
  // 'inactive' (unpublished) is refused alongside 'archived' on purpose. Both
  // mean the platform will not serve the thing to a family, and selling access
  // that is not served takes money for nothing. Only 'active' is sellable.
  if (targetStatus !== "active") return "targetArchived";
  // A grade-pinned package product whose grade row vanished would grant an
  // entitlement nobody can use.
  if (product.grade_id && !gradeFound) return "gradeMissing";
  return null;
}

/**
 * Everything the screen renders — BOTH halves of it.
 *
 * Reads through the request-scoped client: iap_products_select gives an admin
 * every row (including the inactive ones, which is the entire point of this
 * screen), so no service-role client is used.
 *
 * App Store Connect is read on every call, uncached, because the screen's one
 * promise is that it shows the latest truth. A stale mirror is worse than no
 * mirror: it would show agreement that has already stopped being true. Apple
 * being unreachable is NOT a page failure — our own rows are still the useful
 * half, and the store column says it could not be read.
 */
export async function listIapCatalogue(): Promise<IapCatalogue> {
  await requireAdmin();
  const supabase = await createClient();

  // Apple and Postgres have nothing to say to each other; waiting on them in
  // series would just make the refresh slower.
  const [productsRes, storeRes] = await Promise.all([
    supabase
      .from("iap_products")
      .select(PRODUCT_COLUMNS)
      .order("scope")
      .order("product_id"),
    fetchStoreCatalogue(),
  ]);

  const store: IapStoreStatus = {
    ok: storeRes.ok,
    problem: storeRes.ok ? null : storeRes.problem,
    fetchedAt: storeRes.fetchedAt,
  };
  const storeByProductId = new Map(
    storeRes.ok ? storeRes.products.map((p) => [p.productId, p]) : [],
  );

  if (productsRes.error) {
    // Never surface a raw Postgres message; the detail goes to the server log
    // and the screen shows a load error instead of an empty, reassuring table.
    console.error("[admin] iap products load failed", productsRes.error.message);
    return { rows: [], unmapped: [], store, loadFailed: true };
  }

  const products = (productsRes.data ?? []) as ProductRecord[];

  // Only the grade ids are collected: the subject and package catalogues are
  // read in full below (both are small, and the archived ones are exactly what
  // this screen has to be able to name), so narrowing them by id would buy
  // nothing. Grade-pinned products are the rare case, so that one IS narrowed.
  const gradeIds = Array.from(
    new Set(products.map((p) => p.grade_id).filter((v): v is string => !!v)),
  );

  // Both catalogues in full, not just the live ones: this screen exists to
  // NAME the bad states, and a product pointing at an archived subject has to
  // be able to say which subject it is.
  const [allSubjectsRes, allPackagesRes] = await Promise.all([
    supabase.from("subjects").select(SUBJECT_DISPLAY_SELECT),
    supabase
      .from("olympiad_packages")
      .select("id, code, status, olympiad_package_translations(locale, title)")
      .order("code"),
  ]);

  // Kept out of the Promise.all above because `.in("id", [])` is not a query
  // worth sending: grade-pinned products are the rare case and are usually
  // absent entirely.
  const gradesRes = gradeIds.length
    ? await supabase.from("grades").select("id, name, level").in("id", gradeIds)
    : { data: [] as { id: string; name: string | null; level: number | null }[], error: null };

  const loadFailed =
    allSubjectsRes.error !== null ||
    allPackagesRes.error !== null ||
    gradesRes.error !== null;
  if (loadFailed) {
    console.error(
      "[admin] iap target resolution failed",
      allSubjectsRes.error?.message ??
        allPackagesRes.error?.message ??
        "grades lookup failed",
    );
  }

  // Named the way the Subjects screen names them — an admin binding an App
  // Store product to a subject is looking at the same catalogue. The product
  // id beside it is the machine handle here; `subjects.name` is a THIRD string
  // and would only make the row ambiguous. `.order("name")` went with the
  // column — it sorted by the invisible key — and the sort moved here.
  const locale = await getLocale();
  const subjectRows = ((allSubjectsRes.data ?? []) as {
    id: string;
    name: string;
    code: string | null;
    status: string | null;
    subject_translations?: SubjectTranslationRow[] | null;
  }[])
    .map((s) => ({
      id: String(s.id),
      name: subjectDisplayName(s, locale),
      status: s.status ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const packageRows = (allPackagesRes.data ?? []) as {
    id: string;
    code: string;
    status: string | null;
    olympiad_package_translations?: { locale: string; title: string }[] | null;
  }[];
  const gradeRows = (gradesRes.data ?? []) as {
    id: string;
    name: string | null;
    level: number | null;
  }[];

  const subjectById = new Map(subjectRows.map((s) => [s.id, s]));
  const gradeById = new Map(gradeRows.map((g) => [g.id, g]));

  // Package titles are per-locale rows; the panel shows the Azerbaijani title
  // everywhere else (olympiad/page.tsx), so it does here too. The `code` is the
  // fallback rather than an em dash: a package with no az translation still has
  // to be identifiable, because an admin is about to make it purchasable.
  const packageById = new Map(
    packageRows.map((p) => [
      p.id,
      {
        id: p.id,
        status: p.status,
        title:
          (p.olympiad_package_translations ?? []).find((x) => x.locale === "az")
            ?.title ?? p.code,
      },
    ]),
  );

  const rows: IapProductRow[] = products.map((p) => {
    const subject = p.subject_id ? subjectById.get(p.subject_id) : undefined;
    const pkg = p.package_id ? packageById.get(p.package_id) : undefined;
    const grade = p.grade_id ? gradeById.get(p.grade_id) : undefined;
    const targetStatus =
      p.scope === "subject" ? (subject?.status ?? null) : (pkg?.status ?? null);

    const snapshot = storeByProductId.get(p.product_id);
    const storeState: IapStoreState | null = snapshot
      ? {
          labelKey: storeStateLabelKey(snapshot.state),
          verdict: storeStateVerdict(snapshot.state),
          name: snapshot.name,
        }
      : null;

    return {
      id: p.id,
      platform: p.platform,
      product_id: p.product_id,
      scope: p.scope,
      interval: p.interval,
      active: p.active,
      targetName: p.scope === "subject" ? (subject?.name ?? null) : (pkg?.title ?? null),
      targetStatus,
      gradeLabel: grade ? (grade.name ?? String(grade.level ?? "")) : null,
      problem: targetProblem(p, targetStatus, !p.grade_id || !!grade),
      store: storeState,
      divergence: divergenceOf(store.ok, p.active, storeState),
    };
  });

  // The other direction: what Apple has that we cannot map. Only meaningful
  // when the store read SUCCEEDED — an unreachable Apple would otherwise
  // report an empty catalogue as "nothing unmapped", which is agreement we
  // never established.
  const known = new Set(products.map((p) => p.product_id));
  const unmapped: IapUnmappedProduct[] = storeRes.ok
    ? storeRes.products
        .filter((p) => !known.has(p.productId))
        .map((p) => ({
          productId: p.productId,
          name: p.name,
          labelKey: storeStateLabelKey(p.state),
          verdict: storeStateVerdict(p.state),
        }))
        // Byte order, not collation: a store product id is a machine string
        // (ASCII, no case, no diacritics) and every admin must see the same
        // sequence regardless of their locale.
        .sort((a, b) =>
          a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0,
        )
    : [];

  // Sort within scope: subject products by subject name then week/month/year
  // (the order a human reads a price list in), packages by title.
  const intervalRank: Record<string, number> = { week: 0, month: 1, year: 2 };
  rows.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === "subject" ? -1 : 1;
    const byName = (a.targetName ?? "").localeCompare(b.targetName ?? "", "az");
    if (byName !== 0) return byName;
    return (
      (intervalRank[a.interval ?? ""] ?? 0) - (intervalRank[b.interval ?? ""] ?? 0)
    );
  });

  return { rows, unmapped, store, loadFailed };
}

/**
 * The one rule for "do these two halves agree?", in one place.
 *
 * When Apple could not be read there is NO verdict to give: the page says so
 * once at the top, and claiming a disagreement we never observed would train an
 * admin to ignore the column on every outage.
 */
function divergenceOf(
  storeOk: boolean,
  active: boolean,
  store: IapStoreState | null,
): IapDivergence {
  if (!storeOk) return null;
  if (active) {
    if (!store) return "offeredMissing";
    if (store.verdict === "blocked") return "offeredBlocked";
    if (store.verdict === "unknown") return "offeredUnknown";
    return null;
  }
  if (!store) return "absentAtApple";
  // Deliberately narrow: only a product Apple has APPROVED (verdict "sellable"
  // covers the review pipeline too) is worth pointing at as "ready, and we are
  // not offering it". Flagging one that is still in review would put a notice
  // on every row during a submission.
  return store.labelKey === "iap.store.state.approved" ? "approvedIdle" : null;
}

/**
 * Turn one product on or off.
 *
 * ACTIVATION IS THE GUARDED DIRECTION. It is refused when the thing being sold
 * is gone or not published, and when the row is not an iOS row (which no row in
 * this database is, and no row this screen can create is — the check is here so
 * that a hand-crafted POST cannot make one sellable either).
 *
 * DEACTIVATION IS NEVER REFUSED, deliberately: it is how an admin fixes any
 * mistake this screen can make, including one made by somebody else, and a
 * check that could block it would be a trap rather than a safeguard.
 */
export async function setIapProductActive(
  _prev: IapActionState,
  formData: FormData,
): Promise<IapActionState> {
  const ctx = await requireAdmin();

  const id = String(formData.get("__id") ?? "").trim();
  const nextRaw = String(formData.get("__active") ?? "");
  if (!UUID_SHAPE.test(id) || (nextRaw !== "true" && nextRaw !== "false")) {
    return { error: "iap.err.server" };
  }
  const next = nextRaw === "true";

  const supabase = await createClient();

  // Re-read the row server-side. The client sends an id and a desired state and
  // nothing else — every fact the decision rests on comes from the database.
  const { data: product, error: readError } = await supabase
    .from("iap_products")
    .select(PRODUCT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("[admin] iap product read failed", id, readError.message);
    return { error: "iap.err.server" };
  }
  if (!product) return { error: "iap.err.notFound" };

  const row = product as ProductRecord;
  // Already in the requested state (a double-click, or two admins in two tabs):
  // report success without writing, so the audit trail is not padded with
  // no-ops that look like release-day activity.
  if (row.active === next) return { ok: true };

  if (next) {
    // ANDROID PURCHASE-SILENCE, enforced and not merely assumed. No screen can
    // create a non-ios row, so this only fires on a row that arrived some other
    // way — which is exactly when a silent activation would be worst.
    if (row.platform !== IOS_PLATFORM) return { error: "iap.err.iosOnly" };

    const problem = await checkTargetLive(supabase, row);
    if (problem) return { error: `iap.err.${problem}` };

    // ...and then ask APPLE, because everything above only proves OUR side is
    // coherent. A product id App Store Connect has never heard of passes every
    // check in this file and still gives every family a buy button that fails.
    // Read-only; refuses on anything it cannot positively confirm, including a
    // missing configuration — an unchecked activation is the event this guard
    // exists to prevent.
    const store = await preflightStoreProduct(row.product_id);
    if (!store.ok) {
      console.error(
        "[admin] iap activation refused by store preflight",
        row.product_id,
        store.problem,
        store.state ?? "-",
      );
      return { error: `iap.err.${store.problem}` };
    }
  }

  const { data: updated, error: writeError } = await supabase
    .from("iap_products")
    .update({ active: next })
    .eq("id", id)
    .select("id");

  if (writeError) {
    // uq_iap_product_subject_active / uq_iap_product_package_active: two live
    // products selling the same thing makes "which one does the app show?"
    // undecidable, so the database refuses it. Say which case it is — a generic
    // "server error" here would leave an admin re-clicking on release day.
    const duplicate =
      writeError.code === "23505" ||
      /uq_iap_product_(subject|package)/.test(writeError.message ?? "");
    console.error("[admin] iap product toggle failed", id, writeError.message);
    return { error: duplicate ? "iap.err.duplicateActive" : "iap.err.server" };
  }
  if (!updated || updated.length === 0) {
    // RLS refused the write (or the row vanished between the read and here).
    // Reporting success would tell an admin the app is selling something it is
    // not.
    console.error("[admin] iap product toggle wrote no row", id);
    return { error: "iap.err.server" };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: next ? "admin.iap.product.activate" : "admin.iap.product.deactivate",
    targetTable: "iap_products",
    targetId: id,
    metadata: {
      product_id: row.product_id,
      platform: row.platform,
      scope: row.scope,
      interval: row.interval,
    },
    // Turning a product ON is the moment the app starts taking money for it.
    severity: next ? "warning" : "info",
  });

  revalidatePath("/iap");
  return { ok: true };
}

/** Re-derives targetProblem() from the database for ONE product row. */
async function checkTargetLive(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: ProductRecord,
): Promise<IapTargetProblem> {
  const targetId = row.scope === "subject" ? row.subject_id : row.package_id;
  if (!targetId) return "targetMissing";

  const table = row.scope === "subject" ? "subjects" : "olympiad_packages";
  const { data, error } = await supabase
    .from(table)
    .select("id, status")
    .eq("id", targetId)
    .maybeSingle();
  if (error) {
    console.error("[admin] iap target check failed", targetId, error.message);
    // FAIL CLOSED. An unreadable target is not a live one, and the cost of
    // being wrong in this direction is a retry; the other direction is a
    // purchasable product for something we cannot serve.
    return "targetMissing";
  }
  if (!data) return "targetMissing";

  let gradeFound = true;
  if (row.grade_id) {
    const { data: grade } = await supabase
      .from("grades")
      .select("id")
      .eq("id", row.grade_id)
      .maybeSingle();
    gradeFound = !!grade;
  }

  return targetProblem(row, (data as { status: string | null }).status, gradeFound);
}
