import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DENIED_URLS,
  IGNORED_ERRORS,
  MAX_TEXT_LENGTH,
  redactText,
  scrubBreadcrumb,
  scrubEvent,
  scrubUrl,
  type ScrubEvent,
} from "../scrub";

// =====================================================================
// These tests are the regression guard on a PRIVACY control, not on a
// formatting helper. Every case below is a string this admin panel can
// genuinely produce: a Supabase auth error carrying a child's synthetic
// login address, a Postgres DETAIL carrying the value that collided, an
// Accounts export throwing with rows in scope, a bulk import posting 12 MB
// of question bodies through a Server Action.
//
// The assertions are written as "the sensitive substring is ABSENT", not as
// "the output equals X", so a change to the replacement token cannot quietly
// turn a leak test green.
// =====================================================================

// THE SHAPE THAT CARRIES A WHOLE DATABASE ROW, exactly as the verifier drove it
// through beforeSend. This panel is the worst case for it: staff read real
// family data here, the Accounts export builds a spreadsheet of exactly these
// columns, and bulk import throws on row CONTENT.
const FAILING_ROW =
  "Failing row contains (a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d, Aylin, " +
  "Məmmədova, 48310277, Bakı, Nəsimi, female, 7)";

/** Every part of that row no regex could ever recognise on its own. */
const ROW_WORDS = ["Aylin", "Məmmədova", "Bakı", "Nəsimi", "female"];

const SERVICE_ROLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ.3mB7QdJk1x2rVv0pLNa9yYcTfHgWuEoZs4Qi8KbXlAM";

describe("redactText — secrets", () => {
  it("removes a service-role JWT", () => {
    const out = redactText(`getUser failed with Bearer ${SERVICE_ROLE_JWT}`);
    expect(out).not.toContain(SERVICE_ROLE_JWT);
    expect(out).not.toContain("eyJhbGciOi");
  });

  it("removes Supabase's newer key formats", () => {
    const out = redactText("key=sb_secret_9aZq3TmPwLkR2Vd8XcNb1Y used");
    expect(out).not.toContain("sb_secret_9aZq3TmPwLkR2Vd8XcNb1Y");
  });

  it("removes a Postgres connection string", () => {
    const url =
      "postgresql://postgres.abcdefghijkl:s3cr3tPass@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
    const out = redactText(`connection to ${url} failed`);
    expect(out).not.toContain("s3cr3tPass");
    expect(out).not.toContain("pooler.supabase.com");
  });

  it("removes inline credentials from any URL scheme", () => {
    const out = redactText("redis://admin:hunter2@cache.internal:6379/0 refused");
    expect(out).not.toContain("hunter2");
  });

  it("removes key=value secrets whatever they are called", () => {
    const out = redactText(
      'request failed {"apikey":"abc123def456","password":"Parent!2026","token":"tok_live_99"}',
    );
    expect(out).not.toContain("abc123def456");
    expect(out).not.toContain("Parent!2026");
    expect(out).not.toContain("tok_live_99");
  });

  it("keeps the readable half of a configuration error", () => {
    // The createAdminClient() guard message must stay diagnosable: it names a
    // variable, it does not disclose a value.
    const out = redactText(
      "SUPABASE_SERVICE_ROLE_KEY is not configured (server-only).",
    );
    expect(out).toContain("SUPABASE_SERVICE_ROLE_KEY is not configured");
  });
});

