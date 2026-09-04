#!/usr/bin/env node
// =============================================================================
// "Unable to Submit for Review: to submit your items for review, add an app
// version for the selected platform."
//
// Apple will not review a first-ever set of in-app purchases on its own — the
// binary that sells them has to ride in the same submission — so the Submit
// button stays grey until the app version joins the 21 products as a 22nd item.
//
// THE STATE THIS EXISTS FOR. After a rejection the App Review page can show two
// rows at once: a completed submission carrying the app version and stamped
// "Unresolved Issues", and a newer draft carrying only the in-app purchases with
// an empty VERSIONS column. The version reports READY_FOR_REVIEW because of the
// OLD submission, and App Store Connect hides "Add for Review" from a version in
// that state — so the UI offers no control that joins the two.
//
// TWO TRAPS, both hit for real while writing this:
//
// 1. `submitted` IS NOT A FIELD on reviewSubmissions. The attributes are exactly
//    platform, state, submittedDate. Asking for `submitted` returns a blanket
//    400 PARAMETER_ERROR.INVALID that names the whole fields[] parameter, so it
//    reads like the endpoint is wrong rather than one word being wrong.
//
// 2. THE ITEMS CARRY NO RELATIONSHIPS AT ALL, and `include=` cannot rescue it:
//    Apple rejects `inAppPurchaseV2` and every neighbouring guess with a 400
//    blaming the include parameter. A plain GET returns only type, id,
//    attributes.state and links — so testing `relationships.appStoreVersion`
//    reports a submission holding 21 products as holding nothing. A silent wrong
//    answer, not an error, and it cost two runs before the sample dump exposed
//    it. The item id itself is the source of truth: base64 of
//    "{submissionId}|{typeCode}|{resourceId}".
//
// USAGE (from mobile-app/)
//   node ./scripts/attach-version-to-submission.mjs            report only
//   node ./scripts/attach-version-to-submission.mjs --raw      + raw JSON dump
//   node ./scripts/attach-version-to-submission.mjs --apply    attach the version
//   node ./scripts/attach-version-to-submission.mjs --apply --submission <id>
//   node ./scripts/attach-version-to-submission.mjs --why        why is it refused
//   node ./scripts/attach-version-to-submission.mjs --detach     undo the attach
//   node ./scripts/attach-version-to-submission.mjs --force-remove-item <id> \
//        --i-understand-this-is-one-way      free a version from a REJECTED sub
//   node ./scripts/attach-version-to-submission.mjs --set-platform IOS
//
// It NEVER submits — pressing Submit for Review stays a human decision in the
// browser, and Apple documents that the review-submission API does not apply to
// a first in-app-purchase submission anyway.
//
// --detach is the undo for --apply: it DELETEs the app-version item from the
// draft, which Apple allows with no documented preconditions. It refuses to
// touch any submission that is not an open draft, so it can never be pointed at
// the rejected August submission — removing an item there is ONE-WAY ("you
// can't add back removed items to the same submission").
//
// --set-platform is a last resort for a draft whose platform is null, and is
// NOT reversible: there is no un-set. Only use it if --apply was refused.
//
// Same four environment variables as the other scripts.
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import process from "node:process";

const API_BASE = "https://api.appstoreconnect.apple.com";
const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const RAW = ARGV.includes("--raw");
const DETACH = ARGV.includes("--detach");
const WHY = ARGV.includes("--why");
// The one-way door, deliberately awkward to open: it needs the item id typed out
// in full AND a second flag. --detach must NOT be repurposed for this — its
// refusal to touch anything but an open draft is what stops a rejected
// submission being modified by reflex.
const FORCE_REMOVE = (() => {
  const i = ARGV.indexOf("--force-remove-item");
  return i >= 0 ? ARGV[i + 1] : null;
})();
const ONE_WAY_OK = ARGV.includes("--i-understand-this-is-one-way");
const SET_PLATFORM = (() => {
  const i = ARGV.indexOf("--set-platform");
  return i >= 0 ? ARGV[i + 1] : null;
})();
const FORCED_SUB = (() => {
  const i = ARGV.indexOf("--submission");
  return i >= 0 ? ARGV[i + 1] : null;
})();

