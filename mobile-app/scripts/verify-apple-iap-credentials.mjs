#!/usr/bin/env node
// =============================================================================
// PROVE THE APPLE IN-APP PURCHASE CREDENTIALS WORK — WITHOUT A DEVICE.
//
// The purchase rail has never executed once in production (0 rows in
// iap_purchase_intents), so nothing has ever confirmed that the six
// APPLE_IAP_* values actually authenticate against Apple. Every failure mode
// there is silent and reassuring: getAppleIapConfig() returns null, every
// redeem answers 503, and the app renders a calm "pending" line with no
// diagnostic anywhere. A reviewer would read that as a purchase that took their
// money and did nothing.
//
// Apple's App Store Server API exposes "Request a Test Notification", which
// needs no transaction, no device and no sandbox Apple ID. Calling it exercises
// the ENTIRE credential path — issuer id, key id, the ES256 private key and the
// bundle id — and then makes Apple POST a real notification to the webhook URL
// configured for the app, so the second call here also proves the server can
// receive and answer one.
//
// TWO THINGS THAT MAKE THIS FAIL FOR REASONS THAT LOOK LIKE BAD CREDENTIALS:
//
// 1. THE JWT NEEDS A `bid` CLAIM. The App Store Server API is not the App Store
//    Connect API: same signing algorithm and issuer, but the payload must carry
//    the bundle id. Omit it and Apple answers a bare 401, which reads exactly
//    like a wrong key.
// 2. ES256 MUST BE ieee-p1363, NOT DER. Node's crypto.sign defaults to DER for
//    EC keys and Apple rejects it — again as a bare 401.
//
// SANDBOX AND PRODUCTION ARE SEPARATE HOSTS with the same credentials. App
// Review buys in SANDBOX, so the sandbox result is the one that decides whether
// a reviewer's purchase can be verified at all.
//
// USAGE (from mobile-app/), with the six values from the Vercel production
// environment exported into THIS shell:
//   node ./scripts/verify-apple-iap-credentials.mjs
//
// Or, better, leave the secrets in the untracked env file they already live in:
//   node ./scripts/verify-apple-iap-credentials.mjs --env-file ../web-app/.env.local
//
// It is READ-ONLY against our own systems and creates nothing that costs money.
// It never prints a key, a token or any secret.
// =============================================================================
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import process from "node:process";

// THE CURRENT HOSTS, matching web-app/src/lib/payments/apple/environment.ts
// (APP_STORE_SERVER_API_BASE_URL). The `*.itunes.apple.com` pair is the LEGACY
// one that file keeps separately, and hitting it answers 404 on sandbox and 401
// on production — which reads exactly like broken credentials rather than a
// wrong hostname. The server itself uses the current pair, so a check on the
// legacy pair would prove nothing about it either way.
const HOSTS = {
  sandbox: "https://api.storekit-sandbox.apple.com",
  production: "https://api.storekit.apple.com",
};

const log = (m = "") => process.stdout.write(`${m}\n`);
const rule = (c = "-") => log(c.repeat(78));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(m) {
  process.stderr.write(`\nERROR\n${m}\n`);
  process.exit(2);
}

const b64u = (x) =>
  Buffer.from(x).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// The App Store SERVER API token. Differs from the App Store CONNECT one in
// exactly one way that matters: the `bid` claim. See trap 1 in the header.
function makeToken({ issuerId, keyId, bundleId, privateKeyPem }) {
  const now = Math.floor(Date.now() / 1000);
  const input =
    `${b64u(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }))}.` +
    `${b64u(
      JSON.stringify({
        iss: issuerId,
        iat: now,
        exp: now + 600,
        aud: "appstoreconnect-v1",
        bid: bundleId,
      }),
    )}`;
  const sig = crypto.sign("sha256", Buffer.from(input), {
    key: crypto.createPrivateKey(privateKeyPem),
    dsaEncoding: "ieee-p1363", // trap 2: DER yields a bare 401
  });
  return `${input}.${b64u(sig)}`;
}