describe("redactText — the Postgres row detail", () => {
  it("wipes the verifier's exact failing row, ordinary words and all", () => {
    const out = redactText(FAILING_ROW);
    for (const word of ROW_WORDS) expect(out, `leaked: ${word}`).not.toContain(word);
    expect(out).not.toContain("48310277");
    expect(out).not.toContain("a1b2c3d4");
    expect(out).toBe("Failing row contains ([redacted])");
  });

  it("wipes every sibling shape a unique violation produces", () => {
    const message =
      'duplicate key value violates unique constraint "students_child_unique_id_key"\n' +
      "DETAIL: Key (child_unique_id)=(48310277) already exists.\n" +
      `${FAILING_ROW}.`;
    const out = redactText(message);
    for (const word of ROW_WORDS) expect(out, `leaked: ${word}`).not.toContain(word);
    expect(out).toContain("Key ([redacted])=([redacted])");
    expect(out).toContain("Failing row contains ([redacted])");
    // The constraint name is the half anyone actually debugs from.
    expect(out).toContain("students_child_unique_id_key");
  });

  it("wipes a composite key and a foreign-key detail", () => {
    const out = redactText(
      "Key (profile_id, subject_id)=(a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d, " +
        '9f8c1d2e-1111-4222-8333-444455556666) is not present in table "subjects".',
    );
    expect(out).not.toContain("a1b2c3d4");
    expect(out).toContain("Key ([redacted])=([redacted])");
    expect(out).toContain("subjects");
  });

  it("is case- and whitespace-tolerant, because the wire format is not ours", () => {
    expect(redactText("KEY (email)=(a@b.com) already exists")).toContain(
      "Key ([redacted])=([redacted])",
    );
    expect(redactText("failing row contains(Aylin, Bakı)")).not.toContain("Aylin");
  });

  it("stays idempotent — each replacement is a fixed point of its own rule", () => {
    const once = redactText(FAILING_ROW);
    expect(redactText(once)).toBe(once);
  });

  it("carries the row rules into the issue TITLE, not just into redactText", () => {
    // The field that matters: the exception VALUE is what a human reads in the
    // Sentry issue list, and no SDK option filters it.
    const out = scrubEvent({
      exception: { values: [{ type: "PostgrestError", value: FAILING_ROW }] },
    });
    const serialized = JSON.stringify(out);
    for (const word of ROW_WORDS) {
      expect(serialized, `leaked: ${word}`).not.toContain(word);
    }
    expect(out?.exception?.values?.[0]?.type).toBe("PostgrestError");
  });

  it("carries them into the message, the logentry and a breadcrumb too", () => {
    const out = scrubEvent({
      message: FAILING_ROW,
      logentry: { message: `import row 137: ${FAILING_ROW}` },
      breadcrumbs: [{ category: "xhr", message: FAILING_ROW, data: { detail: FAILING_ROW } }],
    });
    const serialized = JSON.stringify(out);
    for (const word of ROW_WORDS) {
      expect(serialized, `leaked: ${word}`).not.toContain(word);
    }
    expect(out?.message).toBe("Failing row contains ([redacted])");
  });

  it("no longer leaks the columns after a value's own close-parenthesis", () => {
    // This used to be recorded here as an accepted residue: `[^)]*` stopped
    // at the first `)`, so a school written "132 (tam orta) məktəb" ended the
    // match early and every column after it fell back to the shape rules —
    // which is to say the city, the rayon and the gender shipped, because
    // those have no shape. The rule is a balanced matcher now. The full
    // treatment of this case is in "a value that carries its own",
    // parentheses" below; this assertion stays where the residue was
    // recorded, so the claim and its retraction sit in the same place.
    const out = redactText("Failing row contains (a1b2, 132 (tam orta) məktəb, 48310277)");
    expect(out).toBe("Failing row contains ([redacted])");
  });
});

describe("redactText — family data", () => {
  it("removes a child's synthetic login address, and the 8-digit id inside it", () => {
    const out = redactText(
      'duplicate key value violates unique constraint: Key (email)=(c40318827@children.invalid) already exists.',
    );
    expect(out).not.toContain("40318827");
    expect(out).not.toContain("children.invalid");
  });

  it("removes a parent email address", () => {
    const out = redactText("User not found: leyla.mammadova+2@gmail.com");
    expect(out).not.toContain("leyla.mammadova");
    expect(out).not.toContain("gmail.com");
  });

  it("removes an E.164 phone number", () => {
    const out = redactText("phone +994501234567 fails chk_profiles_phone_e164");
    expect(out).not.toContain("994501234567");
  });

  it("removes a bare 8-digit child login id", () => {
    const out = redactText("child_unique_id 40318827 not found");
    expect(out).not.toContain("40318827");
  });

  it("removes UUIDs, and does so BEFORE the 8-digit rule can shred them", () => {
    // An all-numeric first group is the case that proves the ordering: if the
    // 8-digit rule ran first it would eat "12345678" and leave a mangled tail.
    const out = redactText(
      "student 12345678-90ab-4cde-8f01-234567890abc has no credentials",
    );
    expect(out).not.toContain("12345678");
    expect(out).not.toContain("234567890abc");
    expect(out).toContain("[redacted:uuid]");
  });

  it("does not mangle an ordinary sentence", () => {
    const message = "Failed to load the question pool for grade 9, term 2.";
    expect(redactText(message)).toBe(message);
  });
});

