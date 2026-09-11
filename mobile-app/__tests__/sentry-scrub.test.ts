// The scrubber is the only thing standing between a crash in a child's app and
// a third party's database, so it is tested against the payloads this product
// actually produces — a Postgres constraint DETAIL, a Supabase REST URL, a
// native device context — rather than against invented strings.
//
// Two failure directions matter and both are asserted:
//   * UNDER-redaction lets a child's login ID become an issue title. Every test
//     that names a real shape (the `@children.invalid` email, the 8-digit ID,
//     the parent phone) exists because that shape is reachable from real code.
//   * OVER-deletion quietly makes the tool useless. A redacted event must still
//     carry the stack frames, the OTA update id and the debug images, or the
//     "read a two-day-old payment failure" problem this was installed for is
//     replaced by "read a two-day-old blank".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Breadcrumb, Event } from "@sentry/react-native";

import {
  IGNORED_ERRORS,
  redact,
  scrubBreadcrumb,
  scrubEvent,
  scrubUrl,
} from "@/lib/sentryScrub";

const UUID = "11111111-2222-3333-4444-555555555555";

// THE SHAPE THAT CARRIES A WHOLE DATABASE ROW, exactly as the verifier drove it
// through beforeSend. `src/lib/supabase.ts` speaks to PostgREST directly, so
// Postgres error text lands in an exception VALUE on a CHILD DEVICE — the issue
// title, which no SDK option filters.
const FAILING_ROW =
  "Failing row contains (a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d, Aylin, " +
  "Məmmədova, 48310277, Bakı, Nəsimi, female, 7)";

/** Every part of that row a regex could never recognise on its own. */
const ROW_WORDS = ["Aylin", "Məmmədova", "Bakı", "Nəsimi", "female"];

describe("redact — the Postgres row detail", () => {
  it("wipes the verifier's exact failing row, words and all", () => {
    const out = redact(FAILING_ROW);
    for (const word of ROW_WORDS) expect(out).not.toContain(word);
    expect(out).not.toContain("48310277");
    expect(out).not.toContain("a1b2c3d4");
    // The sentence stays, so the error is still recognisable as what it was.
    expect(out).toBe("Failing row contains ([redacted])");
  });

  it("wipes the sibling shapes a unique violation produces", () => {
    const message =
      'duplicate key value violates unique constraint "students_child_unique_id_key"\n' +
      "DETAIL: Key (child_unique_id)=(48310277) already exists.\n" +
      `${FAILING_ROW}.`;
    const out = redact(message);
    for (const word of ROW_WORDS) expect(out).not.toContain(word);
    expect(out).not.toContain("48310277");
    expect(out).toContain("Key ([redacted])=([redacted])");
    expect(out).toContain("Failing row contains ([redacted])");
    // The constraint name is the part anyone actually debugs from.
    expect(out).toContain("students_child_unique_id_key");
  });

  it("wipes a composite key and a foreign-key detail", () => {
    const out = redact(
      "Key (profile_id, subject_id)=(a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d, " +
        '9f8c1d2e-1111-4222-8333-444455556666) is not present in table "subjects".',
    );
    expect(out).not.toContain("a1b2c3d4");
    expect(out).not.toContain("9f8c1d2e");
    expect(out).toContain("Key ([redacted])=([redacted])");
    expect(out).toContain("subjects");
  });

  it("is case- and whitespace-tolerant, because the wire format is not ours", () => {
    expect(redact("KEY (email)=(a@b.com) already exists")).toContain(
      "Key ([redacted])=([redacted])",
    );
    expect(redact("failing row contains(Aylin, Bakı)")).not.toContain("Aylin");
  });

  it("stays idempotent — the replacement is a fixed point of its own rule", () => {
    const once = redact(FAILING_ROW);
    expect(redact(once)).toBe(once);
  });

  it("no longer leaks the columns after a value's own close-parenthesis", () => {
    // This used to be recorded here as an accepted residue: `[^)]*` stopped at
    // the first `)`, so a school written "132 (tam orta) məktəb" ended the
    // match early and every column after it was left to the shape rules — which
    // is to say the city, the rayon and the gender left the device, because
    // those have no shape. The rule is a balanced matcher now. The full
    // treatment is in "a value that carries its own parentheses" below; this
    // assertion stays where the residue was recorded, so the claim and its
    // retraction sit in the same place.
    const out = redact("Failing row contains (a1b2, 132 (tam orta) məktəb, 48310277)");
    expect(out).toBe("Failing row contains ([redacted])");
  });
});