async function call(host, path, token, method = "GET") {
  const res = await fetch(`${host}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  return { status: res.status, ok: res.ok, body };
}

function diagnose(status, body) {
  const code = body && (body.errorCode || body.errorMessage);

  // 4040007 IS NOT AN AUTH FAILURE — it is the best possible outcome short of a
  // delivered notification. Apple returns it when the app has no App Store
  // Server Notifications V2 URL for this environment, which means the token was
  // ACCEPTED: the key, the issuer and the bundle id are all correct. Reading the
  // bare "404" as bad credentials sends you rewriting working configuration.
  // (4040010 is the neighbouring code for the same condition.)
  if (status === 404 && (String(code) === "4040007" || String(code) === "4040010")) {
    return [
      "404 / 4040010 — ServerNotificationURLNotFound.",
      "  THE CREDENTIALS AUTHENTICATED. Apple accepted the key, the issuer and the",
      "  bundle id, and refused only because no App Store Server Notifications V2",
      "  URL is configured for this environment. That is a separate gap: it does",
      "  not stop a purchase being verified or granted, but renewals, refunds and",
      "  revocations would never reach the server.",
      "  Set it in App Store Connect -> App Information -> App Store Server",
      "  Notifications (Production and Sandbox URLs).",
    ].join("\n");
  }
  if (status === 401) {
    return [
      "401 UNAUTHENTICATED — Apple rejected the token itself. In order of likelihood:",
      "  * APPLE_IAP_KEY_ID does not match the key APPLE_IAP_PRIVATE_KEY came from",
      "  * APPLE_IAP_ISSUER_ID is the App Store CONNECT issuer, not the IN-APP",
      "    PURCHASE one (Users and Access -> Integrations -> In-App Purchase)",
      "  * the private key is not the .p8 body, or lost its newlines in the env var",
      "  * APPLE_IAP_BUNDLE_ID is wrong (it is a signed claim, not just a lookup)",
    ].join("\n");
  }
  if (status === 403) return "403 — the key exists but lacks access to this app.";
  if (status === 404) {
    return "404 — endpoint or app not found. Check APPLE_IAP_BUNDLE_ID matches ai.olympiq.app.";
  }
  if (status === 429) return "429 — rate limited by Apple. Wait a minute and retry.";
  if (code) return `Apple said: ${code}`;
  return `HTTP ${status}`;
}

// Node's own --env-file gives up on a multi-line quoted value and yields an
// EMPTY string for it, which then reads as "the variable is missing" rather than
// "the parser stopped at the first newline". A PEM is always multi-line, so that
// is precisely the one value it cannot load. This parser handles the quoted
// multi-line form, which is how a private key is stored in a .env file.
function loadEnvFile(path) {
  let text;
  try {
    // CRLF NORMALISED FIRST. On Windows every line ends "\r\n", and a trailing
    // [ \t]*$ does not match the \r — so a multi-line quoted value never finds
    // its closing quote and silently yields nothing, which then reads as "the
    // variable is missing". The \r would also survive INSIDE the PEM and break
    // the key parse. This is the same CRLF trap that has bitten twice already in
    // this repo's tooling.
    text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  } catch (e) {
    fail(`Could not read ${path}: ${e.message}`);
  }
  const out = {};
  // KEY="....", KEY='....' (either may span lines), or KEY=bare-value.
  const re = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(?:"([\s\S]*?)"|'([\s\S]*?)'|([^\r\n#]*))[ \t]*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const [, key, dq, sq, bare] = m;
    out[key] = dq !== undefined ? dq : sq !== undefined ? sq : (bare ?? "").trim();
  }
  return out;
}

function readEnv() {
  // --env-file lets the values stay in an untracked file instead of being pasted
  // into a shell, where a private key would sit in history.
  const i = process.argv.indexOf("--env-file");
  if (i >= 0) {
    const path = process.argv[i + 1];
    if (!path) fail("--env-file needs a path.");
    const loaded = loadEnvFile(path);
    let n = 0;
    for (const [k, v] of Object.entries(loaded)) {
      // THE FILE FILLS GAPS; IT NEVER OVERRIDES. A value already exported into
      // this shell wins, so a single candidate can be tried against the rest of
      // the real configuration without editing the file or Vercel — which is the
      // only cheap way to test which issuer id is the right one.
      if (k.startsWith("APPLE_IAP_") && v && !process.env[k]) {
        process.env[k] = v;
        n += 1;
      }
    }
    log(`  loaded ${n} APPLE_IAP_* values from ${path} (already-set values kept)`);
  }
  const g = (n) => (process.env[n] || "").trim();
  const env = {
    bundleId: g("APPLE_IAP_BUNDLE_ID"),
    issuerId: g("APPLE_IAP_ISSUER_ID"),
    keyId: g("APPLE_IAP_KEY_ID"),
    appAppleId: g("APPLE_IAP_APP_APPLE_ID"),
    privateKey: g("APPLE_IAP_PRIVATE_KEY"),
  };

  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    fail(
      `Missing: ${missing.join(", ")}\n\n` +
        `Export the SIX APPLE_IAP_* values from the Vercel PRODUCTION environment\n` +
        `into this shell first. In PowerShell:\n\n` +
        `  $env:APPLE_IAP_BUNDLE_ID   = "ai.olympiq.app"\n` +
        `  $env:APPLE_IAP_ISSUER_ID   = "..."\n` +
        `  $env:APPLE_IAP_KEY_ID      = "..."\n` +
        `  $env:APPLE_IAP_APP_APPLE_ID= "6798527831"\n` +
        `  $env:APPLE_IAP_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\`n...\`n-----END PRIVATE KEY-----"\n\n` +
        `They stay in this terminal. Nothing is written to disk and nothing is printed back.`,
    );
  }

  // Shape checks BEFORE calling Apple, because Apple answers every one of these
  // with the same bare 401 and the message would send you hunting the wrong value.
  const problems = [];
  if (!/^[0-9a-fA-F-]{36}$/.test(env.issuerId)) {
    problems.push("APPLE_IAP_ISSUER_ID is not a 36-character uuid.");
  }
  if (!/^[A-Z0-9]{10}$/.test(env.keyId)) {
    problems.push("APPLE_IAP_KEY_ID is not 10 uppercase alphanumerics.");
  }
  if (!/^\d+$/.test(env.appAppleId)) {
    problems.push("APPLE_IAP_APP_APPLE_ID is not digits only.");
  }
  if (!env.privateKey.includes("BEGIN") || !env.privateKey.includes("PRIVATE KEY")) {
    problems.push("APPLE_IAP_PRIVATE_KEY does not look like a PEM block.");
  }
  if (problems.length) fail(problems.join("\n"));

  // A PEM whose newlines became the two characters backslash-n is the single
  // most common way this variable arrives broken from a dashboard paste.
  env.privateKey = env.privateKey.replace(/\\n/g, "\n");
  try {
    crypto.createPrivateKey(env.privateKey);
  } catch (e) {
    fail(
      `APPLE_IAP_PRIVATE_KEY is not a usable key: ${e.message}\n` +
        `If it was pasted from a dashboard, its newlines may have been flattened.`,
    );
  }
  return env;
}