describe("redactText — payload cap", () => {
  it("truncates anything long enough to be a payload rather than a message", () => {
    const rows = JSON.stringify(
      Array.from({ length: 400 }, (_, i) => ({ q: `question body ${i}` })),
    );
    const out = redactText(rows);
    expect(out.length).toBeLessThan(MAX_TEXT_LENGTH + 32);
    expect(out).toContain("[truncated]");
  });
});

describe("scrubUrl", () => {
  it("drops the query string entirely", () => {
    // The Accounts search box puts what staff typed into ?q= — commonly a
    // child's name, which no parameter-name allowlist would catch.
    expect(scrubUrl("https://admin.example/accounts?q=Aysu%20M%C9%99mm%C9%99dova")).toBe(
      "https://admin.example/accounts",
    );
  });

  it("drops the fragment", () => {
    expect(scrubUrl("/accounts#child-40318827")).toBe("/accounts");
  });

  it("collapses UUID path segments", () => {
    expect(scrubUrl("/accounts/9f8c1d2e-1111-4222-8333-444455556666/edit")).toBe(
      "/accounts/:id/edit",
    );
  });

  it("collapses long numeric path segments", () => {
    expect(scrubUrl("/accounts/child/40318827")).toBe("/accounts/child/:id");
  });

  it("redacts anything left in the path", () => {
    const out = scrubUrl("/accounts/leyla@example.com");
    expect(out).not.toContain("leyla@example.com");
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs outright", () => {
    expect(
      scrubBreadcrumb({
        category: "console",
        message: "update failed: Key (child_unique_id)=(40318827) already exists",
      }),
    ).toBeNull();
  });

  it("collapses the url on a fetch breadcrumb", () => {
    const crumb = scrubBreadcrumb({
      category: "fetch",
      data: { url: "/accounts?q=Aysu", method: "GET", status_code: 500 },
    });
    expect(crumb?.data?.url).toBe("/accounts");
    expect(crumb?.data?.status_code).toBe(500);
  });

  it("deletes nested objects, which is where a row payload would be", () => {
    const crumb = scrubBreadcrumb({
      category: "xhr",
      data: {
        url: "/api/import",
        body: { rows: [{ firstName: "Aysu", childUniqueId: "40318827" }] },
      },
    });
    expect(crumb?.data?.body).toBeUndefined();
  });

  it("redacts a DOM breadcrumb selector, which can carry an aria-label name", () => {
    const crumb = scrubBreadcrumb({
      category: "ui.click",
      message: 'button[aria-label="Aysu 40318827"]',
    });
    expect(crumb?.message).not.toContain("40318827");
  });
});