const log = (m = "") => process.stdout.write(`${m}\n`);
const rule = (c = "-") => log(c.repeat(78));

// Indent a multi-line blob for nested output, optionally capping the line count.
function indent(text, maxLines = 0, pad = "      ") {
  const lines = String(text).split(/\r?\n/);
  const shown = maxLines > 0 ? lines.slice(0, maxLines) : lines;
  const body = shown.map((l) => pad + l).join("\n");
  return maxLines > 0 && lines.length > maxLines
    ? `${body}\n${pad}... (${lines.length - maxLines} more lines)`
    : body;
}
function fail(m) {
  process.stderr.write(`\nERROR\n${m}\n`);
  process.exit(2);
}
const b64u = (x) =>
  Buffer.from(x).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function makeToken({ issuerId, keyId, privateKeyPem }) {
  const now = Math.floor(Date.now() / 1000);
  const input =
    `${b64u(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }))}.` +
    `${b64u(JSON.stringify({ iss: issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" }))}`;
  const sig = crypto.sign("sha256", Buffer.from(input), {
    key: crypto.createPrivateKey(privateKeyPem),
    dsaEncoding: "ieee-p1363", // DER (Node's default) yields a bare 401
  });
  return `${input}.${b64u(sig)}`;
}

// Apple's STATE_ERROR ends with "please check associated errors to see why" and
// never says where those errors are. They are in `errors[].meta` of the SAME
// response — an object this printer previously discarded, which is why the first
// 409 looked like a dead end. The whole body is echoed too: `meta` is
// undocumented, so summarising it risks dropping the one field that matters.
function explain(status, bodyText, method, path) {
  const lines = [`  ${method} ${path}`, `  HTTP ${status}`];
  let parsed = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    if (bodyText) lines.push(`  ${bodyText.slice(0, 2000)}`);
    return lines.join("\n");
  }
  for (const e of parsed.errors || []) {
    lines.push("");
    lines.push(`  ${e.title || "(no title)"}${e.code ? `  [${e.code}]` : ""}`);
    if (e.detail) lines.push(`    ${e.detail}`);
    const p = e.source && (e.source.pointer || e.source.parameter);
    if (p) lines.push(`    offending field: ${p}`);
    if (e.meta) {
      lines.push("    meta (this is what \"associated errors\" refers to):");
      lines.push(indent(JSON.stringify(e.meta, null, 2), 0, "      "));
    }
    if (e.id) lines.push(`    apple error id: ${e.id}`);
  }
  lines.push("");
  lines.push("  full response body:");
  lines.push(indent(JSON.stringify(parsed, null, 2), 0, "    "));
  return lines.join("\n");
}

function makeClient(token) {
  return async (method, path, body) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.pretty = explain(res.status, text, method, path);
      err.status = res.status;
      throw err;
    }
    return text ? JSON.parse(text) : null;
  };
}

async function shutdown() {
  const d = globalThis[Symbol.for("undici.globalDispatcher.1")];
  if (d && typeof d.close === "function") {
    try {
      await d.close();
    } catch {
      /* already closed */
    }
  }
}

// A reviewSubmissionItem id is base64 of "{submissionId}|{typeCode}|{resourceId}".
// That matters because the list response carries NO relationships object at all
// — just type, id, attributes.state, links — so there is nothing to read the
// item's kind from except the id itself. Verified against this app: the August
// submission's single item decodes to type 6, and each of the 21 draft items to
// type 17, matching what App Store Connect shows for each.
const ITEM_TYPE = { 6: "appStoreVersion", 17: "inAppPurchase" };

function decodeItemId(id) {
  try {
    const parts = Buffer.from(id, "base64").toString("utf8").split("|");
    if (parts.length !== 3) return null;
    const code = Number(parts[1]);
    return {
      submissionId: parts[0],
      code,
      kind: ITEM_TYPE[code] || `unknownType(${parts[1]})`,
      resourceId: parts[2],
    };
  } catch {
    return null;
  }
}

