// The Sentry scrubber, one test per CLASS of forbidden data.
//
// WHY THIS SUITE IS SHAPED THE WAY IT IS. Sentry is a third-party recipient of
// this product's diagnostic data, and this product holds minors' personal data:
// children's names, their 8-digit login IDs, school, city and rayon, grade, an
// optional gender, avatars and results, plus parent emails and phone numbers.
// Neither the Play *Data safety* declaration nor the App Store *App Privacy*
// card lists Sentry today. So the test is not "does the scrubber work" — it is
// "feed it one event per class of forbidden data and assert NONE of it
// survives", checked against the SERIALISED event, because what ships to Sentry
// is the serialised event and not the parts of it a test happened to look at.
//
// Two classes are handled differently, and the tests say which is which:
//   * SHAPED values (8-digit IDs, emails, phones, JWTs, connection strings,
//     UUIDs, storage paths) are rewritten by `redactText`.
//   * UNSHAPED values (a first name, a school, a city, a gender — ordinary
//     words no regex can find) are handled by DELETING the containers they can
//     live in: request bodies, cookies, headers, query strings, `extra`,
//     stack-frame locals. The tests below prove the containers are gone rather
//     than pretending the words are detectable.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import {
  redactText,
  scrubBreadcrumb,
  scrubEvent,
  scrubUrl,
} from "@/lib/observability/sentryScrub";
import { sharedSentryOptions } from "@/lib/observability/sentryOptions";

// THE SHAPE THAT CARRIES A WHOLE DATABASE ROW, exactly as the verifier drove it
// through beforeSend. Postgres puts the offending data in the error DETAIL and
// PostgREST forwards it verbatim, so this string reaches an exception VALUE —
// the Sentry issue TITLE, which no SDK option filters.
const FAILING_ROW =
  "Failing row contains (a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d, Aylin, " +
  "Məmmədova, 48310277, Bakı, Nəsimi, female, 7)";

/** Every part of that row no regex could ever recognise on its own. */
const ROW_WORDS = ["Aylin", "Məmmədova", "Bakı", "Nəsimi", "female"];

// A realistic, fully-populated event: everything the SDK can attach, populated
// with everything it must never send.
function eventWithEverything(): ErrorEvent {
  return {
    type: undefined,
    message: undefined,
    transaction: "POST /api/mobile/v1/auth/child-login",
    user: {
      id: "c19e4f1a-2b3c-4d5e-8f90-a1b2c3d4e5f6",
      email: "parent@example.com",
      ip_address: "94.20.55.11",
      username: "Aylin Məmmədova",
    },
    extra: {
      childFirstName: "Aylin",
      childLastName: "Məmmədova",
      school: "Bakı şəhəri 132 nömrəli tam orta məktəb",
      city: "Bakı",
      rayon: "Nəsimi",
      gender: "female",
      childUniqueId: "48310277",
    },
    tags: {
      route: "child-login",
      school: "Bakı şəhəri 132 nömrəli tam orta məktəb",
      gender: "female",
      childEmail: "c48310277@children.invalid",
    },
    contexts: {
      response: {
        headers: { "set-cookie": "sb-abcdefgh-auth-token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijkl" },
      },
      state: { parentPhone: "+994501234567" },
    },
    request: {
      method: "POST",
      url: "https://olympiq.ai/children/19e4f1a2-2b3c-4d5e-8f90-a1b2c3d4e5f6/edit?tab=info&email=parent@example.com",
      query_string: "tab=info&email=parent@example.com",
      cookies: { "sb-abcdefgh-auth-token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijkl" },
      headers: { cookie: "sb-abcdefgh-auth-token=xyz", "user-agent": "Mozilla/5.0" },
      data: {
        child_id: "48310277",
        password: "correct-horse-battery",
        first_name: "Aylin",
        last_name: "Məmmədova",
        school: "Bakı şəhəri 132 nömrəli tam orta məktəb",
        gender: "female",
      },
    },
    exception: {
      values: [
        {
          type: "AuthApiError",
          value:
            'Invalid login credentials for c48310277@children.invalid (avatar https://abc.supabase.co/storage/v1/object/public/avatars/48310277-aylin.png)',
          stacktrace: {
            frames: [
              {
                filename: "/var/task/src/lib/supabase/admin.ts",
                function: "getAdminClient",
                context_line:
                  '  const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.S3cr3tS1gn4tur3";',
                pre_context: ["const url = process.env.NEXT_PUBLIC_SUPABASE_URL;"],
                post_context: ["  return createClient(url, key);"],
                vars: {
                  serviceRoleKey:
                    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.S3cr3tS1gn4tur3",
                  dbUrl:
                    "postgresql://postgres.abcdefgh:Sup3rS3cretPassw0rd@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
                },
              },
            ],
          },
        },
      ],
    },
    breadcrumbs: [
      {
        category: "console",
        level: "error",
        message: "child login failed for c48310277@children.invalid",
      },
      {
        category: "fetch",
        data: {
          method: "POST",
          url: "https://olympiq.ai/api/mobile/v1/children/19e4f1a2-2b3c-4d5e-8f90-a1b2c3d4e5f6?email=parent@example.com",
          status_code: 500,
          body: { first_name: "Aylin", school: "Bakı 132" },
        },
      },
    ],
  } as unknown as ErrorEvent;
}

