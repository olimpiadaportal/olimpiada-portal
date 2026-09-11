// The Sentry config is a PRIVACY CONTROL, and the three ways it decays are all
// invisible to a typechecker:
//
//   1. THE WRONG OPTION NAME. Newer Sentry cores replace `sendDefaultPii` with
//      a per-category `dataCollection` object, and the web-app and admin-panel
//      in this same repository run a core that has it. The core bundled with
//      `@sentry/react-native` 7.2.0 — the version Expo pins for SDK 54 — does
//      NOT. Copying an option block from one app to the other therefore writes
//      a key that is silently ignored, and the PII flows. There is no error, no
//      warning and no type failure: `dataCollection` in a Next config is
//      correct, and in this one it is a leak.
//   2. A ZERO THAT ENABLES. `getDefaultIntegrations` decides what to load with
//      `typeof option === "number"`, and zero is a number. `tracesSampleRate: 0`
//      loads the whole tracing stack and either replay rate at `0` installs
//      `mobileReplayIntegration`, which RECORDS THE SCREEN of a child's
//      dashboard. The only way to leave them out is to not write the keys — so
//      a future "let's be explicit and set these to 0" is a regression, and it
//      looks exactly like a tidy-up.
//   3. ONE CALL THAT UNDOES EVERYTHING. `Sentry.setUser()` is expressly exempt
//      from the PII options: Sentry's own documentation says those apply to
//      what the SDK sends by default, "not data that was explicitly set". One
//      call anywhere in `src/` cancels the rest of this file.
//
// These assertions are source-level on purpose. Importing `src/lib/sentry.ts`
// would drag in the native module and prove nothing about what the file SAYS,
// which is the thing that gets edited.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Same source-level idiom as ota-data-safety-freeze.test.ts. */
const readApp = (...parts: string[]) => readFileSync(resolve(__dirname, "..", ...parts), "utf8");

/**
 * Drops whole-line comments. Needed because the rules being enforced here are
 * also NAMED in the prose that explains them — `sentry.ts` says, in a comment,
 * that `Sentry.setUser(...)` must never be called, and a naive search for the
 * call finds that sentence. A test that cannot tell a warning from a violation
 * punishes documentation, so the first thing anyone would do is delete the
 * comment.
 */
const stripComments = (source: string): string =>
  source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

const SENTRY_TS = readApp("src", "lib", "sentry.ts");
const APP_JSON = JSON.parse(readApp("app.json")) as {
  expo: { version: string; plugins: (string | [string, Record<string, unknown>])[] };
};
const EAS_JSON = JSON.parse(readApp("eas.json")) as {
  build: Record<string, { env?: Record<string, string> }>;
};
const PKG = JSON.parse(readApp("package.json")) as {
  version: string;
  dependencies: Record<string, string>;
};

/**
 * The `Sentry.init({...})` call, isolated from the ~40 lines of comment around
 * it. Every assertion below about "the config says X" means the CALL, not the
 * prose — the comments deliberately name the options they warn against, so a
 * whole-file search would find `dataCollection` and `tracesSampleRate` in the
 * very paragraphs explaining why they are absent.
 */
const INIT_CALL = (() => {
  const open = SENTRY_TS.indexOf("Sentry.init({");
  expect(open).toBeGreaterThan(-1);
  const close = SENTRY_TS.indexOf("\n  });", open);
  expect(close).toBeGreaterThan(open);
  return SENTRY_TS.slice(open, close);
})();

/** The call with its inline comments stripped — option syntax only. */
const INIT_OPTIONS = stripComments(INIT_CALL);

describe("the PII option matches the SDK that is actually installed", () => {
  it("writes sendDefaultPii: false", () => {
    expect(INIT_OPTIONS).toMatch(/sendDefaultPii:\s*false/);
  });

  it("never writes dataCollection, which this core would ignore", () => {
    expect(INIT_OPTIONS).not.toContain("dataCollection");
  });

  // The assertion that makes the two above self-correcting. If the RN SDK is
  // ever bumped to a version whose core understands `dataCollection`, this
  // fails — and it should, because on that core `sendDefaultPii` is deprecated,
  // every `dataCollection` category it does not mention DEFAULTS TO PERMISSIVE,
  // and the option written above stops being the right one. Re-read the config
  // rather than deleting this test.
  it("is pinned to a core that has sendDefaultPii and no dataCollection", () => {
    const coreOptions = readFileSync(
      resolve(__dirname, "..", "node_modules", "@sentry", "core", "build", "types", "types-hoist", "options.d.ts"),
      "utf8",
    );
    expect(coreOptions).toContain("sendDefaultPii?: boolean");
    expect(coreOptions).not.toContain("dataCollection");
  });

  it("keeps the Expo-pinned version range for SDK 54", () => {
    // `npx expo install` resolves this from expo's own bundled-native-modules
    // map. A hand-edited "^8.x" would silently change the core, and with it the
    // correct answer to every assertion above.
    expect(PKG.dependencies["@sentry/react-native"]).toBe("~7.2.0");
  });
});