async function describeItems(api, subId) {
  const empty = { counts: {}, versionItems: [], iapItems: [], total: 0, sample: null, undecodable: 0 };
  let res;
  try {
    // No `include=`. Apple rejects `inAppPurchaseV2` and every other name worth
    // guessing with a 400 that blames the include parameter; the id decode above
    // makes the whole question moot.
    res = await api("GET", `/v1/reviewSubmissions/${subId}/items?limit=200`);
  } catch (e) {
    return { ...empty, error: e.pretty || e.message };
  }

  const counts = {};
  const versionItems = [];
  const iapItems = [];
  let undecodable = 0;
  for (const it of res.data || []) {
    const d = decodeItemId(it.id);
    if (!d) {
      undecodable += 1;
      counts["(id did not decode)"] = (counts["(id did not decode)"] || 0) + 1;
      continue;
    }
    // A removed item is still LISTED by Apple, with attributes.state REMOVED.
    // Counting it as held is how a freed version keeps looking trapped: the
    // August submission reports one appStoreVersion item forever, even after the
    // version has moved on. Only a live item holds anything.
    const removed = it.attributes?.state === "REMOVED";
    const key = removed ? `${d.kind} (REMOVED — not held)` : d.kind;
    counts[key] = (counts[key] || 0) + 1;
    if (removed) continue;

    const rec = { itemId: it.id, resourceId: d.resourceId, state: it.attributes?.state };
    if (d.kind === "appStoreVersion") versionItems.push(rec);
    if (d.kind === "inAppPurchase") iapItems.push(rec);
  }

  return {
    counts,
    versionItems,
    iapItems,
    undecodable,
    total: (res.data || []).length,
    sample: (res.data || [])[0] || null,
    raw: RAW ? res : null,
    error: null,
  };
}

const iapCount = (d) => (d.iapItems || []).length;

// Apple's 409 ends with "please check associated errors to see why" without
// saying where those errors live. This walks everything hanging off the version
// that could hold the answer, and in particular asks whether the LEGACY
// appStoreVersionSubmission resource still exists for it — historically that
// resource's DELETE was the "Remove from Review" mechanism, and if it is present
// it is the least destructive way to free a version that is stuck in
// READY_FOR_REVIEW. Read-only: every call here is a GET.
async function explainVersionState(api, target) {
  rule("=");
  log(`WHY IS ${target.version} NOT IN A VALID STATE  (id ${target.id})`);
  rule("=");

  const probes = [
    ["the version record itself", `/v1/appStoreVersions/${target.id}`],
    ["LEGACY appStoreVersionSubmission (its DELETE = Remove from Review)", `/v1/appStoreVersions/${target.id}/appStoreVersionSubmission`],
    ["appStoreReviewDetail", `/v1/appStoreVersions/${target.id}/appStoreReviewDetail`],
    ["selected build", `/v1/appStoreVersions/${target.id}/build`],
    ["age rating declaration", `/v1/appStoreVersions/${target.id}/ageRatingDeclaration`],
    ["version localizations", `/v1/appStoreVersions/${target.id}/appStoreVersionLocalizations?limit=3`],
  ];

  for (const [label, path] of probes) {
    log("");
    log(`  ${label}`);
    log(`    GET ${path}`);
    try {
      const res = await api("GET", path);
      log(indent(JSON.stringify(res, null, 2), 40));
    } catch (e) {
      // A 404 here is information, not a failure: it says the resource does not
      // exist for this version, which for appStoreVersionSubmission means the
      // legacy removal route is unavailable.
      log(indent(e.pretty || e.message));
    }
  }
  log("");
  rule("=");
  log("Nothing above was modified. Every call was a GET.");
  rule("=");
  return 0;
}