describe("redact", () => {
  // The child's Supabase Auth identity is `c<8-digit-id>@children.invalid`, so
  // ANY auth error text about that account contains the login credential. This
  // is the single most likely way the ID reaches an issue title.
  it("redacts the child synthetic email as a LOGIN, not as an email", () => {
    // NOT inside a `Key (…)=(…)` any more: the row-detail rule now wipes that
    // whole construct first, which is stronger but loses the label. Outside one
    // — an ordinary Supabase auth error, which is how this text usually arrives
    // — the labelling still holds, and it is the label that tells a reader a
    // CREDENTIAL was in the payload rather than a parent's address.
    const out = redact("Invalid login credentials for c12345678@children.invalid");
    expect(out).not.toContain("12345678");
    expect(out).not.toContain("children.invalid");
    expect(out).toContain("[child-login]");
    expect(out).not.toContain("[email]");
    // And the diagnostic half survives, which is the whole point of redacting
    // rather than dropping.
    expect(out).toContain("Invalid login credentials");
  });

  it("redacts parent emails and phone numbers", () => {
    expect(redact("no account for parent.name+tag@example.co.uk")).toBe(
      "no account for [email]",
    );
    expect(redact("phone +994501234567 is taken")).toBe("phone [phone] is taken");
    // The spaced form the UI renders, not just the stored E.164 one.
    expect(redact("+994 50 123 45 67")).toBe("[phone]");
  });

  it("redacts bare 8-digit runs, because that IS the child login ID", () => {
    expect(redact("child 87654321 is locked out")).toBe("child [child-login] is locked out");
    // Deliberately broad: a date is collateral and that is the accepted trade.
    expect(redact("since 20260911")).toBe("since [child-login]");
  });

  it("does not shred numbers that are not eight digits long", () => {
    // A millisecond timestamp has no internal word boundary, so the 8-digit
    // rule cannot bite into it. Losing these would make every event undatable.
    expect(redact("at 1757548800000 after 12 tries (v1.16.0)")).toBe(
      "at 1757548800000 after 12 tries (v1.16.0)",
    );
  });

  it("redacts UUIDs before the digit rule can carve one up", () => {
    // A UUID may open with eight digits; if the digit rule ran first it would
    // replace that head and leave the rest of the identifier in the payload.
    expect(redact("attempt 12345678-2222-3333-4444-555555555555 failed")).toBe(
      "attempt [uuid] failed",
    );
  });

  it("redacts credentials that must never leave a device", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJzdWIiOiIxMjM0NSIsInJvbGUiOiJhbm9uIn0." +
      "dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(redact(`Bearer ${jwt}`)).toBe("Bearer [jwt]");
    expect(redact("key sb_secret_abcdefghijklmnop rejected")).toBe("key [key] rejected");
    // This app never holds a database URL. The rule exists so that "the
    // scrubber only removes what we expected to find" is never true of it.
    expect(redact("postgresql://user:pw@db.example.com:5432/postgres")).toBe("[db-url]");
  });

  it("redacts EVERY occurrence, and is not stateful between calls", () => {
    // The rules are module-level regexes carrying the `g` flag, so `lastIndex`
    // survives a call. Without the reset in `redact`, the second occurrence —
    // and then every other invocation — is silently skipped.
    const twice = "ids 11112222 and 33334444";
    expect(redact(twice)).toBe("ids [child-login] and [child-login]");
    expect(redact(twice)).toBe("ids [child-login] and [child-login]");
  });
});

