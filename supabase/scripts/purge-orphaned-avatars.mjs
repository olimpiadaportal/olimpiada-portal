#!/usr/bin/env node
// =============================================================================
// ONE-OFF: remove avatar objects whose owner no longer exists.
//
// WHY A SCRIPT AND NOT A MIGRATION. Deleting a row from `storage.objects` in SQL
// removes the METADATA, not the file. The bytes live in Supabase Storage's
// backing store and are only released through the Storage API, so a SQL-only
// cleanup would leave every orphaned image exactly where it is while making it
// invisible to the query that would have found it again. This is the one job
// that genuinely cannot be a migration.
//
// WHAT IS ORPHANED, AND WHY IT MATTERS MORE THAN IT SOUNDS.
//   child-avatars/students/<student_profile_id>/…   PRIVATE bucket. Orphaned
//       when that students row is gone. These are PHOTOGRAPHS OF CHILDREN whose
//       accounts were deleted; the account went, the picture stayed.
//   profile-avatars/<auth_user_id>/…                PUBLIC bucket. Orphaned when
//       that auth user is gone. Worse: a public bucket means these are readable
//       at a stable URL by anyone, right now, with no account at all. Before
//       migration 096 a child's own upload landed here too.
//
// The cause is fixed forward: deleteParentAccountCore now purges a family's
// objects BEFORE deleting their rows. This clears what accumulated before that.
//
// READ-ONLY BY DEFAULT. Prints what it would delete and changes nothing until
// --apply. Safe to re-run; a second pass finds nothing.
//
// USAGE
//   node ./supabase/scripts/purge-orphaned-avatars.mjs            # dry run
//   node ./supabase/scripts/purge-orphaned-avatars.mjs --apply
//
// CREDENTIALS are read from web-app/.env.local (NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY) or from the environment. Nothing is ever printed:
// the key is used and never logged, and object paths are shown with their uuids
// masked so a terminal scrollback cannot identify a child.
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const CHILD_BUCKET = "child-avatars";
const PARENT_BUCKET = "profile-avatars";
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const apply = process.argv.includes("--apply");

function log(line = "") {
  process.stdout.write(`${line}\n`);
}

/** Paths are shown with uuids masked — scrollback must not identify a child. */
function safePath(path) {
  return path.replace(UUID_RE, "<uuid>");
}

// -----------------------------------------------------------------------------
// Credentials
// -----------------------------------------------------------------------------
function loadEnv() {
  const out = { ...process.env };
  const envFile = join(REPO, "web-app", ".env.local");
  if (existsSync(envFile)) {
    for (const raw of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in out) || !out[key]) out[key] = value;
    }
  }
  const url = (out.NEXT_PUBLIC_SUPABASE_URL || out.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = out.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    process.stderr.write(
      "\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n" +
        "Both normally live in web-app/.env.local.\n",
    );
    process.exit(2);
  }
  return { url, key };
}

// -----------------------------------------------------------------------------
// The database says what is orphaned; Storage does the removing.
// -----------------------------------------------------------------------------
function dbQuery(sql) {
  const dbUrl = process.env.OLIMPIADA_PROD_DB_URL;
  if (!dbUrl) {
    process.stderr.write("\nOLIMPIADA_PROD_DB_URL is not set.\n");
    process.exit(2);
  }
  try {
    return execFileSync("psql", [dbUrl, "-tAc", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const raw = String((error && error.stderr) || (error && error.message) || "");
    // psql echoes the connection string in some errors — never let it out.
    process.stderr.write(`\npsql failed: ${raw.split(dbUrl).join("<redacted>").split("\n")[0]}\n`);
    process.exit(2);
  }
}

function orphanedPaths() {
  // A child object is orphaned when no students row owns its path prefix; a
  // parent object when no auth user owns its prefix. Both predicates are
  // "nothing references this", never "this looks old" — an object belonging to
  // a live account can never match.
  const rows = dbQuery(`
    select o.bucket_id || '|' || o.name
      from storage.objects o
     where (
             o.bucket_id = '${CHILD_BUCKET}'
         and not exists (
               select 1 from public.students s
                where o.name like 'students/' || s.profile_id::text || '/%'
             )
           )
        or (
             o.bucket_id = '${PARENT_BUCKET}'
         and not exists (
               select 1 from auth.users u
                where o.name like u.id::text || '/%'
             )
           )
     order by 1;
  `);
  // SPLIT ON \r?\n, NOT \n. psql on Windows returns CRLF, so splitting on "\n"
  // leaves a trailing \r on every row except the last. The carriage return then
  // percent-encodes into the delete URL as %0D and Storage answers
  // "400 Object not found" — for every object except the final one, which is
  // exactly the "deleted 1 of N" signature this produced twice before anyone
  // looked at WHICH one survived.
  return rows
    ? rows
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const at = line.indexOf("|");
          return { bucket: line.slice(0, at).trim(), path: line.slice(at + 1).trim() };
        })
    : [];
}

