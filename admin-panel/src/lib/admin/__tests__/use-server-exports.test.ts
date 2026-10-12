// A "use server" module may export ONLY async functions (and types).
//
// THE BUG THIS PINS (2026-10-12). lib/admin/actions.ts exported
// `SUBJECT_LOCALES = ["az","en","ru"]`. Next.js validates the exports of a
// "use server" module at RUNTIME, when the module first loads
// (ensureServerEntryExports, error E352), so `next build`, the type checker and
// every unit test passed — and in production every action in that file threw
// before its first line: the subject edit form's Save, Create subject, and the
// generic row save/delete. Hiding a subject from its edit page showed the
// panel's "Xəta baş verdi" page for a month.
//
// This sweep covers BOTH Next apps, because the rule is the platform's and the
// web app has the same kind of modules.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_SRC = resolve(process.cwd(), "src");
const WEB_SRC = resolve(process.cwd(), "..", "web-app", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/** Strip leading comments, then ask whether the module opens with the directive. */
function isUseServerModule(src: string): boolean {
  const head = src.replace(/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "");
  return /^["']use server["']/.test(head);
}

function badExports(src: string): string[] {
  const bad: string[] = [];
  src.split(/\r?\n/).forEach((line, i) => {
    const l = line.trimEnd();
    if (/^export\s+(const|let|var|class|enum)\s/.test(l)) bad.push(`${i + 1}: ${l}`);
    else if (/^export\s+function\s/.test(l)) bad.push(`${i + 1}: non-async ${l}`);
    else if (/^export\s+default\s+(?!async\b)/.test(l)) bad.push(`${i + 1}: ${l}`);
    else if (/^export\s*\{/.test(l)) bad.push(`${i + 1}: re-export ${l}`);
    else if (/^export\s+\*/.test(l)) bad.push(`${i + 1}: star re-export ${l}`);
  });
  return bad;
}

describe('"use server" modules export only async functions', () => {
  for (const [label, root] of [
    ["admin-panel", ADMIN_SRC],
    ["web-app", WEB_SRC],
  ] as const) {
    it(`${label}: no constant, class, sync function or re-export`, () => {
      const offenders: string[] = [];
      let modules = 0;
      for (const file of walk(root)) {
        const src = readFileSync(file, "utf8");
        if (!isUseServerModule(src)) continue;
        modules++;
        for (const b of badExports(src)) offenders.push(`${relative(root, file)}:${b}`);
      }
      expect(modules).toBeGreaterThan(5);
      expect(offenders).toEqual([]);
    });
  }

  it("the sweep would have caught the original export", () => {
    expect(badExports('export const SUBJECT_LOCALES = ["az", "en", "ru"] as const;')).toHaveLength(1);
    expect(badExports("export type SubjectLocale = string;")).toHaveLength(0);
    expect(badExports("export async function save() {}")).toHaveLength(0);
  });
});