describe("scrubUrl", () => {
  it("drops the query string of a Supabase REST call whole", () => {
    // The filter values in a PostgREST query ARE row identifiers by
    // construction, so a redacted skeleton of them helps nobody.
    expect(
      scrubUrl(
        `https://abc.supabase.co/rest/v1/students?select=*&profile_id=eq.${UUID}&order=created_at`,
      ),
    ).toBe("https://abc.supabase.co/rest/v1/students");
  });

  it("keeps the path but redacts identifiers inside it", () => {
    expect(scrubUrl(`https://olympiq.ai/api/mobile/v1/children/${UUID}/edit`)).toBe(
      "https://olympiq.ai/api/mobile/v1/children/[uuid]/edit",
    );
  });

  it("survives a relative path without throwing", () => {
    // `new URL` throws on these, and a scrubber that throws is a scrubber that
    // takes the whole event down with it.
    expect(scrubUrl("/api/mobile/v1/auth/child-login")).toBe(
      "/api/mobile/v1/auth/child-login",
    );
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs outright", () => {
    // Not redacted — dropped. A console line is arbitrary text from code we do
    // not control (react-query, expo-*, the Supabase client), so no pattern can
    // promise it is clean.
    const crumb: Breadcrumb = {
      category: "console",
      level: "error",
      message: "child Aysel Məmmədova failed to submit",
    };
    expect(scrubBreadcrumb(crumb)).toBeNull();
  });

  it("strips the query string from an http breadcrumb but keeps the shape", () => {
    const crumb: Breadcrumb = {
      category: "xhr",
      type: "http",
      data: {
        method: "GET",
        url: `https://abc.supabase.co/rest/v1/students?profile_id=eq.${UUID}`,
        status_code: 500,
      },
    };
    const out = scrubBreadcrumb(crumb);
    expect(out?.data?.url).toBe("https://abc.supabase.co/rest/v1/students");
    // Non-string values pass through untouched — a status code is the reason
    // the crumb is worth keeping at all.
    expect(out?.data?.status_code).toBe(500);
    expect(out?.data?.method).toBe("GET");
  });

  it("redacts free text on any other category", () => {
    const crumb: Breadcrumb = {
      category: "navigation",
      message: "opened child 87654321",
      data: { from: "/(parent)/children", to: `/(parent)/children/${UUID}` },
    };
    const out = scrubBreadcrumb(crumb);
    expect(out?.message).toBe("opened child [child-login]");
    expect(out?.data?.to).toBe("/(parent)/children/[uuid]");
  });

  it("RECURSES into nested data instead of copying it through", () => {
    // The defect: `if (typeof value !== "string") { data[key] = value; }` copied
    // every nested object into the payload untouched. A nested object on a
    // breadcrumb is a request body or a PostgREST response row — i.e. a child's
    // name, school and login ID, verbatim, on a third party's servers.
    const out = scrubBreadcrumb({
      category: "xhr",
      type: "http",
      data: {
        url: "https://abc.supabase.co/rest/v1/students",
        status_code: 409,
        response: {
          message: `duplicate key\n${FAILING_ROW}`,
          rows: [{ first_name: "Aylin", school: "Bakı 132", child_unique_id: "48310277" }],
        },
      },
    });

    const serialized = JSON.stringify(out);
    for (const word of ROW_WORDS) expect(serialized).not.toContain(word);
    expect(serialized).not.toContain("48310277");
    // Over-deletion is the other way to fail: the parts worth keeping are kept.
    expect(out?.data?.url).toBe("https://abc.supabase.co/rest/v1/students");
    expect(out?.data?.status_code).toBe(409);
  });

  it("bounds the recursion so a cyclic object cannot hang beforeSend", () => {
    // A React element, a native event object or an Error whose `cause` chain
    // loops back all reach beforeSend as cycles. There is no timeout there, and
    // the app is already on an error path — a hang is a wedged SDK on a child's
    // phone, not a slow report.
    const cyclic: Record<string, unknown> = { depth: 1, id: "48310277" };
    cyclic.self = cyclic;
    const out = scrubBreadcrumb({ category: "ui.tap", data: { frame: cyclic } });
    expect(JSON.stringify(out)).not.toContain("48310277");
  });

  it("redacts a UI crumb message that carries a rendered label", () => {
    // The mobile twin of a DOM breadcrumb: a native touch crumb names the
    // component and its accessibility label. The 8-digit ID has a shape and
    // goes; the NAME does not, which is precisely why the two Next apps now
    // refuse to collect DOM crumbs at all instead of trying to clean them.
    const out = scrubBreadcrumb({
      category: "touch",
      message: 'Pressable[accessibilityLabel="Aylin Məmmədova 48310277"]',
    });
    expect(out?.message).not.toContain("48310277");
    expect(out?.message).toContain("Pressable");
  });

  it("does not mutate the breadcrumb it was handed", () => {
    const crumb: Breadcrumb = { category: "navigation", message: "child 87654321" };
    scrubBreadcrumb(crumb);
    expect(crumb.message).toBe("child 87654321");
  });
});