describe("scrubEvent — the categories that must never leave", () => {
  it("deletes identity, arbitrary extras and the whole request envelope", () => {
    const event: ScrubEvent = {
      message: "boom",
      user: { id: "9f8c1d2e-1111-4222-8333-444455556666", email: "p@example.com" },
      extra: { rows: [{ firstName: "Aysu", childUniqueId: "40318827" }] },
      request: {
        url: "https://admin.example/accounts?q=Aysu",
        method: "POST",
        data: { child_id: "40318827", password: "hunter2" },
        cookies: { "sb-abc-auth-token": SERVICE_ROLE_JWT },
        headers: { cookie: "sb-abc-auth-token=…", "user-agent": "Chrome" },
        query_string: "q=Aysu",
        env: { SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_JWT },
      },
    };

    const out = scrubEvent(event);

    expect(out).not.toBeNull();
    expect(out?.user).toBeUndefined();
    expect(out?.extra).toBeUndefined();
    expect(out?.request?.data).toBeUndefined();
    expect(out?.request?.cookies).toBeUndefined();
    expect(out?.request?.headers).toBeUndefined();
    expect(out?.request?.query_string).toBeUndefined();
    expect(out?.request?.env).toBeUndefined();
    expect(out?.request?.url).toBe("https://admin.example/accounts");
    expect(JSON.stringify(out)).not.toContain("Aysu");
    expect(JSON.stringify(out)).not.toContain("40318827");
    expect(JSON.stringify(out)).not.toContain(SERVICE_ROLE_JWT);
  });

  it("scrubs the exception value, which is the issue TITLE no breadcrumb filter reaches", () => {
    const out = scrubEvent({
      exception: {
        values: [
          {
            type: "AuthApiError",
            value:
              "A user with this email address has already been registered: c40318827@children.invalid",
          },
        ],
      },
    });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("40318827");
    expect(serialized).not.toContain("children.invalid");
    // Still diagnosable.
    expect(out?.exception?.values?.[0]?.type).toBe("AuthApiError");
  });

  it("strips stack-frame locals — the service-role key and DB URL path", () => {
    const out = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "fetch failed",
            stacktrace: {
              frames: [
                {
                  vars: {
                    serviceKey: SERVICE_ROLE_JWT,
                    dbUrl: "postgresql://postgres:pw@db.example:5432/postgres",
                  },
                },
                { vars: { url: "https://abc.supabase.co" } },
              ],
            },
          },
        ],
      },
    });

    const frames = out?.exception?.values?.[0]?.stacktrace?.frames ?? [];
    expect(frames).toHaveLength(2);
    for (const frame of frames) expect(frame.vars).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain(SERVICE_ROLE_JWT);
  });

  it("allowlists contexts and collapses the Next.js request path", () => {
    const out = scrubEvent({
      message: "boom",
      contexts: {
        trace: { trace_id: "abc" },
        nextjs: {
          request_path: "/accounts/9f8c1d2e-1111-4222-8333-444455556666?q=Aysu",
          router_kind: "App Router",
        },
        response: { headers: { cookie: "sb-abc-auth-token=live" } },
        accounts_export: { rows: 412, firstParent: "leyla@example.com" },
      },
    });

    expect(out?.contexts?.trace).toBeDefined();
    expect(out?.contexts?.response).toBeUndefined();
    expect(out?.contexts?.accounts_export).toBeUndefined();
    const nextjs = out?.contexts?.nextjs as { request_path: string };
    expect(nextjs.request_path).toBe("/accounts/:id");
  });

  it("redacts tags and the transaction name, and drops server_name", () => {
    const out = scrubEvent({
      message: "boom",
      server_name: "iad1-runtime-7",
      transaction: "GET /accounts/9f8c1d2e-1111-4222-8333-444455556666",
      tags: { parent_email: "leyla@example.com", subject: "math" },
    });
    expect(out?.server_name).toBeUndefined();
    expect(out?.transaction).not.toContain("9f8c1d2e");
    expect(out?.tags?.parent_email).not.toContain("leyla@example.com");
    expect(out?.tags?.subject).toBe("math");
  });

  it("filters console breadcrumbs off the event itself", () => {
    const out = scrubEvent({
      message: "boom",
      breadcrumbs: [
        { category: "console", message: "Key (child_unique_id)=(40318827)" },
        { category: "navigation", data: { from: "/accounts?q=Aysu", to: "/users" } },
      ],
    });
    expect(out?.breadcrumbs).toHaveLength(1);
    expect(out?.breadcrumbs?.[0]?.data?.from).toBe("/accounts");
    expect(JSON.stringify(out)).not.toContain("40318827");
  });

  it("drops an event carrying neither an exception nor a message", () => {
    expect(scrubEvent({ breadcrumbs: [] })).toBeNull();
  });
});