// Everything in this list is a literal that must not appear anywhere in the
// serialised event — the 8-digit ID, the parent's email and phone, the child's
// synthetic auth identity, the avatar object key, the session cookie value, the
// service-role JWT and the database connection string.
const FORBIDDEN_LITERALS = [
  "48310277",
  "c48310277@children.invalid",
  "parent@example.com",
  "+994501234567",
  "94.20.55.11",
  "correct-horse-battery",
  "48310277-aylin.png",
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  "S3cr3tS1gn4tur3",
  "Sup3rS3cretPassw0rd",
  "postgresql://",
  "19e4f1a2-2b3c-4d5e-8f90-a1b2c3d4e5f6",
];

function serialize(value: unknown): string {
  return JSON.stringify(value ?? null);
}

describe("scrubEvent — nothing forbidden survives serialization", () => {
  it("strips every class of forbidden data from a fully-populated event", () => {
    const scrubbed = serialize(scrubEvent(eventWithEverything()));
    for (const literal of FORBIDDEN_LITERALS) {
      expect(scrubbed, `leaked: ${literal}`).not.toContain(literal);
    }
  });

  it("drops the whole `user` object — IP address, email and display name", () => {
    const scrubbed = scrubEvent(eventWithEverything());
    expect(scrubbed?.user).toBeUndefined();
  });

  it("drops `extra` outright, which is where unshaped data hides", () => {
    // A first name, a school and a city are ordinary words — no regex finds
    // them. The defence is that the container never ships, not that the words
    // are detectable.
    const scrubbed = scrubEvent(eventWithEverything());
    expect(scrubbed?.extra).toBeUndefined();
    expect(serialize(scrubbed)).not.toContain("Aylin");
    expect(serialize(scrubbed)).not.toContain("Nəsimi");
  });

  it("reduces the request to method + route shape: no body, cookies, headers or query string", () => {
    const scrubbed = scrubEvent(eventWithEverything());
    const request = scrubbed?.request as Record<string, unknown> | undefined;
    expect(request?.method).toBe("POST");
    expect(request?.data).toBeUndefined();
    expect(request?.cookies).toBeUndefined();
    expect(request?.headers).toBeUndefined();
    expect(request?.query_string).toBeUndefined();
    // Still says WHERE it broke, and identifies nobody.
    expect(request?.url).toBe("https://olympiq.ai/children/:id/edit?[redacted]");
  });

  it("deletes stack-frame locals — the path a service-role key or DB URL takes", () => {
    const scrubbed = scrubEvent(eventWithEverything());
    const frame = scrubbed?.exception?.values?.[0]?.stacktrace?.frames?.[0];
    expect(frame?.vars).toBeUndefined();
    // The filename and function name survive: that is the debugging value, and
    // neither is personal data.
    expect(frame?.filename).toBe("/var/task/src/lib/supabase/admin.ts");
    expect(frame?.function).toBe("getAdminClient");
  });

  it("redacts a secret that was inlined in a source context line", () => {
    const scrubbed = scrubEvent(eventWithEverything());
    const frame = scrubbed?.exception?.values?.[0]?.stacktrace?.frames?.[0];
    expect(frame?.context_line).not.toContain("S3cr3tS1gn4tur3");
    expect(frame?.context_line).toContain("[redacted:token]");
  });

  it("redacts the exception VALUE, which is the Sentry issue title", () => {
    const scrubbed = scrubEvent(eventWithEverything());
    const value = scrubbed?.exception?.values?.[0]?.value ?? "";
    expect(value).not.toContain("48310277");
    expect(value).not.toContain("children.invalid");
    // The error is still recognisable as what it was.
    expect(value).toContain("Invalid login credentials");
    expect(scrubbed?.exception?.values?.[0]?.type).toBe("AuthApiError");
  });

  it("drops console breadcrumbs and scrubs the ones it keeps", () => {
    const scrubbed = scrubEvent(eventWithEverything());
    expect(scrubbed?.breadcrumbs).toHaveLength(1);
    const crumb = scrubbed?.breadcrumbs?.[0];
    expect(crumb?.category).toBe("fetch");
    const data = crumb?.data as Record<string, unknown>;
    expect(data.url).toBe("https://olympiq.ai/api/mobile/v1/children/:id?[redacted]");
    expect(data.body).toBe("[redacted]");
    // The part worth keeping is kept.
    expect(data.status_code).toBe(500);
  });

  it("collapses contexts.nextjs.request_path through scrubUrl, query string and all", () => {
    // `Sentry.captureRequestError` (src/instrumentation.ts) writes the RESOLVED
    // request path here. redactText alone leaves `?q=Aylin` completely intact —
    // an ordinary word has no shape — so only scrubUrl closes it.
    const scrubbed = scrubEvent({
      message: "boom",
      contexts: {
        nextjs: {
          request_path:
            "/children/19e4f1a2-2b3c-4d5e-8f90-a1b2c3d4e5f6/edit?q=Aylin&school=Bak%C4%B1%20132",
          router_kind: "App Router",
        },
      },
    } as unknown as ErrorEvent);
    const nextjs = (scrubbed?.contexts as Record<string, { request_path?: string }>)
      .nextjs;
    expect(nextjs.request_path).toBe("/children/:id/edit?[redacted]");
    expect(serialize(scrubbed)).not.toContain("Aylin");
  });

  it("drops the response context, which carries Set-Cookie", () => {
    const scrubbed = scrubEvent(eventWithEverything());
    const contexts = scrubbed?.contexts as Record<string, unknown> | undefined;
    expect(contexts?.response).toBeUndefined();
  });

  it("blanks structured values whose KEY names a person attribute", () => {
    const scrubbed = scrubEvent(eventWithEverything());
    const tags = scrubbed?.tags as Record<string, unknown>;
    expect(tags.school).toBe("[redacted]");
    expect(tags.gender).toBe("[redacted]");
    expect(tags.childEmail).toBe("[redacted]");
    // A tag that names nothing personal is left alone — the scrubber has to
    // stay useful, not just safe.
    expect(tags.route).toBe("child-login");
  });

  it("drops an event with neither a stack nor a message as unactionable", () => {
    expect(scrubEvent({ level: "error" } as unknown as ErrorEvent)).toBeNull();
  });

  it("keeps an ordinary, non-sensitive error completely intact", () => {
    const event = {
      exception: {
        values: [{ type: "TypeError", value: "Cannot read properties of undefined (reading 'map')" }],
      },
      request: { method: "GET", url: "https://olympiq.ai/services" },
    } as unknown as ErrorEvent;
    const scrubbed = scrubEvent(event);
    expect(scrubbed?.exception?.values?.[0]?.value).toBe(
      "Cannot read properties of undefined (reading 'map')",
    );
    expect((scrubbed?.request as Record<string, unknown>).url).toBe(
      "https://olympiq.ai/services",
    );
  });
});