describe("nothing that could photograph or replay a child's screen is enabled", () => {
  it("writes the screen-capture options out as false", () => {
    expect(INIT_OPTIONS).toMatch(/attachScreenshot:\s*false/);
    expect(INIT_OPTIONS).toMatch(/attachViewHierarchy:\s*false/);
    expect(INIT_OPTIONS).toMatch(/enableCaptureFailedRequests:\s*false/);
  });

  it("omits the sample-rate keys entirely rather than setting them to zero", () => {
    // Setting these to 0 is what a careful reader would do, and it is wrong:
    // zero is a number, and the SDK branches on `typeof === "number"`.
    for (const key of [
      "tracesSampleRate",
      "tracesSampler",
      "replaysSessionSampleRate",
      "replaysOnErrorSampleRate",
      "profilesSampleRate",
    ]) {
      expect(INIT_OPTIONS).not.toContain(key);
    }
  });

  it("adds no replay, screenshot or user-interaction integration", () => {
    expect(INIT_OPTIONS).not.toContain("Integration(");
    expect(INIT_OPTIONS).not.toContain("integrations:");
  });
});

describe("no call is made that would re-attach an identity", () => {
  it("never calls Sentry.setUser anywhere in the app source", () => {
    // Not even with a UUID: `profile_id` joins straight to a named child.
    const root = resolve(__dirname, "..", "src");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          /\.tsx?$/.test(entry.name) &&
          /setUser\s*\(/.test(stripComments(readFileSync(full, "utf8")))
        ) {
          offenders.push(full.slice(root.length + 1));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it("does not wrap the root component (touch breadcrumbs, React profiler)", () => {
    expect(readApp("src", "app", "_layout.tsx")).not.toContain("Sentry.wrap");
  });
});

describe("no secret is in a tracked file", () => {
  it("reads the DSN from EXPO_PUBLIC_SENTRY_DSN and nowhere else", () => {
    expect(SENTRY_TS).toContain("process.env.EXPO_PUBLIC_SENTRY_DSN");
    // An ingest DSN literal, in any tracked file, is the mistake this guards.
    expect(SENTRY_TS).not.toMatch(/https:\/\/[0-9a-f]+@[\w.-]*ingest[\w.-]*\.sentry\.io/i);
  });

  it("keeps the config plugin in app.json free of an authToken", () => {
    // The plugin ACCEPTS `authToken` (plugin/build/withSentry.d.ts) and app.json
    // is tracked, so accepting that convenience would commit an org-write token.
    // Its own source calls that out: "DO NOT COMMIT the auth token".
    const entry = APP_JSON.expo.plugins.find(
      (p) => (typeof p === "string" ? p : p[0]).startsWith("@sentry/react-native"),
    );
    expect(entry).toBeDefined();
    if (typeof entry !== "string") {
      expect(Object.keys(entry?.[1] ?? {})).not.toContain("authToken");
    }
    expect(readApp("app.json")).not.toContain("SENTRY_AUTH_TOKEN");
    expect(readApp("eas.json")).not.toMatch(/"SENTRY_AUTH_TOKEN"\s*:\s*"[^"]/);
  });
});

describe("the config plugin cannot break a build that has no Sentry credentials", () => {
  // Adding the plugin adds a sentry-cli upload step to the native build. With
  // no SENTRY_AUTH_TOKEN the CLI exits non-zero and gradle/xcodebuild fail —
  // turning "we added error monitoring" into "EAS builds stopped working".
  // `SENTRY_DISABLE_AUTO_UPLOAD=true` is the SDK's own documented off switch
  // (`sentry.gradle` gates the upload task on it, and both xcode scripts check
  // it), so it ships set until source maps are deliberately turned on.
  //
  // WHEN SOURCE MAPS ARE TURNED ON, this variable must be REMOVED in the same
  // change that adds the token — otherwise the token is set, the maps are not
  // uploaded, and nothing says why.
  it("disables sentry-cli auto-upload on every build profile", () => {
    for (const [name, profile] of Object.entries(EAS_JSON.build)) {
      expect(`${name}:${profile.env?.SENTRY_DISABLE_AUTO_UPLOAD}`).toBe(`${name}:true`);
    }
  });
});

describe("adding Sentry does not release a new version", () => {
  it("leaves expo.version where it was", () => {
    // 1.16.0 is UNRELEASED and already carries a pre-submission blocker of its
    // own (the child gender field). Bumping it here would foreclose the OTA path
    // for that work under `runtimeVersion: appVersion` and start a second
    // release conversation inside this one.
    expect(APP_JSON.expo.version).toBe("1.16.0");
    expect(PKG.version).toBe(APP_JSON.expo.version);
  });
});