describe("scrubEvent — the key-name denylist, for values with no shape", () => {
  it("blanks a context field whose KEY names a person, and keeps the rest", () => {
    // `contexts.device.name` is the canonical example: on a staff laptop it is
    // "<a person>s MacBook", which redactText can never recognise. The nested
    // bag underneath `app` used to be skipped entirely by a
    // `typeof value !== "string"` guard.
    const out = scrubEvent({
      message: "boom",
      contexts: {
        device: {
          name: "Leyla MacBook Pro",
          model: "MacBookPro18,3",
          memory_size: 17179869184,
        },
        app: {
          app_version: "1.4.0",
          state: { selected: { childFirstName: "Aysu", childUniqueId: "40318827" } },
        },
      },
    });

    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("Leyla");
    expect(serialized).not.toContain("Aysu");
    expect(serialized).not.toContain("40318827");

    const device = out?.contexts?.device as { [k: string]: unknown };
    expect(device.name).toBe("[redacted]");
    // Over-redaction is the other way to fail: the diagnostics stay.
    expect(device.model).toBe("MacBookPro18,3");
    expect(device.memory_size).toBe(17179869184);
  });

  it("blanks tags whose KEY names a person attribute", () => {
    // Tags are INDEXED AND SEARCHABLE in Sentry, so this is the worst place for
    // a name to land — and every value here is an ordinary word.
    const out = scrubEvent({
      message: "boom",
      tags: {
        child_name: "Aysu",
        school: "Lerik şəhər 1 nömrəli tam orta məktəb",
        gender: "female",
        route: "accounts",
      },
    });
    expect(out?.tags?.child_name).toBe("[redacted]");
    expect(out?.tags?.school).toBe("[redacted]");
    expect(out?.tags?.gender).toBe("[redacted]");
    // A tag that names nothing personal is left alone.
    expect(out?.tags?.route).toBe("accounts");
  });

  it("blanks breadcrumb data whose KEY names a person attribute", () => {
    const crumb = scrubBreadcrumb({
      category: "ui.click",
      message: 'button[aria-label="Aysu Məmmədova 40318827"]',
      data: { child_name: "Aysu", school: "Lerik 1", status_code: 500 },
    });
    expect(crumb?.message).not.toContain("40318827");
    expect(crumb?.data?.child_name).toBe("[redacted]");
    expect(crumb?.data?.school).toBe("[redacted]");
    expect(crumb?.data?.status_code).toBe(500);
  });

  it("bounds the walk so a cyclic structure cannot hang beforeSend", () => {
    // A React fiber or an Error whose `cause` chain loops back reaches
    // beforeSend as a cycle. There is no timeout there and the app is already
    // on an error path.
    const cyclic: { [k: string]: unknown } = { ref: "40318827" };
    cyclic.self = cyclic;
    const out = scrubEvent({ message: "boom", contexts: { app: { frame: cyclic } } });
    expect(JSON.stringify(out)).not.toContain("40318827");
  });
});

describe("scrubEvent — the two admin-panel scenarios named in the brief", () => {
  it("an Accounts EXPORT that throws mid-workbook ships no rows", () => {
    // Shape of the real hazard: exceljs throws while the snapshot of parents
    // and children is still on the stack and in scope.
    const rows = Array.from({ length: 3 }, (_, i) => ({
      parentEmail: `parent${i}@example.com`,
      parentPhone: "+994501234567",
      childFirstName: "Aysu",
      childLastName: "Məmmədova",
      childUniqueId: `4031882${i}`,
      school: "Lerik şəhər 1 nömrəli tam orta məktəb",
      gender: "female",
    }));

    const out = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            // What exceljs actually throws — a position, not a payload.
            value: "Cannot add row 3 to worksheet 'Accounts'",
            stacktrace: {
              frames: [{ vars: { rows, parentEmail: rows[0]?.parentEmail } }],
            },
          },
        ],
      },
      extra: { snapshot: rows },
      contexts: { export: { rowCount: rows.length, sample: rows[0] } },
      request: { url: "/accounts/export", method: "POST", data: { rows } },
    });

    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("Aysu");
    expect(serialized).not.toContain("Məmmədova");
    expect(serialized).not.toContain("parent0@example.com");
    expect(serialized).not.toContain("994501234567");
    expect(serialized).not.toContain("Lerik");
    expect(serialized).not.toContain("40318820");

    // Every structured carrier is DELETED, not filtered. That distinction is
    // the point: a bare given name like "Aysu" has no machine-recognisable
    // shape, so redaction could never have caught it — only refusing to
    // collect the container it arrives in does.
    expect(out?.extra).toBeUndefined();
    expect(out?.request?.data).toBeUndefined();
    expect(out?.contexts?.export).toBeUndefined();
    expect(out?.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars).toBeUndefined();
  });

  it("documents the one residual: a name our own code writes into a message", () => {
    // KNOWN AND ACCEPTED. Nothing in this app currently throws with row
    // content in the message (the export and bulk-import paths throw
    // positions and counts), and no scrubber can recognise "Aysu" as a name.
    // The rule this encodes is for whoever writes the next throw: never
    // interpolate a person into an Error message.
    const out = scrubEvent({
      exception: { values: [{ type: "Error", value: "Cannot add row for Aysu" }] },
    });
    expect(out?.exception?.values?.[0]?.value).toBe("Cannot add row for Aysu");
  });

  it("a BULK IMPORT that throws ships no question bodies", () => {
    const body = {
      packageId: "9f8c1d2e-1111-4222-8333-444455556666",
      rows: Array.from({ length: 250 }, (_, i) => ({
        body_az: `Sual ${i}: bir ədədin kvadratı…`,
        options: ["A", "B", "C", "D", "E"],
        image: "data:image/png;base64,iVBORw0KGgoAAAANS",
      })),
    };

    const out = scrubEvent({
      exception: {
        values: [{ type: "Error", value: "Bulk import failed at row 137" }],
      },
      request: { url: "/olympiad/9f8c1d2e-1111-4222-8333-444455556666/import", data: body },
      extra: { payload: body },
      breadcrumbs: [
        { category: "xhr", data: { url: "/olympiad/import", payload: body } },
      ],
    });

    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("kvadratı");
    expect(serialized).not.toContain("iVBORw0KGgo");
    expect(out?.request?.url).toBe("/olympiad/:id/import");
    // The one thing that DOES survive is the part worth waking up for.
    expect(out?.exception?.values?.[0]?.value).toBe("Bulk import failed at row 137");
  });
});