describe("redactText — one case per shaped secret", () => {
  it("redacts a Postgres connection string, credentials and all", () => {
    const out = redactText(
      "connect ECONNREFUSED postgresql://postgres.abcdefgh:Sup3rS3cretPassw0rd@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
    );
    expect(out).not.toContain("Sup3rS3cretPassw0rd");
    expect(out).not.toContain("pooler.supabase.com");
    expect(out).toContain("[redacted:connection-string]");
  });

  it("redacts a connection string under ANY scheme, matching credential SHAPE not name", () => {
    // The guarantee has to hold for a URL nobody anticipated — this is why the
    // rule keys off `user:pass@host`, not off a list of variable names.
    const out = redactText("redis://admin:hunter2hunter2@cache.internal:6379/0 failed");
    expect(out).not.toContain("hunter2hunter2");
    expect(out).toContain("[redacted:connection-string]");
  });

  it("redacts a JWT-shaped token — this is the Supabase service-role key", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const out = redactText(`PGRST301: JWT expired (${jwt})`);
    expect(out).not.toContain("eyJ");
    expect(out).not.toContain("dBjftJeZ4CVP");
    expect(out).toContain("[redacted:token]");
  });

  it("redacts an unrecognised future key format by ENTROPY, not by a name list", () => {
    // The backstop that makes the guarantee survive a key-format change.
    const out = redactText("auth failed with sb_secret_9f2Kx7Lm4Qp1Zr8Tv3Wy6Bn5Cd0Hj");
    expect(out).not.toContain("9f2Kx7Lm4Qp1Zr8Tv3Wy6Bn5Cd0Hj");
    expect(out).toContain("[redacted:token]");
  });

  it("redacts the child's synthetic auth identity, which embeds the 8-digit ID", () => {
    // childSyntheticEmail(), src/lib/auth/children.ts — every Supabase auth
    // error about a child quotes this address.
    const out = redactText("User c48310277@children.invalid not found");
    expect(out).not.toContain("48310277");
    expect(out).toContain("[redacted:email]");
  });

  it("redacts a bare 8-digit login ID", () => {
    const out = redactText("child_unique_id 48310277 is already taken");
    expect(out).not.toContain("48310277");
    expect(out).toContain("[redacted:id]");
  });

  it("redacts a Postgres constraint DETAIL, which carries whole ROWS", () => {
    // The one shape that leaks a child's NAME through an exception message.
    const out = redactText(
      "duplicate key value violates unique constraint \"students_child_unique_id_key\"\nDETAIL: Key (child_unique_id)=(48310277) already exists.\nFailing row contains (19e4f1a2, Aylin, Məmmədova, Bakı, 7, female).",
    );
    expect(out).not.toContain("48310277");
    expect(out).not.toContain("Aylin");
    expect(out).not.toContain("Bakı");
    // The constraint name survives, so the bug is still identifiable.
    expect(out).toContain("students_child_unique_id_key");
  });

  it("redacts parent phone numbers in both stored and typed forms", () => {
    expect(redactText("phone +994501234567 invalid")).not.toContain("994501234567");
    expect(redactText("nömrə 0501234567 yanlışdır")).not.toContain("0501234567");
  });

  it("redacts an avatar object path", () => {
    const out = redactText(
      "404 https://abc.supabase.co/storage/v1/object/public/avatars/48310277-aylin.png",
    );
    expect(out).not.toContain("48310277-aylin.png");
    expect(out).toContain("/storage/v1/object/[redacted]");
  });

  it("is idempotent — re-running it never re-mangles redacted text", () => {
    const once = redactText("user c48310277@children.invalid failed");
    expect(redactText(once)).toBe(once);
  });

  it("leaves ordinary error prose untouched", () => {
    const prose = "Cannot read properties of undefined (reading 'subjectId')";
    expect(redactText(prose)).toBe(prose);
  });
});