describe("scrubEvent", () => {
  /** An event shaped like what this SDK actually assembles on this app. */
  function sampleEvent(): Event {
    return {
      message: "could not save answers for 87654321",
      transaction: "/(student)/test/run/[attemptId]",
      user: { id: "installation-uuid", ip_address: "94.20.1.7" },
      request: { headers: { Cookie: "sb-access-token=abc" }, url: "https://x/y" },
      extra: { answers: { q1: "option-a" } },
      server_name: "someone-macbook",
      tags: { "user.email": "parent@example.com", dist: "42" },
      contexts: {
        // `name` here is `UIDevice.current.name` / `Settings.Global.DEVICE_NAME`
        // — on real phones, a person's first name.
        device: { name: "Aysel's Galaxy", model: "SM-S911B", family: "Galaxy" },
        ota_updates: { update_id: UUID, channel: "production" },
      },
      exception: {
        values: [
          {
            type: "AuthApiError",
            value: "Invalid login credentials for c12345678@children.invalid",
            stacktrace: {
              frames: [
                {
                  filename: "app:///src/features/tests/TestRunnerScreen.tsx",
                  function: "onSubmit",
                  vars: { answers: { q1: "option-a" }, childName: "Aysel" },
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [
        { category: "console", level: "error", message: "child Aysel failed" },
        {
          category: "xhr",
          type: "http",
          data: { url: `https://abc.supabase.co/rest/v1/students?id=eq.${UUID}` },
        },
      ],
    };
  }

  it("deletes every field whose only job is to identify a person or device", () => {
    const out = scrubEvent(sampleEvent());
    expect(out.user).toBeUndefined();
    expect(out.request).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.server_name).toBeUndefined();
  });

  it("deletes the device NAME and keeps the device model", () => {
    // The brief's own example: on both platforms this field is habitually a
    // person's name, and it is the leak that looks like harmless diagnostics.
    const out = scrubEvent(sampleEvent());
    expect(out.contexts?.device?.name).toBeUndefined();
    expect(out.contexts?.device?.model).toBe("SM-S911B");
  });

  it("redacts the issue title, which no SDK option filters", () => {
    const out = scrubEvent(sampleEvent());
    const value = out.exception?.values?.[0]?.value ?? "";
    expect(value).not.toContain("12345678");
    expect(value).toContain("[child-login]");
    // The exception TYPE is a class name and stays — it is most of the
    // diagnostic value of the event.
    expect(out.exception?.values?.[0]?.type).toBe("AuthApiError");
    expect(out.message).toBe("could not save answers for [child-login]");
  });

  // The brief's specific worry: the test runner holds in-flight answers and the
  // draft store keeps them across remounts. Frame locals are the one channel by
  // which a crash there could carry them off the device.
  it("deletes stack-frame locals so a crash mid-attempt cannot ship answers", () => {
    const out = scrubEvent(sampleEvent());
    const frame = out.exception?.values?.[0]?.stacktrace?.frames?.[0];
    expect(frame?.vars).toBeUndefined();
    // …while the frame itself survives. A stack with no frames is not a report.
    expect(frame?.filename).toBe("app:///src/features/tests/TestRunnerScreen.tsx");
    expect(frame?.function).toBe("onSubmit");
  });

  it("applies the breadcrumb rules to crumbs that arrive with the event", () => {
    // Native breadcrumbs are merged into the event by the SDK's DeviceContext
    // integration, i.e. AFTER `beforeBreadcrumb` has stopped being consulted.
    // `beforeSend` is the only place left to catch them.
    const out = scrubEvent(sampleEvent());
    expect(out.breadcrumbs).toHaveLength(1);
    expect(out.breadcrumbs?.[0]?.data?.url).toBe("https://abc.supabase.co/rest/v1/students");
  });

  it("redacts tag values, by KEY as well as by shape", () => {
    const out = scrubEvent(sampleEvent());
    // "[redacted]" and not "[email]": the KEY denylist reaches this tag before
    // the shape rules do, and it has to, because a tag keyed `child_name` or
    // `school` carries an ordinary word that no pattern can recognise. Losing
    // the `[email]` label is the price of the key check, and tags are INDEXED
    // AND SEARCHABLE in Sentry, so it is worth paying here above anywhere else.
    expect(out.tags?.["user.email"]).toBe("[redacted]");
    expect(out.tags?.dist).toBe("42");
  });

  it("leaves the fields that make an event readable alone", () => {
    // Over-deletion is the other way to fail. The OTA update id is a dashed
    // UUID, which a blind recursive redactor would have eaten — and it is how a
    // crash gets tied to the build that caused it.
    const out = scrubEvent(sampleEvent());
    expect(out.contexts?.ota_updates?.update_id).toBe(UUID);
    expect(out.contexts?.ota_updates?.channel).toBe("production");
    expect(out.transaction).toBe("/(student)/test/run/[attemptId]");
  });

  it("survives an event with none of those fields", () => {
    // Native crash events arrive sparse. A scrubber that throws on a missing
    // field would take out the report it was meant to clean.
    expect(() => scrubEvent({})).not.toThrow();
  });
});

describe("IGNORED_ERRORS", () => {
  it("silences React Native's offline fetch error", () => {
    // 12 closed testers on Azerbaijani mobile data generate this continuously,
    // none of it actionable, against a 5,000/month org-wide allowance that
    // cannot be topped up.
    expect(IGNORED_ERRORS).toContain("Network request failed");
  });

  it("is a flat list of matchers the SDK understands", () => {
    for (const entry of IGNORED_ERRORS) {
      expect(typeof entry === "string" || entry instanceof RegExp).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// THE PARENTHESIS HOLE
//
// A real Azerbaijani school is written "132 (tam orta) məktəb". The row rules
// used to end their payload at `[^)]*` — the FIRST inner close-parenthesis — so
// a row carrying that school ended the match at "orta)" and EVERY COLUMN AFTER
// IT left the device: in the fixture below the city, the rayon, the gender and
// the grade.
// ---------------------------------------------------------------------------
const ROW_WITH_NESTED_PARENS =
  "Failing row contains (a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d, Aylin, " +
  "Məmmədova, 48310277, 132 (tam orta) məktəb, Bakı, Nəsimi, female, 7)";

describe("redact — a value that carries its own parentheses", () => {
  it("(a) wipes the whole row, not just the part before the inner `)`", () => {
    const out = redact(ROW_WITH_NESTED_PARENS);
    for (const word of [...ROW_WORDS, "tam orta", "məktəb", "132"]) {
      expect(out).not.toContain(word);
    }
    expect(out).not.toContain("48310277");
    expect(out).toBe("Failing row contains ([redacted])");
  });

  it("(a) wipes a Key DETAIL whose VALUE carries parentheses", () => {
    const out = redact("DETAIL: Key (school)=(132 (tam orta) məktəb) already exists.");
    expect(out).not.toContain("tam orta");
    expect(out).not.toContain("məktəb");
    expect(out).toBe("DETAIL: Key ([redacted])=([redacted]) already exists.");
  });

  it("(b) does not swallow the sentence that follows the construct", () => {
    // Why this is a balanced matcher and not a greedy `\(.*\)`: greedy would run
    // to the LAST parenthesis on the line and take the diagnosis with it, which
    // on a child's phone means a crash report that says nothing.
    const out = redact(
      "Failing row contains (a1b2, Aylin, 7). Retry the submit (attempt 2) after a reload.",
    );
    expect(out).not.toContain("Aylin");
    expect(out).toBe(
      "Failing row contains ([redacted]). Retry the submit (attempt 2) after a reload.",
    );
  });

  it("(b) keeps ` already exists.` after a Key DETAIL, and handles two on a line", () => {
    expect(redact("DETAIL: Key (child_unique_id)=(48310277) already exists.")).toBe(
      "DETAIL: Key ([redacted])=([redacted]) already exists.",
    );
    expect(redact("Key (a)=(b) and Key (c)=(d) differ")).toBe(
      "Key ([redacted])=([redacted]) and Key ([redacted])=([redacted]) differ",
    );
  });

  it("(c) stays idempotent on the nested-parenthesis form", () => {
    const once = redact(ROW_WITH_NESTED_PARENS);
    expect(redact(once)).toBe(once);
    const key = redact("Key (school)=(132 (tam orta) məktəb) already exists.");
    expect(redact(key)).toBe(key);
  });

  it("over-redacts to the end of the line rather than leaking an UNBALANCED row", () => {
    // A regex cannot count, so a stray `(` inside a value defeats the balanced
    // branch. The fallback takes the rest of the LINE: the trailing prose is
    // lost, the row never is.
    const out = redact(
      'Failing row contains (Məktəb (filial, Aylin, 48310277, female\ncontext: "insert"',
    );
    for (const word of ["Aylin", "female", "filial", "48310277"]) {
      expect(out).not.toContain(word);
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
      expect(serialized).not.toContain(word);
    }
    expect(out.exception?.values?.[0]?.type).toBe("PostgrestError");
  });
});

// ---------------------------------------------------------------------------
// CONTEXTS
//
// `scrubEvent` used to delete `contexts.device.name` and nothing else, which
// meant every OTHER context field shipped verbatim. `contexts` is an OPEN MAP
// that any integration may write into, and on this product the values inside
// one are a child's name, school and login ID.
// ---------------------------------------------------------------------------
describe("scrubEvent — contexts are WALKED, not only trimmed", () => {
  it("blanks a context field whose KEY names a person, however deep it sits", () => {
    const out = scrubEvent({
      message: "boom",
      contexts: {
        app: {
          app_version: "1.16.0",
          state: { selected: { child_name: "Aylin", school: "Bakı 132" } },
        },
        device: { name: "Aysel's Galaxy", model: "SM-S911B" },
      },
    } as Event);

    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("Aylin");
    expect(serialized).not.toContain("Bakı 132");
    // device.name stays DELETED rather than becoming "[redacted]": an absent
    // field reads as one we never collected, which is the true statement here.
    expect(out.contexts?.device?.name).toBeUndefined();
    // Over-deletion is the other way to fail.
    expect(out.contexts?.device?.model).toBe("SM-S911B");
    expect(out.contexts?.app?.app_version).toBe("1.16.0");
  });

  it("redacts a SHAPED value inside a context, under any key at all", () => {
    const out = scrubEvent({
      message: "boom",
      contexts: { app: { last_opened: "48310277", owner: "leyla.m@example.com" } },
    } as Event);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("48310277");
    expect(serialized).not.toContain("leyla.m");
  });

  it("collapses a URL-shaped context FIELD, query string and all", () => {
    // The mobile twin of `contexts.nextjs.request_path`: an expo-router or
    // navigation context field is a resolved path, and `redact` alone leaves
    // `?q=<a child's name>` completely intact because a word has no shape.
    const out = scrubEvent({
      message: "boom",
      contexts: { router: { path: `/(parent)/children/${UUID}?q=Aylin` } },
    } as Event);
    expect(out.contexts?.router?.path).toBe("/(parent)/children/[uuid]");
    expect(JSON.stringify(out)).not.toContain("Aylin");
  });

  it("keeps the OTA update id, which is how a crash is tied to its build", () => {
    // The walk would otherwise eat it: it is a dashed UUID. Same reason
    // `debug_meta` is not touched at all — redacting it breaks symbolication.
    const out = scrubEvent({
      message: "boom",
      contexts: { ota_updates: { update_id: UUID, channel: "production" } },
    } as Event);
    expect(out.contexts?.ota_updates?.update_id).toBe(UUID);
    expect(out.contexts?.ota_updates?.channel).toBe("production");
  });

  it("bounds the walk so a cyclic context cannot hang beforeSend", () => {
    // A native event object or an Error whose `cause` chain loops back reaches
    // beforeSend as a cycle. There is no timeout there, and the app is already
    // on an error path: a hang is a wedged SDK on a child's phone.
    const cyclic: Record<string, unknown> = { ref: "48310277" };
    cyclic.self = cyclic;
    const out = scrubEvent({
      message: "boom",
      contexts: { app: { frame: cyclic } },
    } as unknown as Event);
    expect(JSON.stringify(out)).not.toContain("48310277");
  });
});

// ---------------------------------------------------------------------------
// TAGS
//
// Tags are INDEXED AND SEARCHABLE in Sentry, which makes a tag the worst place
// on an event for a name to land: it is queryable across the whole project.
// Redaction by shape alone was not a control here — a tag keyed `child_name`,
// `school` or `gender` carries an ordinary word.
// ---------------------------------------------------------------------------
describe("scrubEvent — tags go through the KEY denylist, not only the shapes", () => {
  it("blanks a tag whose key names a person attribute", () => {
    const out = scrubEvent({
      message: "boom",
      tags: {
        child_name: "Aylin",
        school: "132 (tam orta) məktəb",
        gender: "female",
        screen: "TestRunner",
      },
    } as Event);
    expect(out.tags?.child_name).toBe("[redacted]");
    expect(out.tags?.school).toBe("[redacted]");
    expect(out.tags?.gender).toBe("[redacted]");
    // A tag that names nothing personal is left alone: the tool has to stay
    // useful, not merely safe.
    expect(out.tags?.screen).toBe("TestRunner");
    expect(JSON.stringify(out)).not.toContain("Aylin");
  });

  it("still redacts by shape under a key the denylist does not name", () => {
    const out = scrubEvent({
      message: "boom",
      tags: { ref: 48310277, dist: "42" },
    } as unknown as Event);
    expect(out.tags?.ref).toBe("[redacted]");
    expect(out.tags?.dist).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// BREADCRUMB URLs
//
// The query string used to be dropped only for a `url` key on an xhr/fetch/http
// crumb. Every other category kept it, and `to`/`from` were not treated as URLs
// at all — so a navigation crumb carried `?q=<a child's name>` in full.
// ---------------------------------------------------------------------------
describe("scrubBreadcrumb — every URL key, on every category", () => {
  it("drops the query string from navigation `from` and `to`", () => {
    const out = scrubBreadcrumb({
      category: "navigation",
      data: {
        from: "/(parent)/children?q=Aylin",
        to: `/(parent)/children/${UUID}?school=Bak%C4%B1%20132`,
      },
    });
    expect(out?.data?.from).toBe("/(parent)/children");
    expect(out?.data?.to).toBe("/(parent)/children/[uuid]");
    expect(JSON.stringify(out)).not.toContain("Aylin");
  });

  it("drops the query string from a `url` on a NON-http category", () => {
    const out = scrubBreadcrumb({
      category: "ui.tap",
      data: { url: "https://olympiq.ai/child/test?q=Aylin" },
    });
    expect(out?.data?.url).toBe("https://olympiq.ai/child/test");
  });

  it("collapses the other URL-shaped keys the two Next apps also collapse", () => {
    const out = scrubBreadcrumb({
      category: "sentry.transaction",
      data: {
        path: "/child/test/run?attempt=1",
        href: "https://olympiq.ai/checkout?email=a@b.com",
        request_path: `/api/mobile/v1/children/${UUID}?q=Aylin`,
      },
    });
    expect(out?.data?.path).toBe("/child/test/run");
    expect(out?.data?.href).toBe("https://olympiq.ai/checkout");
    expect(out?.data?.request_path).toBe("/api/mobile/v1/children/[uuid]");
  });
});

// ---------------------------------------------------------------------------
// THE VALUE-SHAPED BACKSTOP
//
// SENSITIVE_KEY_RE is a list of NAMES, so a key nobody thought of carries its
// value through. A STRING is still covered, because `redact` reads the value
// itself — but a NUMBER never reaches `redact`, and an 8-digit child login ID
// arrives as a number as often as it arrives as a string.
// ---------------------------------------------------------------------------
describe("structured values are redacted by SHAPE under a key nobody listed", () => {
  it("redacts an 8-digit login ID arriving as a NUMBER", () => {
    const out = scrubBreadcrumb({
      category: "xhr",
      data: { ref: 48310277, seq: 12, bytes: 17179869184 },
    });
    expect(out?.data?.ref).toBe("[redacted]");
    // Over-redaction is the other way to fail: a number that is not an 8-digit
    // run is diagnostics, and diagnostics are the reason to send anything.
    expect(out?.data?.seq).toBe(12);
    expect(out?.data?.bytes).toBe(17179869184);
  });

  it("redacts an E.164 phone and an email under innocent-looking keys", () => {
    const out = scrubBreadcrumb({
      category: "xhr",
      data: { contact: "+994501234567", owner: "leyla.m@example.com" },
    });
    expect(String(out?.data?.contact)).not.toContain("994501234567");
    expect(String(out?.data?.owner)).not.toContain("leyla.m");
  });
});

// ---------------------------------------------------------------------------
// THE THREE SCRUBBERS MUST AGREE ON THE ROW DETAIL
//
// A Postgres DETAIL reaches all three apps: this app and the web app speak to
// PostgREST directly, and the admin panel reads the same errors back through
// it. So a hole in this rule is a hole in the PRODUCT, not in one client — the
// rule has one definition and three copies, compared here byte for byte. If
// this fails, do not edit one file until it matches: fix the rule once and copy
// the whole block into all three.
// ---------------------------------------------------------------------------
const SHARED_BEGIN = "// --- SHARED ROW-DETAIL RULES: BEGIN ---";
const SHARED_END = "// --- SHARED ROW-DETAIL RULES: END ---";

function sharedRowRules(...parts: string[]): string {
  const source = readFileSync(resolve(__dirname, "..", ...parts), "utf8")
    .split("\r\n")
    .join("\n");
  const start = source.indexOf(SHARED_BEGIN);
  const end = source.indexOf(SHARED_END);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + SHARED_END.length);
}

describe("the row-detail rules are identical in all three apps", () => {
  it("mobile-app, web-app and admin-panel carry the same block", () => {
    const mobile = sharedRowRules("src", "lib", "sentryScrub.ts");
    expect(
      sharedRowRules("..", "web-app", "src", "lib", "observability", "sentryScrub.ts"),
    ).toBe(mobile);
    expect(sharedRowRules("..", "admin-panel", "src", "lib", "sentry", "scrub.ts")).toBe(
      mobile,
    );
  });

  it("the block is the rules, and not the pattern they replaced", () => {
    // A string comparison alone would pass on three identical EMPTY blocks, and
    // it would pass on three identical copies of the defect.
    const code = sharedRowRules("src", "lib", "sentryScrub.ts")
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