describe("noise controls", () => {
  it("ignores Next.js control-flow throws, which are not failures", () => {
    expect(IGNORED_ERRORS).toContain("NEXT_REDIRECT");
    expect(IGNORED_ERRORS).toContain("NEXT_NOT_FOUND");
  });

  it("denies browser-extension origins", () => {
    const injected = "chrome-extension://abcdefghijklmnop/content.js";
    expect(DENIED_URLS.some((pattern) => pattern.test(injected))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE PARENTHESIS HOLE
//
// A real Azerbaijani school is written "132 (tam orta) məktəb", and this panel
// is where staff read exactly that column. The row rules used to end their
// payload at `[^)]*` — the FIRST inner close-parenthesis — so a row carrying
// that school ended the match at "orta)" and EVERY COLUMN AFTER IT shipped: the
// city, the rayon, the gender and the grade.
// ---------------------------------------------------------------------------
const ROW_WITH_NESTED_PARENS =
  "Failing row contains (a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d, Aylin, " +
  "Məmmədova, 48310277, 132 (tam orta) məktəb, Bakı, Nəsimi, female, 7)";

describe("redactText — a value that carries its own parentheses", () => {
  it("(a) wipes the whole row, not just the part before the inner `)`", () => {
    const out = redactText(ROW_WITH_NESTED_PARENS);
    for (const word of [...ROW_WORDS, "tam orta", "məktəb", "132"]) {
      expect(out, `leaked: ${word}`).not.toContain(word);
    }
    expect(out).not.toContain("48310277");
    expect(out).toBe("Failing row contains ([redacted])");
  });

  it("(a) wipes a Key DETAIL whose VALUE carries parentheses", () => {
    const out = redactText("DETAIL: Key (school)=(132 (tam orta) məktəb) already exists.");
    expect(out).not.toContain("tam orta");
    expect(out).not.toContain("məktəb");
    expect(out).toBe("DETAIL: Key ([redacted])=([redacted]) already exists.");
  });

  it("(b) does not swallow the sentence that follows the construct", () => {
    // Why this is a balanced matcher and not a greedy `\\(.*\\)`: greedy would
    // run to the LAST parenthesis on the line and take the diagnosis with it.
    const out = redactText(
      "Failing row contains (a1b2, Aylin, 7). Retry the import (batch 12) after a reload.",
    );
    expect(out).not.toContain("Aylin");
    expect(out).toBe(
      "Failing row contains ([redacted]). Retry the import (batch 12) after a reload.",
    );
  });

  it("(b) keeps ` already exists.` after a Key DETAIL, and handles two on a line", () => {
    expect(redactText("DETAIL: Key (child_unique_id)=(40318827) already exists.")).toBe(
      "DETAIL: Key ([redacted])=([redacted]) already exists.",
    );
    expect(redactText("Key (a)=(b) and Key (c)=(d) differ")).toBe(
      "Key ([redacted])=([redacted]) and Key ([redacted])=([redacted]) differ",
    );
  });

  it("(c) stays idempotent on the nested-parenthesis form", () => {
    const once = redactText(ROW_WITH_NESTED_PARENS);
    expect(redactText(once)).toBe(once);
    const key = redactText("Key (school)=(132 (tam orta) məktəb) already exists.");
    expect(redactText(key)).toBe(key);
  });

  it("over-redacts to the end of the line rather than leaking an UNBALANCED row", () => {
    // A regex cannot count, so a stray `(` inside a value defeats the balanced
    // branch. The fallback takes the rest of the LINE: the trailing prose is
    // lost, the row never is.
    const out = redactText(
      'Failing row contains (Məktəb (filial, Aylin, 40318827, female\ncontext: "insert"',
    );
    for (const word of ["Aylin", "female", "filial", "40318827"]) {
      expect(out, `leaked: ${word}`).not.toContain(word);
    }
    expect(out).toContain("Failing row contains ([redacted])");
    // The NEXT line survives: the fallback is line-bounded, not string-bounded.
    expect(out).toContain('context: "insert"');
  });

  it("carries the fix into the issue TITLE, which is what a human reads", () => {
    const out = scrubEvent({
      exception: {
        values: [{ type: "PostgrestError", value: ROW_WITH_NESTED_PARENS }],
      },
    });
    const serialized = JSON.stringify(out);
    for (const word of [...ROW_WORDS, "tam orta", "məktəb"]) {
      expect(serialized, `leaked: ${word}`).not.toContain(word);
    }
    expect(out?.exception?.values?.[0]?.type).toBe("PostgrestError");
  });
});

// ---------------------------------------------------------------------------
// THE VALUE-SHAPED BACKSTOP
//
// SENSITIVE_KEY_RE is a list of NAMES, so a key nobody thought of carries its
// value through. A STRING is still covered, because redactText reads the value
// itself — but a NUMBER never reaches redactText, and an 8-digit child login id
// arrives as a number as often as it arrives as a string.
// ---------------------------------------------------------------------------
describe("structured values are redacted by SHAPE under a key nobody listed", () => {
  it("redacts an 8-digit login id arriving as a NUMBER", () => {
    const crumb = scrubBreadcrumb({
      category: "xhr",
      data: { ref: 40318827, seq: 12, bytes: 17179869184 },
    });
    expect(crumb?.data?.ref).toBe("[redacted]");
    // Over-redaction is the other way to fail: a number that is not an 8-digit
    // run is diagnostics, and diagnostics are the reason to send anything.
    expect(crumb?.data?.seq).toBe(12);
    expect(crumb?.data?.bytes).toBe(17179869184);
  });

  it("redacts an E.164 phone and an email under innocent-looking keys", () => {
    const crumb = scrubBreadcrumb({
      category: "xhr",
      data: { contact: "+994501234567", owner: "leyla.m@example.com" },
    });
    expect(String(crumb?.data?.contact)).not.toContain("994501234567");
    expect(String(crumb?.data?.owner)).not.toContain("leyla.m");
  });

  it("reaches the same values inside tags and an allowed context", () => {
    const out = scrubEvent({
      message: "boom",
      tags: { ref: 40318827 },
      contexts: { app: { recent: [40318827, 7], owner: "leyla.m@example.com" } },
    });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("40318827");
    expect(serialized).not.toContain("leyla.m");
  });
});

// ---------------------------------------------------------------------------
// THE TWO RULES MIRRORED FROM web-app
//
// Both were missing HERE, in the one app that holds the service-role client.
// ---------------------------------------------------------------------------
describe("redactText — the high-entropy backstop", () => {
  it("redacts an unrecognised credential by SHAPE, not by a list of names", () => {
    // Every secret rule above this one names a format somebody already knew
    // about. This is what makes the guarantee survive a format nobody has seen.
    const token = "9f2Kx7Lm4Qp1Zr8Tv3Wy6Bn5Cd0Hj2Gk4Ms7Pt9Rv";
    expect(token.length).toBeGreaterThanOrEqual(40);
    const out = redactText(`auth rejected: ${token}`);
    expect(out).not.toContain(token);
    expect(out).toContain("[redacted:token]");
  });

  it("leaves a UUID to the UUID rule — 36 characters is under the threshold", () => {
    const out = redactText("student 9f8c1d2e-1111-4222-8333-444455556666 missing");
    expect(out).toContain("[redacted:uuid]");
    expect(out).not.toContain("[redacted:token]");
  });

  it("does not eat ordinary prose or a long identifier name", () => {
    const message = "SUPABASE_SERVICE_ROLE_KEY is not configured (server-only).";
    expect(redactText(message)).toContain("SUPABASE_SERVICE_ROLE_KEY is not configured");
  });
});

describe("redactText — Supabase Storage object paths", () => {
  it("redacts the object key and keeps the prefix, so events still group", () => {
    // The object key is derived per child, so the PATH identifies a child even
    // when nothing else in the URL does — and it is not a UUID, not an email
    // and not eight digits, so no other rule in this file could see it.
    const out = redactText(
      "404 https://abc.supabase.co/storage/v1/object/public/avatars/40318827-aysu.png",
    );
    expect(out).not.toContain("aysu.png");
    expect(out).toContain("/storage/v1/object/[redacted]");
  });

  it("is a FIXED POINT of its own output", () => {
    // The character class excludes `]`, so without the lookahead guard every
    // re-run matched its own output up to the `]` and appended another. This
    // text is re-redacted routinely: scrubUrl redacts a path, then scrubEvent
    // redacts the assembled string again.
    const once = redactText(
      "404 https://abc.supabase.co/storage/v1/object/sign/media/q-1.png",
    );
    expect(redactText(once)).toBe(once);
    expect(redactText(redactText(once))).toBe(once);
  });
});

// ---------------------------------------------------------------------------
// THE THREE SCRUBBERS MUST AGREE ON THE ROW DETAIL
//
// A Postgres DETAIL reaches all three apps: the web app and the phone speak to
// PostgREST directly, and this panel reads the same errors back through it. So
// a hole in this rule is a hole in the PRODUCT, not in one client — the rule
// has one definition and three copies, compared here byte for byte. If this
// fails, do not edit one file until it matches: fix the rule once and copy the
// whole block into all three.
// ---------------------------------------------------------------------------
const SHARED_BEGIN = "// --- SHARED ROW-DETAIL RULES: BEGIN ---";
const SHARED_END = "// --- SHARED ROW-DETAIL RULES: END ---";

function sharedRowRules(relative: string): string {
  const source = readFileSync(resolve(process.cwd(), relative), "utf8")
    .split("\r\n")
    .join("\n");
  const start = source.indexOf(SHARED_BEGIN);
  const end = source.indexOf(SHARED_END);
  expect(start, `${relative}: no shared row-detail block`).toBeGreaterThan(-1);
  expect(end, `${relative}: unterminated shared row-detail block`).toBeGreaterThan(start);
  return source.slice(start, end + SHARED_END.length);
}

describe("the row-detail rules are identical in all three apps", () => {
  it("admin-panel, web-app and mobile-app carry the same block", () => {
    const admin = sharedRowRules("src/lib/sentry/scrub.ts");
    expect(sharedRowRules("../web-app/src/lib/observability/sentryScrub.ts")).toBe(admin);
    expect(sharedRowRules("../mobile-app/src/lib/sentryScrub.ts")).toBe(admin);
  });

  it("the block is the rules, and not the pattern they replaced", () => {
    // A string comparison alone would pass on three identical EMPTY blocks, and
    // it would pass on three identical copies of the defect.
    const code = sharedRowRules("src/lib/sentry/scrub.ts")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).toContain("const KEY_DETAIL_RE = new RegExp(");
    expect(code).toContain("const FAILING_ROW_RE = new RegExp(");
    // The defect itself, spelled as it was: a payload that ends at the first
    // inner close-parenthesis. Comments are stripped first because the block's
    // own commentary quotes the broken pattern in order to explain it.
    expect(code).not.toContain("[^)]*");
  });
});