describe("redactText — the Postgres row detail, rule 1 and rule 2", () => {
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
    // The field that matters: beforeSend must apply them to exception.value,
    // because that is what a human reads in the Sentry issue list.
    const scrubbed = scrubEvent({
      exception: { values: [{ type: "PostgrestError", value: FAILING_ROW }] },
    } as unknown as ErrorEvent);
    const serialized = serialize(scrubbed);
    for (const word of ROW_WORDS) {
      expect(serialized, `leaked: ${word}`).not.toContain(word);
    }
    expect(scrubbed?.exception?.values?.[0]?.type).toBe("PostgrestError");
  });
});

describe("scrubUrl — dynamic segments become placeholders", () => {
  it("replaces a child's profile UUID while keeping the route shape", () => {
    expect(scrubUrl("https://olympiq.ai/children/19e4f1a2-2b3c-4d5e-8f90-a1b2c3d4e5f6/edit")).toBe(
      "https://olympiq.ai/children/:id/edit",
    );
  });

  it("replaces an attempt UUID on the child's review route", () => {
    expect(scrubUrl("/child/test/review/19e4f1a2-2b3c-4d5e-8f90-a1b2c3d4e5f6")).toBe(
      "/child/test/review/:id",
    );
  });

  it("replaces a bare 8-digit login ID in a path", () => {
    expect(scrubUrl("/some/route/48310277")).toBe("/some/route/:childId");
  });

  it("drops the query string wholesale rather than trying to scrub it", () => {
    expect(scrubUrl("https://olympiq.ai/auth/callback?code=abc123&next=/dashboard")).toBe(
      "https://olympiq.ai/auth/callback?[redacted]",
    );
  });

  it("replaces an opaque long token sitting in the path", () => {
    expect(scrubUrl("/auth/confirm/VGhpc0lzQVZlcnlMb25nT3BhcXVlTWFnaWNMaW5rVG9rZW4xMjM")).toBe(
      "/auth/confirm/:token",
    );
  });

  it("keeps a public content slug — it identifies nobody and aids grouping", () => {
    expect(scrubUrl("https://olympiq.ai/news/olimpiada-neticeleri")).toBe(
      "https://olympiq.ai/news/olimpiada-neticeleri",
    );
  });

  it("falls back to text redaction for something that is not a URL", () => {
    expect(scrubUrl("c48310277@children.invalid")).not.toContain("48310277");
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs outright", () => {
    // ~130 console.error sites in web-app/src; a handful log error.message, and
    // Supabase messages embed values.
    expect(scrubBreadcrumb({ category: "console", message: "id 48310277" })).toBeNull();
  });

  it("redacts a DOM breadcrumb message, and explains why it is also not collected", () => {
    // `_htmlElementAsString` appends aria-label / title / alt / name / type to
    // every element in the tree it serialises. The 8-digit ID has a SHAPE and
    // goes; "Aylin" does not and stays — which is exactly why the Breadcrumbs
    // integration now runs with `dom: false` in browserSentry.ts
    // instead of relying on this function to clean the crumb afterwards.
    const crumb = scrubBreadcrumb({
      category: "ui.click",
      message: 'button.child-card[aria-label="Aylin Məmmədova 48310277"]',
    }) as Breadcrumb;
    expect(crumb.message).not.toContain("48310277");
    expect(crumb.message).toContain("button.child-card");
  });

  it("recurses into nested data and bounds the recursion", () => {
    // A cyclic structure (a React fiber, an Error whose `cause` loops back)
    // reaching beforeSend must not hang the SDK: there is no timeout there.
    const cyclic: Record<string, unknown> = { depth: 1, ref: "48310277" };
    cyclic.self = cyclic;
    const crumb = scrubBreadcrumb({
      category: "xhr",
      data: {
        status_code: 409,
        frame: cyclic,
        detail: { message: FAILING_ROW },
      },
    }) as Breadcrumb;
    const serialized = serialize(crumb);
    for (const word of ROW_WORDS) {
      expect(serialized, `leaked: ${word}`).not.toContain(word);
    }
    expect(serialized).not.toContain("48310277");
    expect((crumb.data as Record<string, unknown>).status_code).toBe(409);
  });

  it("scrubs navigation from/to", () => {
    const crumb = scrubBreadcrumb({
      category: "navigation",
      data: { from: "/children/19e4f1a2-2b3c-4d5e-8f90-a1b2c3d4e5f6", to: "/dashboard?email=a@b.com" },
    }) as Breadcrumb;
    const data = crumb.data as Record<string, unknown>;
    expect(data.from).toBe("/children/:id");
    expect(data.to).toBe("/dashboard?[redacted]");
  });
});

