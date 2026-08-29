// Every destructive button in the panel composes `.btn` with `.btn-danger`.
//
// WHY THIS IS PINNED. The owner reported the delete dialog as "an aggressive red
// block and the text is difficult to read". The whole defect was one missing
// class: `.btn-danger` declares ONLY `background: #dc2626`, so a button carrying
// it alone keeps the browser's default 13px black system label with no padding,
// no radius and no border reset — and it also misses `.btn:disabled`, so a
// confirmation gate the admin has NOT yet satisfied renders identically to an
// armed one. That second half is a misclick waiting to happen, which is why the
// composition is a correctness property and not a styling preference.
//
// It was fixed once, in the rebuilt subject dialog, and stayed broken in the
// SHARED DestructiveConfirm still serving the olympiad grade-pool and bulk-pool
// dialogs — the same unreadable button, in a file nobody re-read. So this scans
// EVERY component and page rather than one file: the next person who writes
// className="btn-danger" alone is caught wherever they write it.
//
// Source-level, matching the repo's existing shape for invariants that live in a
// file rather than in behaviour (subject-delete-dialog, guarded-deletion-sql): a
// jsdom render reports "a button exists" without noticing it looks unstyled.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = resolve(process.cwd(), "src");
const CSS = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

/** Every .ts/.tsx under src/, minus the test files themselves. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      out.push(...sources(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** The declarations of one top-level rule, so the premise below is asserted. */
function ruleBody(selector: string): string {
  const start = CSS.indexOf(`\n${selector} {`);
  expect(start, `${selector} is not in globals.css`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf("}", start));
}

describe("the danger classes cannot stand on their own", () => {
  // If someone later makes `.btn-danger` self-sufficient, this fails and the
  // composition rule below gets revisited deliberately instead of silently.
  it(".btn carries the shape and .btn-danger carries only the fill", () => {
    const btn = ruleBody(".btn");
    expect(btn).toContain("color: #fff");
    expect(btn).toMatch(/padding:/);
    expect(btn).toMatch(/border-radius:/);

    const danger = ruleBody(".btn-danger");
    expect(danger).toContain("background: #dc2626");
    expect(danger, ".btn-danger must not declare its own text color").not.toMatch(
      /(^|[\s;]) *color:/m,
    );
    expect(danger, ".btn-danger must not declare its own padding").not.toMatch(
      /padding:/,
    );
  });

  it(".btn:disabled is the only thing that dims a destructive button", () => {
    // The reason a lone .btn-danger gate looks armed: nothing else in the sheet
    // reacts to the disabled attribute on it.
    expect(ruleBody(".btn:disabled")).toMatch(/opacity:/);
    expect(ruleBody(".btn-danger:disabled")).not.toMatch(/opacity:/);
  });
});

describe("no destructive button ships without .btn", () => {
  // Plain string literals, not `className="…"` specifically: a class list also
  // reaches the DOM through a ternary or a `triggerClassName` prop, and those
  // are exactly the spellings a `className="` regex would wave through.
  const found = sources(SRC_DIR).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return (text.match(/"[^"\n]*btn-danger[^"\n]*"/g) ?? []).map((literal) => ({
      file: file.slice(SRC_DIR.length + 1).split("\\").join("/"),
      classes: literal.slice(1, -1).split(/\s+/).filter(Boolean),
      literal,
    }));
  });

  it("finds the destructive buttons at all", () => {
    // Guards the scan itself: a broken walker must fail, not pass vacuously.
    expect(found.length).toBeGreaterThanOrEqual(4);
  });

  it("composes .btn-danger with .btn everywhere", () => {
    for (const { file, classes, literal } of found) {
      if (!classes.includes("btn-danger")) continue;
      expect(classes, `${file}: ${literal} must compose with .btn`).toContain(
        "btn",
      );
    }
  });

  it("composes .btn-danger-ghost with .btn-ghost everywhere", () => {
    // Same failure mode, other pair: .btn-danger-ghost declares only a color
    // and a border color and inherits the rest from .btn-ghost.
    for (const { file, classes, literal } of found) {
      if (!classes.includes("btn-danger-ghost")) continue;
      expect(
        classes,
        `${file}: ${literal} must compose with .btn-ghost`,
      ).toContain("btn-ghost");
    }
  });
});

describe("the shared dialog specifically", () => {
  it("DestructiveConfirm's submit carries both classes", () => {
    // Named outright because this one component is the button on screen for the
    // olympiad grade-pool delete, the bulk pool delete and the bulk status
    // change — three dialogs whose regression would read as three bugs.
    const src = readFileSync(
      resolve(process.cwd(), "src/components/DestructiveConfirm.tsx"),
      "utf8",
    );
    expect(src).toContain('className="btn btn-danger"');
    expect(src).not.toMatch(/className="btn-danger"/);
  });
});
