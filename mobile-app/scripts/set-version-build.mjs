#!/usr/bin/env node
// =============================================================================
// POINT AN APP STORE VERSION AT A DIFFERENT BUILD.
//
// App Store Connect hides the build selector once a version reaches
// READY_FOR_REVIEW — which is exactly the state a version enters when it is
// added to a review submission. So after assembling a submission you can be left
// with the wrong binary attached and no visible control to change it, while the
// TestFlight page offers only "Expire Build", which throws the binary away
// instead of swapping it.
//
// The relationship is directly patchable: the version's `build` is a to-one
// relationship, and PATCHing it re-points the version without touching the
// submission, the products or any metadata.
//
// USAGE (from mobile-app/)
//   node ./scripts/set-version-build.mjs 5              report what would change
//   node ./scripts/set-version-build.mjs 5 --apply      do it
//
// Reversible: run it again with the previous build number.
//
// Env: APP_STORE_CONNECT_ISSUER_ID / _KEY_ID / _APP_ID and either
// APP_STORE_CONNECT_P8_PATH or APP_STORE_CONNECT_PRIVATE_KEY.
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import process from "node:process";

const API = "https://api.appstoreconnect.apple.com";
const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const WANT = ARGV.find((a) => /^\d+$/.test(a));

const log = (m = "") => process.stdout.write(`${m}\n`);
const rule = (c = "-") => log(c.repeat(70));
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
    `${b64u(JSON.stringify({ iss: issuerId, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }))}`;
  const sig = crypto.sign("sha256", Buffer.from(input), {
    key: crypto.createPrivateKey(privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${b64u(sig)}`;
}

function makeClient(token) {
  return async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
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
      err.body = text;
      err.status = res.status;
      err.where = `${method} ${path}`;
      throw err;
    }
    return text ? JSON.parse(text) : null;
  };
}

async function main() {
  if (!WANT) fail("Give the build NUMBER to select, e.g. `node ./scripts/set-version-build.mjs 5`.");

  const g = (n) => (process.env[n] || "").trim();
  const issuerId = g("APP_STORE_CONNECT_ISSUER_ID");
  const keyId = g("APP_STORE_CONNECT_KEY_ID");
  const appId = g("APP_STORE_CONNECT_APP_ID");
  const p8 = g("APP_STORE_CONNECT_P8_PATH");
  let pem = g("APP_STORE_CONNECT_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (!pem && p8 && existsSync(p8)) pem = readFileSync(p8, "utf8");
  if (!issuerId || !keyId || !appId || !pem) fail("Missing App Store Connect credentials.");

  const api = makeClient(makeToken({ issuerId, keyId, privateKeyPem: pem }));

  // The editable iOS version.
  const versions = await api(
    "GET",
    `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=5` +
      `&fields[appStoreVersions]=versionString,appVersionState`,
  );
  const version = (versions.data || [])[0];
  if (!version) fail("No iOS version found.");
  const vs = version.attributes.versionString;
  const state = version.attributes.appVersionState;

  // Which build is attached right now.
  let current = null;
  try {
    const cur = await api("GET", `/v1/appStoreVersions/${version.id}/build?fields[builds]=version`);
    current = cur && cur.data ? cur.data : null;
  } catch {
    /* no build attached yet */
  }

  const builds = await api(
    "GET",
    `/v1/builds?filter[app]=${appId}&limit=20&sort=-version&fields[builds]=version,processingState,expired`,
  );
  const target = (builds.data || []).find((b) => String(b.attributes.version) === WANT);
  if (!target) fail(`Apple has no build ${WANT} for this app.`);

  rule("=");
  log(`VERSION ${vs}   state ${state}`);
  rule("=");
  log(`  currently attached : build ${current ? current.attributes.version : "(none)"}`);
  log(
    `  will attach        : build ${target.attributes.version}  ` +
      `(${target.attributes.processingState}, expired=${target.attributes.expired})`,
  );

  if (target.attributes.processingState !== "VALID") {
    fail(`Build ${WANT} is ${target.attributes.processingState}, not VALID. Wait for Apple.`);
  }
  if (target.attributes.expired) fail(`Build ${WANT} has expired.`);
  if (current && current.attributes.version === WANT) {
    log("");
    log("  Already attached. Nothing to do.");
    return 0;
  }

  if (!APPLY) {
    log("");
    log("  Dry run. To apply:");
    log(`    node ./scripts/set-version-build.mjs ${WANT} --apply`);
    log("");
    log("  This changes only which binary the version points at. It does not");
    log("  submit, and it leaves the submission and its 21 products untouched.");
    return 0;
  }

  log("");
  log(`  PATCH /v1/appStoreVersions/${version.id}/relationships/build`);
  try {
    await api("PATCH", `/v1/appStoreVersions/${version.id}/relationships/build`, {
      data: { type: "builds", id: target.id },
    });
  } catch (e) {
    log("");
    log(`  Apple refused: ${e.where} -> HTTP ${e.status}`);
    log(`  ${String(e.body).slice(0, 700)}`);
    log("");
    log("  If this is a state error, the version is locked by its submission.");
    log("  Remove the version item from the draft, swap the build, then re-add it:");
    log("    node ./scripts/attach-version-to-submission.mjs --detach");
    log(`    node ./scripts/set-version-build.mjs ${WANT} --apply`);
    log("    node ./scripts/attach-version-to-submission.mjs --apply");
    return 2;
  }

  const after = await api("GET", `/v1/appStoreVersions/${version.id}/build?fields[builds]=version`);
  const now = after && after.data ? after.data.attributes.version : "(none)";
  log("");
  log(`  DONE — version ${vs} now points at build ${now}.`);
  if (String(now) !== WANT) fail("The read-back disagrees. Check App Store Connect.");
  return 0;
}

main()
  .then(async (code) => {
    const d = globalThis[Symbol.for("undici.globalDispatcher.1")];
    if (d && typeof d.close === "function") {
      try {
        await d.close();
      } catch {
        /* already closed */
      }
    }
    process.exitCode = code;
  })
  .catch((e) => {
    process.stderr.write(`\n${e.where || ""} ${e.status || ""}\n${e.body || e.stack || e.message}\n`);
    process.exitCode = 1;
  });
