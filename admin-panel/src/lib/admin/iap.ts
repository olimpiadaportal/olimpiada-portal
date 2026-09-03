"use server";

// ---------------------------------------------------------------------------
// THE STORE PRODUCT MAP (public.iap_products) — Administrator-only.
//
// WHAT THIS TABLE IS. Apple's signed transaction carries a productId and
// nothing else about our catalogue. iap_products is the ONLY place that string
// is turned into something we can grant (a subject + interval, or an olympiad
// package). Migration 164 seeded 21 iOS subject rows with active = false, and
// nothing is sellable until an admin turns a row on. Before this screen existed
// that go-live step required raw SQL against production, which is not an
// acceptable release procedure.
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
// silence is STRUCTURAL rather than a flag somebody can flip. That is why
// `platform` below is a server-side constant (IOS_PLATFORM) and is never read
// from the form: there is no request an admin can craft from this screen that
// produces a google_play row. Do not add a platform <select> "for later" — the
// day Google forces IAP is a deliberate migration plus a build, not a dropdown.
//
// WHY NO DELETE. A store product id is permanent and public — App Store Connect
// never renames one and never lets the string be reused — and an intent row
// pins the product (fk_iap_intent_product is ON DELETE RESTRICT), so a product
// anybody ever tapped Buy on cannot be deleted anyway. Retirement is
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
// (admin.iap.product.activate / .deactivate / .create) together with the
// product id, which is what somebody reconstructing a bad release day will
// actually search for.
// ---------------------------------------------------------------------------
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import { preflightStoreProduct } from "@/lib/admin/appStoreConnect";

// The ONLY platform this screen can produce. Never read from client input.
// See ANDROID PURCHASE-SILENCE above.
const IOS_PLATFORM = "ios";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The store-slug half of the product id. Must satisfy the DB's
// ck_iap_product_id_shape ('^ai\.olympiq\.app\.(sub\.[a-z0-9]+\.(week|month|
// year)|oly\.[a-z0-9]+)$'), so lowercase ASCII alphanumerics only — no dots, no
// dashes, no underscores. Bounded at 40 so the composed id stays readable in
// App Store Connect and in every Apple financial report that will print it
// forever.
const SLUG_SHAPE = /^[a-z0-9]{2,40}$/;

export type IapScope = "subject" | "olympiad_package";
export type IapInterval = "week" | "month" | "year";

const SCOPES: readonly IapScope[] = ["subject", "olympiad_package"];
const INTERVALS: readonly IapInterval[] = ["week", "month", "year"];

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
};