async function main() {
  const g = (n) => (process.env[n] || "").trim();
  const env = {
    issuerId: g("APP_STORE_CONNECT_ISSUER_ID"),
    keyId: g("APP_STORE_CONNECT_KEY_ID"),
    p8Path: g("APP_STORE_CONNECT_P8_PATH"),
    appId: g("APP_STORE_CONNECT_APP_ID"),
  };
  if (Object.values(env).some((v) => !v)) {
    fail("APP_STORE_CONNECT_ISSUER_ID / KEY_ID / P8_PATH / APP_ID must all be set.");
  }
  if (!existsSync(env.p8Path)) fail("No .p8 file at APP_STORE_CONNECT_P8_PATH.");

  const api = makeClient(makeToken({ ...env, privateKeyPem: readFileSync(env.p8Path, "utf8") }));

  // ---------------------------------------------------------------- versions
  rule("=");
  log("APP VERSIONS (iOS)");
  rule("=");
  const versions = await api(
    "GET",
    `/v1/apps/${env.appId}/appStoreVersions?filter[platform]=IOS&limit=10` +
      `&fields[appStoreVersions]=versionString,appStoreState,appVersionState,createdDate`,
  );
  const byId = new Map();
  const submittable = new Set([
    "PREPARE_FOR_SUBMISSION",
    "DEVELOPER_REJECTED",
    "REJECTED",
    "METADATA_REJECTED",
    "READY_FOR_REVIEW",
    "WAITING_FOR_REVIEW",
  ]);
  let target = null;
  for (const v of versions.data) {
    const a = v.attributes;
    const state = a.appVersionState || a.appStoreState;
    byId.set(v.id, { version: a.versionString, state });
    log(`  ${a.versionString.padEnd(10)} ${String(state).padEnd(26)} id=${v.id}`);
    if (!target && submittable.has(state)) target = { id: v.id, version: a.versionString, state };
  }
  if (!target) fail("No iOS version is in a submittable state.");

  if (WHY) {
    log("");
    return await explainVersionState(api, target);
  }

  // ------------------------------------------------------------- submissions
  log("");
  rule("=");
  log("REVIEW SUBMISSIONS  (every one, with its contents)");
  rule("=");
  const subs = await api(
    "GET",
    `/v1/apps/${env.appId}/reviewSubmissions?limit=20` +
      `&fields[reviewSubmissions]=state,platform,submittedDate`,
  );

  const rows = [];
  for (const s of subs.data) {
    const a = s.attributes;
    const desc = await describeItems(api, s.id);
    rows.push({ id: s.id, ...a, ...desc });

    log("");
    log(`  id=${s.id}`);
    log(`    state=${a.state}  platform=${String(a.platform)}`);
    if (a.submittedDate) log(`    submittedDate=${a.submittedDate}`);

    if (desc.error) {
      log(`    items: COULD NOT READ`);
      log(desc.error.split("\n").map((l) => `    ${l}`).join("\n"));
      continue;
    }

    log(`    items: ${desc.total} total`);
    for (const [k, n] of Object.entries(desc.counts)) {
      log(`      ${String(n).padStart(3)}  ${k}`);
    }
    for (const v of desc.versionItems) {
      log(`      -> HOLDS AN APP VERSION  resource=${v.resourceId}  itemState=${v.state}`);
      log(`         itemId=${v.itemId}`);
    }
    if (RAW && desc.raw) {
      log("      raw:");
      log(JSON.stringify(desc.raw, null, 2).split("\n").map((l) => `        ${l}`).join("\n"));
    }
  }

  // -------------------------------------------------------- the one-way door
  // Removing the app-version item from the REJECTED submission. Apple renders no
  // (-) control for it, because that affordance is tied to items marked REJECTED
  // and this one reads READY_FOR_REVIEW. There is no undo: "you can't add back
  // removed items to the same submission". Every guard below exists so this
  // cannot happen by accident or by pointing an existing flag at the wrong id.
  if (FORCE_REMOVE) {
    log("");
    rule("=");
    log("REMOVE AN ITEM FROM A SUBMITTED / REJECTED SUBMISSION  (ONE-WAY)");
    rule("=");

    const d = decodeItemId(FORCE_REMOVE);
    if (!d) fail(`That item id does not decode. Copy it verbatim from the report above.`);
    if (d.kind !== "appStoreVersion") {
      fail(
        `That item is ${d.kind}, not an app version.\n` +
          `This flag exists only to free a version. Removing a product here would\n` +
          `strand it: product ids can never be reused.`,
      );
    }

    const owner = rows.find((r) => r.id === d.submissionId);
    if (!owner) fail(`The item claims submission ${d.submissionId}, which is not in the list above.`);

    log(`  item        ${FORCE_REMOVE}`);
    log(`  decodes to  ${d.kind}, resource ${d.resourceId}`);
    log(`  belongs to  ${owner.id}  (state ${owner.state}, ${owner.total} items)`);
    log("");
    log("  After this the version should leave READY_FOR_REVIEW and become");
    log("  attachable to the draft. It can NEVER be re-added to this submission.");

    if (!ONE_WAY_OK) {
      log("");
      log("  Not removed — the confirmation flag is missing. To proceed:");
      log(`    node ./scripts/attach-version-to-submission.mjs \\`);
      log(`      --force-remove-item ${FORCE_REMOVE} \\`);
      log(`      --i-understand-this-is-one-way`);
      return 0;
    }

    log("");
    log(`  DELETE /v1/reviewSubmissionItems/${FORCE_REMOVE}`);
    try {
      await api("DELETE", `/v1/reviewSubmissionItems/${FORCE_REMOVE}`);
    } catch (e) {
      log("");
      log("  Apple refused. NOTHING WAS REMOVED. Do not retry, and do not reach for");
      log("  Cancel Submission — stacking a second irreversible action on an");
      log("  ambiguous state is the worst available move. Send this to Apple:");
      log("");
      log(e.pretty || e.message);
      return 2;
    }

    log("");
    log("  Removed. Apple's state propagation is NOT immediate — reported as hours");
    log("  to days. Do not judge this by reloading the web page.");
    log("  Poll with:  node ./scripts/attach-version-to-submission.mjs --why");
    log("  Target:     appVersionState leaves READY_FOR_REVIEW");
    log("  Allow 24-48 hours before concluding anything.");
    return 0;
  }

  // ------------------------------------------------------------- the verdict
  log("");
  rule("=");
  log("VERDICT");
  rule("=");

  const holdsVersion = rows.filter((r) => !r.error && r.versionItems.length > 0);
  const holdsIap = rows.filter((r) => !r.error && iapCount(r) > 0);
  const openStates = new Set(["READY_FOR_REVIEW", "UNRESOLVED_ISSUES", "WAITING_FOR_REVIEW", "IN_REVIEW"]);

  for (const r of holdsVersion) {
    const stillOpen = openStates.has(r.state);
    log(
      `  version held by ${r.id}  state=${r.state}  ` +
        `${stillOpen ? "<-- STILL OPEN, may block re-attachment" : "(terminal - does not block)"}`,
    );
  }
  if (holdsVersion.length === 0) log("  No submission holds an app version.");

  for (const r of holdsIap) log(`  ${iapCount(r)} in-app purchases held by ${r.id}  state=${r.state}`);
  if (holdsIap.length === 0) log("  No submission holds in-app purchases.");

  const nullPlatform = rows.filter((r) => r.platform == null && r.state === "READY_FOR_REVIEW");
  if (nullPlatform.length > 0) {
    log("");
    log("  NOTE: a draft submission has platform=null. The Submit panel asks for");
    log('  "an app version for the SELECTED PLATFORM" — a submission with no');
    log("  platform may be unable to accept one at all. If the attach below is");
    log("  refused, this is the likely reason and the draft needs recreating");
    log("  with platform IOS rather than repairing.");
    for (const r of nullPlatform) log(`    ${r.id}`);
  }

  const dest =
    (FORCED_SUB && rows.find((r) => r.id === FORCED_SUB)) ||
    holdsIap.find((r) => r.state === "READY_FOR_REVIEW") ||
    rows.find((r) => r.state === "READY_FOR_REVIEW") ||
    null;

  if (!dest) {
    log("");
    log("  Could not identify a destination draft. Re-run with --submission <id>.");
    return 2;
  }
  log("");
  log(`  DESTINATION DRAFT: ${dest.id}  (${dest.total} items, state ${dest.state}, platform ${String(dest.platform)})`);

  // ------------------------------------------------------------------ detach
  if (DETACH) {
    if (dest.state !== "READY_FOR_REVIEW") {
      fail(
        `Refusing to detach from a submission in state ${dest.state}.
` +
          `Removing an item is only safe from an open draft. Apple states you cannot
` +
          `add back removed items to the same submission, so doing this to a
` +
          `submitted or rejected submission is one-way and unrecoverable.`,
      );
    }
    if (dest.versionItems.length === 0) {
      log("");
      log("  Nothing to detach — this draft holds no app version item.");
      return 0;
    }
    for (const v of dest.versionItems) {
      log(`  DELETE /v1/reviewSubmissionItems/${v.itemId}`);
      try {
        await api("DELETE", `/v1/reviewSubmissionItems/${v.itemId}`);
      } catch (e) {
        log("");
        log(e.pretty || e.message);
        return 2;
      }
    }
    const back = await describeItems(api, dest.id);
    log("");
    log(`Detached. Submission ${dest.id} now holds ${back.total} items.`);
    return 0;
  }

  // ------------------------------------------------------------ set platform
  if (SET_PLATFORM) {
    if (SET_PLATFORM !== "IOS") {
      fail(`--set-platform takes IOS for this app. Got: ${String(SET_PLATFORM)}`);
    }
    if (dest.platform != null) {
      log("");
      log(`  Platform is already ${dest.platform}. Refusing to change it.`);
      return 0;
    }
    log("");
    log("  Apple documents only `submitted` and `canceled` as patchable on a review");
    log("  submission, so this may simply be refused — which is itself the answer.");
    log(`  PATCH /v1/reviewSubmissions/${dest.id}  platform=IOS`);
    try {
      await api("PATCH", `/v1/reviewSubmissions/${dest.id}`, {
        data: {
          type: "reviewSubmissions",
          id: dest.id,
          attributes: { platform: "IOS" },
        },
      });
    } catch (e) {
      log("");
      log(e.pretty || e.message);
      return 2;
    }
    log("");
    log("  Platform set. Re-run with --apply.");
    return 0;
  }

  if (dest.versionItems.length > 0) {
    log("");
    log("  It already contains an app version — nothing to attach. If Submit is");
    log("  still grey the blocker is elsewhere (App Review Information, or the");
    log("  unresolved August submission).");
    return 0;
  }

  log(`  TO ATTACH:         iOS ${target.version}  (state ${target.state}, id ${target.id})`);

  if (!APPLY) {
    log("");
    log("  Dry run — nothing was written. To attach:");
    log("    node ./scripts/attach-version-to-submission.mjs --apply");
    log("");
    log("  This does NOT submit. You still press Submit for Review yourself.");
    return 0;
  }

  // ----------------------------------------------------------------- attach
  log("");
  log(`Attaching iOS ${target.version} to submission ${dest.id} ...`);
  try {
    await api("POST", "/v1/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: dest.id } },
          appStoreVersion: { data: { type: "appStoreVersions", id: target.id } },
        },
      },
    });
  } catch (e) {
    log("");
    log("Apple refused. Its message below names the real blocker — commonly an");
    log("empty App Review Information field, a version still held by an earlier");
    log("unresolved submission, or the null platform noted above:");
    log("");
    log(e.pretty || e.message);
    return 2;
  }

  const after = await describeItems(api, dest.id);
  if (after.versionItems.length === 0) {
    fail("POST reported success but the version is still not in the submission.");
  }
  log("");
  log(`DONE — submission ${dest.id} now holds ${after.total} items.`);
  log("Reload App Store Connect. 'Submit for Review' should be blue.");
  return 0;
}

main()
  .then(async (code) => {
    await shutdown();
    process.exitCode = code;
  })
  .catch(async (e) => {
    await shutdown();
    process.stderr.write(`\n${e.pretty || e.stack || e.message}\n`);
    process.exitCode = 1;
  });