describe("sharedSentryOptions — the posture this app ships", () => {
  it("writes dataCollection and NEVER sendDefaultPii", () => {
    // @sentry/core@10.74.0: "If both `sendDefaultPii` and `dataCollection` are
    // set, `sendDefaultPii` will be ignored." Writing it here would read like a
    // privacy control that is doing nothing, and it is removed in v11.
    expect("sendDefaultPii" in sharedSentryOptions).toBe(false);
    expect(sharedSentryOptions.dataCollection).toBeTruthy();
  });

  it("writes EVERY dataCollection category explicitly", () => {
    // Supplying the object activates PERMISSIVE spec defaults for anything
    // omitted (cookies true, all four httpBodies, headers true, query params
    // true, database query data true, stack-frame variables true, GraphQL
    // document AND variables, genAI inputs AND outputs, five context lines). A
    // half-written block is more leaky than the deprecated option it replaces.
    //
    // Listed BY NAME so that an SDK upgrade adding a category fails loudly here
    // rather than quietly taking that category's permissive default.
    const dc = sharedSentryOptions.dataCollection;
    expect(Object.keys(dc).sort()).toEqual(
      [
        "cookies",
        "databaseQueryData",
        "frameContextLines",
        "genAI",
        "graphQL",
        "httpBodies",
        "httpHeaders",
        "stackFrameVariables",
        "urlQueryParams",
        "userInfo",
      ].sort(),
    );
    expect(dc.userInfo).toBe(false);
    expect(dc.cookies).toBe(false);
    expect(dc.httpHeaders).toEqual({ request: false, response: false });
    expect(dc.httpBodies).toEqual([]);
    expect(dc.urlQueryParams).toBe(false);
    expect(dc.databaseQueryData).toBe(false);
    expect(dc.stackFrameVariables).toBe(false);
    // The three that used to be omitted, i.e. permissive: a GraphQL variables
    // bag on this product is `{ childId, password }`, a genAI payload is a
    // prompt, and a frame context line on the server is a slab of the built
    // bundle.
    expect(dc.graphQL).toEqual({ document: false, variables: false });
    expect(dc.genAI).toEqual({ inputs: false, outputs: false });
    expect(dc.frameContextLines).toBe(0);
  });

  it("keeps performance monitoring and session replay off", () => {
    // 5,000 error occurrences/month org-wide, no overage. A transaction per
    // request would spend it in days, and Replay would record children's names
    // and schools verbatim.
    // The keys are ABSENT, not zero, and that is stricter: hasSpansEnabled()
    // tests `tracesSampleRate != null`, so a literal 0 reads as "tracing on,
    // sampled at zero" and starts the span machinery on every request. See
    // sentryOptions.ts and the fuller assertions in sentryBudget.test.ts.
    expect("tracesSampleRate" in sharedSentryOptions).toBe(false);
    expect("replaysSessionSampleRate" in sharedSentryOptions).toBe(false);
    expect("replaysOnErrorSampleRate" in sharedSentryOptions).toBe(false);
    expect(sharedSentryOptions.enableLogs).toBe(false);
  });

  it("is disabled outside production, so local debugging cannot spend the quota", () => {
    expect(sharedSentryOptions.enabled).toBe(false);
  });

  it("ignores Next.js control flow, which is not an error", () => {
    // notFound() runs in real code paths, e.g. (parent)/children/[id]/edit.
    expect(sharedSentryOptions.ignoreErrors).toContain("NEXT_REDIRECT");
    expect(sharedSentryOptions.ignoreErrors).toContain("NEXT_NOT_FOUND");
  });

  it("turns DOM breadcrumbs off where the browser SDK is initialised", () => {
    // Source-level, because importing the module would call Sentry.init(). The
    // default Breadcrumbs integration runs with `dom: true`, and a DOM crumb
    // serialises each element's aria-label / title / alt / name — on this app, a
    // child's name on a card and an 8-digit ID on a tile. No beforeBreadcrumb
    // can clean an ordinary word out of that, so it is not collected at all.
    //
    // browserSentry.ts, NOT instrumentation-client.ts: the init call moved there
    // when the SDK was put behind a dynamic import. If it moves again, follow it
    // — the assertion is about where `Sentry.init` actually is.
    const client = readFileSync(
      fileURLToPath(new URL("../observability/browserSentry.ts", import.meta.url)),
      "utf8",
    )
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(client).toContain("dom: false");
    expect(client).toContain("console: false");
    // A merged ARRAY would leave the default Breadcrumbs integration in place
    // and the dom:false would do nothing; only the callback form removes it.
    expect(client).toContain('integration.name !== "Breadcrumbs"');
    expect(client).toContain("integrations: (defaults)");
    // Session Replay records the DOM wholesale — never here.
    expect(client).not.toContain("replayIntegration");
  });

  it("routes every event and breadcrumb through the scrubber", () => {
    const event = {
      exception: { values: [{ type: "Error", value: "id 48310277" }] },
    } as unknown as ErrorEvent;
    expect(serialize(sharedSentryOptions.beforeSend(event))).not.toContain("48310277");
    expect(sharedSentryOptions.beforeBreadcrumb({ category: "console" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THE PARENTHESIS HOLE
//
// A real Azerbaijani school is written "132 (tam orta) məktəb". The row rules
// used to end their payload at `[^)]*` — the FIRST inner close-parenthesis — so
// a row carrying that school ended the match at "orta)" and EVERY COLUMN AFTER
// IT shipped. In the fixture below that is the city, the rayon, the gender and
// the grade: the leak the whole rule exists to prevent, triggered by an
// ordinary school name.
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
    // The reason this is a balanced matcher and not a greedy `\\(.*\\)`: greedy
    // would run to the LAST parenthesis on the line and take the diagnosis with
    // it, which is over-redaction bad enough to make the report useless.
    const out = redactText(
      "Failing row contains (a1b2, Aylin, 7). Retry the import (batch 12) after a reload.",
    );
    expect(out).not.toContain("Aylin");
    expect(out).toBe(
      "Failing row contains ([redacted]). Retry the import (batch 12) after a reload.",
    );
  });

  it("(b) keeps ` already exists.` after a Key DETAIL, and handles two on a line", () => {
    expect(redactText("DETAIL: Key (child_unique_id)=(48310277) already exists.")).toBe(
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
    // A regex cannot count, so a value with a stray `(` defeats the balanced
    // branch. The fallback alternative takes the rest of the LINE — losing the
    // trailing prose, never the row.
    const out = redactText(
      'Failing row contains (Məktəb (filial, Aylin, 48310277, female\ncontext: "insert"',
    );
    for (const word of ["Aylin", "female", "filial", "48310277"]) {
      expect(out, `leaked: ${word}`).not.toContain(word);
    }
    expect(out).toContain("Failing row contains ([redacted])");
    // The NEXT line survives: the fallback is line-bounded, not string-bounded.
    expect(out).toContain('context: "insert"');
  });

  it("carries the fix into the issue TITLE, which is what a human reads", () => {
    const scrubbed = scrubEvent({
      exception: {
        values: [{ type: "PostgrestError", value: ROW_WITH_NESTED_PARENS }],
      },
    } as unknown as ErrorEvent);
    const serialized = serialize(scrubbed);
    for (const word of [...ROW_WORDS, "tam orta", "məktəb"]) {
      expect(serialized, `leaked: ${word}`).not.toContain(word);
    }
    expect(scrubbed?.exception?.values?.[0]?.type).toBe("PostgrestError");
  });
});

// ---------------------------------------------------------------------------
// THE VALUE-SHAPED BACKSTOP
//
// `SENSITIVE_KEY_RE` is a list of NAMES, so a key nobody thought to add carries
// its value through untouched. Strings are still covered — `redactText` reads
// the value itself — but a NUMBER never reaches `redactText`, and an 8-digit
// child login ID is a number as often as it is a string.
// ---------------------------------------------------------------------------
describe("structured values are redacted by SHAPE under a key nobody listed", () => {
  it("redacts an 8-digit login ID arriving as a NUMBER", () => {
    const crumb = scrubBreadcrumb({
      category: "xhr",
      data: { ref: 48310277, seq: 12, bytes: 17179869184 },
    }) as Breadcrumb;
    const data = crumb.data as Record<string, unknown>;
    expect(data.ref).toBe("[redacted]");
    // Over-redaction is the other way to fail: a number that is not an 8-digit
    // run is diagnostics, and diagnostics are the reason to send anything.
    expect(data.seq).toBe(12);
    expect(data.bytes).toBe(17179869184);
  });

  it("redacts an E.164 phone and an email under innocent-looking keys", () => {
    const crumb = scrubBreadcrumb({
      category: "xhr",
      data: { contact: "+994501234567", owner: "leyla.m@example.com" },
    }) as Breadcrumb;
    const data = crumb.data as Record<string, unknown>;
    expect(data.contact).not.toContain("994501234567");
    expect(data.owner).not.toContain("leyla.m");
  });

  it("reaches the same values inside tags, contexts and arrays", () => {
    const scrubbed = scrubEvent({
      message: "boom",
      tags: { ref: 48310277 },
      contexts: { app: { recent: [48310277, 7], owner: "leyla.m@example.com" } },
    } as unknown as ErrorEvent);
    const serialized = serialize(scrubbed);
    expect(serialized).not.toContain("48310277");
    expect(serialized).not.toContain("leyla.m");
  });
});

// ---------------------------------------------------------------------------
// STORAGE PATHS ARE A FIXED POINT
// ---------------------------------------------------------------------------
describe("redactText — the Storage rule survives being run twice", () => {
  it("does not grow a `]` on every pass", () => {
    // The character class excludes `]`, so without the lookahead guard each
    // re-run matched its own output up to the `]` and appended another. Text on
    // this path IS re-redacted: scrubUrl redacts each path segment, then
    // beforeSend redacts the assembled string again.
    const once = redactText(
      "404 https://abc.supabase.co/storage/v1/object/public/avatars/48310277-aylin.png",
    );
    expect(once).toContain("/storage/v1/object/[redacted]");
    expect(redactText(once)).toBe(once);
    expect(redactText(redactText(once))).toBe(once);
  });
});

// ---------------------------------------------------------------------------
// THE THREE SCRUBBERS MUST AGREE ON THE ROW DETAIL
//
// A Postgres DETAIL reaches all three apps: the web app and the phone speak to
// PostgREST directly, and the admin panel reads the same errors back through
// it. So a hole in this rule is a hole in the PRODUCT, not in one client — and
// the rule has one definition and three copies, compared here byte for byte.
// If this fails, do not edit one file until it matches: fix the rule once and
// copy the whole block into all three.
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
  it("web-app, admin-panel and mobile-app carry the same block", () => {
    const web = sharedRowRules("src/lib/observability/sentryScrub.ts");
    expect(sharedRowRules("../admin-panel/src/lib/sentry/scrub.ts")).toBe(web);
    expect(sharedRowRules("../mobile-app/src/lib/sentryScrub.ts")).toBe(web);
  });

  it("the block is the rules, and not the pattern they replaced", () => {
    // A string comparison alone would pass on three identical EMPTY blocks, and
    // it would pass on three identical copies of the defect.
    const code = sharedRowRules("src/lib/observability/sentryScrub.ts")
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