export type IapCatalogue = {
  rows: IapProductRow[];
  /** Live targets an admin may create a NEW product for. */
  subjects: { id: string; name: string }[];
  packages: { id: string; title: string }[];
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
 * Everything the screen renders. Reads through the request-scoped client:
 * iap_products_select gives an admin every row (including the inactive ones,
 * which is the entire point of this screen), so no service-role client is used.
 */
export async function listIapCatalogue(): Promise<IapCatalogue> {
  await requireAdmin();
  const supabase = await createClient();

  const productsRes = await supabase
    .from("iap_products")
    .select(PRODUCT_COLUMNS)
    .order("scope")
    .order("product_id");

  if (productsRes.error) {
    // Never surface a raw Postgres message; the detail goes to the server log
    // and the screen shows a load error instead of an empty, reassuring table.
    console.error("[admin] iap products load failed", productsRes.error.message);
    return { rows: [], subjects: [], packages: [], loadFailed: true };
  }

  const products = (productsRes.data ?? []) as ProductRecord[];

  const subjectIds = Array.from(
    new Set(products.map((p) => p.subject_id).filter((v): v is string => !!v)),
  );
  const packageIds = Array.from(
    new Set(products.map((p) => p.package_id).filter((v): v is string => !!v)),
  );
  const gradeIds = Array.from(
    new Set(products.map((p) => p.grade_id).filter((v): v is string => !!v)),
  );

  // The "what could a NEW product point at" lists are LIVE targets only: a
  // product for an archived subject could never be activated anyway, so
  // offering it would only invite a permanent, useless store id.
  const [allSubjectsRes, allPackagesRes] = await Promise.all([
    supabase.from("subjects").select("id, name, status").order("name"),
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

  const subjectRows = (allSubjectsRes.data ?? []) as {
    id: string;
    name: string;
    status: string | null;
  }[];
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
    };
  });

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

  return {
    rows,
    subjects: subjectRows
      .filter((s) => s.status === "active")
      .map((s) => ({ id: s.id, name: s.name })),
    packages: packageRows
      .filter((p) => p.status === "active")
      .map((p) => ({
        id: p.id,
        title: packageById.get(p.id)?.title ?? p.code,
      })),
    loadFailed,
  };
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

/**
 * Create ONE new inactive iOS store product.
 *
 * Migration 164 seeded every subject product but deliberately left the olympiad
 * ones out ("their slugs are an owner naming decision this file cannot make on
 * their behalf") and named this screen as where they would be entered.
 *
 * THREE THINGS ARE NOT NEGOTIABLE HERE, and all three are server-side:
 *   1. platform is IOS_PLATFORM, a constant. The form has no platform field, so
 *      a google_play row cannot be produced by this code path at all.
 *   2. `active` is false. A product is never born sellable — the App Store
 *      Connect product has to exist and be approved first, which is a fact this
 *      server cannot check and must not assume.
 *   3. product_id is COMPOSED here from a validated slug, never accepted from
 *      the client. The id is permanent and public; App Store Connect will not
 *      rename it and will not let the string be reused.
 */
export async function createIapProduct(
  _prev: IapActionState,
  formData: FormData,
): Promise<IapActionState> {
  const ctx = await requireAdmin();

  const scopeRaw = String(formData.get("__scope") ?? "").trim();
  const targetId = String(formData.get("__target") ?? "").trim();
  const slug = String(formData.get("__slug") ?? "").trim().toLowerCase();
  const intervalRaw = String(formData.get("__interval") ?? "").trim();

  if (!SCOPES.includes(scopeRaw as IapScope)) return { error: "iap.err.scope" };
  const scope = scopeRaw as IapScope;

  if (!UUID_SHAPE.test(targetId)) return { error: "iap.err.target" };
  if (!SLUG_SHAPE.test(slug)) return { error: "iap.err.slug" };

  let interval: IapInterval | null = null;
  if (scope === "subject") {
    if (!INTERVALS.includes(intervalRaw as IapInterval)) {
      return { error: "iap.err.interval" };
    }
    interval = intervalRaw as IapInterval;
  }

  const supabase = await createClient();

  // The target must exist AND be live. Minting a permanent store id for an
  // archived subject buys nothing but a row that can never be activated.
  const table = scope === "subject" ? "subjects" : "olympiad_packages";
  const { data: target, error: targetError } = await supabase
    .from(table)
    .select("id, status")
    .eq("id", targetId)
    .maybeSingle();
  if (targetError) {
    console.error("[admin] iap create target read failed", targetError.message);
    return { error: "iap.err.server" };
  }
  if (!target) return { error: "iap.err.targetMissing" };
  if ((target as { status: string | null }).status !== "active") {
    return { error: "iap.err.targetArchived" };
  }

  const productId =
    scope === "subject"
      ? `ai.olympiq.app.sub.${slug}.${interval}`
      : `ai.olympiq.app.oly.${slug}`;

  const { error: insertError } = await supabase.from("iap_products").insert({
    platform: IOS_PLATFORM,
    product_id: productId,
    scope,
    subject_id: scope === "subject" ? targetId : null,
    package_id: scope === "olympiad_package" ? targetId : null,
    // grade_id stays NULL: the entitled grade is resolved from the CHILD named
    // in the purchase intent (see the column comment in migration 164). Pinning
    // one grade to one store product is a real but unusual product shape, and
    // it is not something to offer by default on a screen whose mistakes are
    // permanent.
    interval,
    active: false,
  });

  if (insertError) {
    const duplicate =
      insertError.code === "23505" || /uq_iap_product/.test(insertError.message ?? "");
    console.error("[admin] iap product create failed", productId, insertError.message);
    return { error: duplicate ? "iap.err.duplicateId" : "iap.err.server" };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.iap.product.create",
    targetTable: "iap_products",
    metadata: {
      product_id: productId,
      platform: IOS_PLATFORM,
      scope,
      interval,
      target_id: targetId,
    },
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
