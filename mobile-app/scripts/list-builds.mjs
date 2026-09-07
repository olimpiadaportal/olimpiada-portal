#!/usr/bin/env node
// =============================================================================
// WHAT DOES APPLE ACTUALLY HOLD? — every build, newest first, with its real
// processing state.
//
// `eas submit` reports success once it has handed the binary to Apple, and
// TestFlight then shows nothing at all until Apple finishes processing. That gap
// is indistinguishable from a failed upload if you only watch the web UI, and it
// is exactly when the temptation to re-submit (or worse, re-build) is strongest.
// This asks Apple.
//
// PROCESSING STATES: PROCESSING (Apple is working; wait), VALID (ready to
// select and submit), FAILED (Apple rejected the binary — the reason arrives by
// email, not here), INVALID (unusable).
//
// USAGE (from mobile-app/)
//   node ./scripts/list-builds.mjs
//
// Reads APP_STORE_CONNECT_ISSUER_ID / _KEY_ID / _APP_ID and either
// APP_STORE_CONNECT_P8_PATH (a file) or APP_STORE_CONNECT_PRIVATE_KEY (the PEM).
// Read-only: one GET.
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import process from "node:process";

const log = (m = "") => process.stdout.write(`${m}\n`);
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
    dsaEncoding: "ieee-p1363", // DER yields a bare 401
  });
  return `${input}.${b64u(sig)}`;
}

async function main() {
  const g = (n) => (process.env[n] || "").trim();
  const issuerId = g("APP_STORE_CONNECT_ISSUER_ID");
  const keyId = g("APP_STORE_CONNECT_KEY_ID");
  const appId = g("APP_STORE_CONNECT_APP_ID");
  const p8Path = g("APP_STORE_CONNECT_P8_PATH");
  let pem = g("APP_STORE_CONNECT_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (!pem && p8Path && existsSync(p8Path)) pem = readFileSync(p8Path, "utf8");

  if (!issuerId || !keyId || !appId || !pem) {
    fail("Need APP_STORE_CONNECT_ISSUER_ID, _KEY_ID, _APP_ID and a private key.");
  }

  const token = makeToken({ issuerId, keyId, privateKeyPem: pem });
  const url =
    `https://api.appstoreconnect.apple.com/v1/builds` +
    `?filter[app]=${appId}&limit=10&sort=-version` +
    `&fields[builds]=version,uploadedDate,processingState,expired`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) {
    fail(`HTTP ${res.status}\n${text.slice(0, 600)}`);
  }
  const json = JSON.parse(text);

  log("BUILD   STATE           UPLOADED                   EXPIRED");
  log("-".repeat(64));
  for (const b of json.data || []) {
    const a = b.attributes || {};
    log(
      `${String(a.version).padEnd(7)} ${String(a.processingState).padEnd(15)} ` +
        `${String(a.uploadedDate || "").padEnd(26)} ${a.expired}`,
    );
  }
  if (!(json.data || []).length) log("(no builds returned)");
  log("");
  log("PROCESSING = Apple is still working; VALID = ready to select and submit;");
  log("FAILED/INVALID = Apple rejected the binary and emails the reason.");
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
    process.stderr.write(`\n${e.stack || e.message}\n`);
    process.exitCode = 1;
  });