async function probe(name, host, env) {
  rule("=");
  log(`${name.toUpperCase()}  (${host})`);
  rule("=");

  const token = makeToken({
    issuerId: env.issuerId,
    keyId: env.keyId,
    bundleId: env.bundleId,
    privateKeyPem: env.privateKey,
  });

  log("  requesting a test notification ...");
  const req = await call(host, "/inApps/v1/notifications/test", token, "POST");
  if (!req.ok) {
    // Apple's own words first, conclusions second. The errorCode is the datum
    // that separates "wrong credentials" from "credentials fine, something else
    // missing", and a summary that hides it sends you rewriting working config.
    log(`  REFUSED — HTTP ${req.status}`);
    log(`    Apple's response: ${JSON.stringify(req.body)}`);
    log(diagnose(req.status, req.body).split("\n").map((l) => `    ${l}`).join("\n"));
    // 4040010 means the token was ACCEPTED and only the notification URL is
    // absent, so the credentials themselves are proven good.
    const c = String(req.body && req.body.errorCode);
    const codeOk = req.status === 404 && (c === "4040007" || c === "4040010");
    return { name, credentialsOk: codeOk, webhookOk: codeOk ? false : null };
  }

  const tokenId = req.body && req.body.testNotificationToken;
  if (!tokenId) {
    log("  Apple accepted the request but returned no testNotificationToken.");
    return { name, credentialsOk: true, webhookOk: null };
  }
  log("  CREDENTIALS ACCEPTED — Apple authenticated the key and issued a token.");

  // The delivery result is asynchronous. Apple documents no guaranteed latency,
  // so poll briefly: a slow webhook is not a failed one.
  log("  waiting for Apple to deliver it to the configured webhook ...");
  for (let i = 0; i < 6; i += 1) {
    await sleep(2500);
    const res = await call(host, `/inApps/v1/notifications/test/${encodeURIComponent(tokenId)}`, token);
    if (!res.ok) continue;
    const hist = res.body && Array.isArray(res.body.sendAttempts) ? res.body.sendAttempts : [];
    if (hist.length === 0) continue;
    const last = hist[hist.length - 1];
    const result = last && last.sendAttemptResult;
    if (!result) continue;
    if (result === "SUCCESS") {
      log("  WEBHOOK OK — Apple delivered the notification and the server answered 200.");
      return { name, credentialsOk: true, webhookOk: true };
    }
    log(`  WEBHOOK FAILED — Apple reports: ${result}`);
    log("    The credentials are fine; the notification URL is not answering.");
    log("    Check the App Store Server Notifications V2 URL in App Store Connect");
    log("    (App Information -> App Store Server Notifications) and that the route");
    log("    it points at returns 200.");
    return { name, credentialsOk: true, webhookOk: false };
  }
  log("  Delivery result not available yet — not a failure, just slower than we waited.");
  return { name, credentialsOk: true, webhookOk: null };
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

async function main() {
  const env = readEnv();

  rule("=");
  log("APPLE IN-APP PURCHASE CREDENTIAL CHECK");
  rule("=");
  log(`  bundle id     ${env.bundleId}`);
  log(`  app apple id  ${env.appAppleId}`);
  log(`  key id        ${env.keyId}`);
  log(`  issuer id     ${env.issuerId.slice(0, 8)}… (redacted)`);
  log(`  private key   loaded, ${crypto.createPrivateKey(env.privateKey).asymmetricKeyType} key`);
  log("");

  const results = [];
  for (const [name, host] of Object.entries(HOSTS)) {
    results.push(await probe(name, host, env));
    log("");
  }

  rule("=");
  log("VERDICT");
  rule("=");
  const sandbox = results.find((r) => r.name === "sandbox");
  for (const r of results) {
    const cred = r.credentialsOk ? "credentials OK" : "CREDENTIALS REFUSED";
    const hook =
      r.webhookOk === true ? "webhook OK" : r.webhookOk === false ? "WEBHOOK FAILING" : "webhook unknown";
    log(`  ${r.name.padEnd(11)} ${cred.padEnd(20)} ${hook}`);
  }
  log("");
  log("  A production 401 on an app that has never been released is EXPECTED and");
  log("  harmless: the production Server API does not know an app with no live");
  log("  version. App Review buys in sandbox, which is the row that decides this.");
  log("");
  if (sandbox && sandbox.credentialsOk) {
    log("  App Review buys in SANDBOX, and sandbox authenticated. The server can");
    log("  verify a reviewer's purchase with Apple and grant access.");
    log("");
    log("  Still unproven without a device: that StoreKit prices the 21 products on");
    log("  the phone, and that expo-iap round-trips appAccountToken. Neither can be");
    log("  checked from here.");
    return 0;
  }
  log("  SANDBOX REFUSED THE CREDENTIALS. A reviewer's purchase would be charged and");
  log("  produce no access. Fix this before submitting — it is the exact failure");
  log("  that reads as a broken in-app purchase.");
  return 2;
}

main()
  .then(async (code) => {
    await shutdown();
    process.exitCode = code;
  })
  .catch(async (e) => {
    await shutdown();
    process.stderr.write(`\n${e.stack || e.message}\n`);
    process.exitCode = 1;
  });