/**
 * Delete objects ONE AT A TIME, and report each individually.
 *
 * WHY NOT THE BULK ENDPOINT. The first version of this script POSTed every path
 * to `DELETE /storage/v1/object/<bucket>` with a `{prefixes: [...]}` body and
 * trusted `res.ok`. Against production that returned 200 while removing exactly
 * ONE of eight objects — the run printed "deleted 8 of 8" and only the
 * verification pass caught it. A 2xx from that endpoint does not mean the
 * objects are gone; the per-object outcome is in the body, and a partial
 * failure looks identical to a success from the status line alone.
 *
 * Per-object DELETE has one status per file, so "it worked" is a fact rather
 * than an assumption. Eight extra round trips is a trivial price for that.
 */
async function removeObject(cfg, bucket, path) {
  const url =
    `${cfg.url}/storage/v1/object/${encodeURIComponent(bucket)}/` +
    path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(url, {
    method: "DELETE",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
  });
  // 404 = already gone, which is the outcome we want.
  if (res.ok || res.status === 404) return null;
  let detail = "";
  try {
    const body = await res.json();
    if (body && typeof body.message === "string") detail = `: ${body.message.slice(0, 80)}`;
  } catch {
    /* non-JSON body; the status is the signal */
  }
  return `HTTP ${res.status}${detail}`;
}

// -----------------------------------------------------------------------------
async function main() {
  const cfg = loadEnv();

  log("=".repeat(78));
  log(apply ? "APPLY — orphaned avatar objects WILL be deleted" : "DRY RUN — nothing is deleted");
  log("=".repeat(78));
  log();

  const orphans = orphanedPaths();
  if (orphans.length === 0) {
    log("  No orphaned avatar objects. Nothing to do.");
    return 0;
  }

  const byBucket = new Map();
  for (const o of orphans) {
    if (!byBucket.has(o.bucket)) byBucket.set(o.bucket, []);
    byBucket.get(o.bucket).push(o.path);
  }

  for (const [bucket, paths] of byBucket) {
    const visibility = bucket === PARENT_BUCKET ? "PUBLIC — world-readable today" : "private";
    log(`  ${bucket} (${visibility}): ${paths.length} orphaned object(s)`);
    for (const p of paths) log(`      ${safePath(p)}`);
    log();
  }

  if (!apply) {
    log("-".repeat(78));
    log(`${orphans.length} object(s) would be deleted. Re-run with --apply to delete them.`);
    return 0;
  }

  let removed = 0;
  const failures = [];
  for (const [bucket, paths] of byBucket) {
    for (const path of paths) {
      let problem;
      try {
        problem = await removeObject(cfg, bucket, path);
      } catch (error) {
        problem = error && error.message ? error.message : "threw";
      }
      if (problem) {
        failures.push(`${bucket}/${safePath(path)} — ${problem}`);
      } else {
        removed += 1;
      }
    }
    log(`  ${bucket}: ${paths.length} attempted`);
  }

  log();
  log("-".repeat(78));
  log(`deleted ${removed} of ${orphans.length}`);
  if (failures.length) {
    for (const f of failures) log(`  FAILED ${f}`);
    return 1;
  }

  // Prove it, rather than trusting the API's 200.
  const left = orphanedPaths();
  log(left.length === 0 ? "verified: no orphaned avatar objects remain" : `WARNING: ${left.length} remain`);
  return left.length === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`\nfailed: ${error && error.message}\n`);
    process.exitCode = 2;
  });
