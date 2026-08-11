import type { Locale } from "@/i18n/config";

// olympiad_packages.questions_per_attempt — how many questions ONE olympiad
// attempt serves. Round 49: the value is no longer dead display config; the
// DB draws exactly this many questions per attempt and rotates them PER
// STUDENT so a student never sees a repeat until that grade's pool is
// exhausted, at which point THAT student's cycle resets.
//
// Plain module (no "use server"): the server action, the server pages and the
// client forms all import these pure helpers, and they are unit-tested.
//
// Bounds mirror the DB CHECK on olympiad_packages.questions_per_attempt
// (>= 1 and <= 500). Client `min`/`max` attributes are UX only — the server
// action re-validates every submission (root CLAUDE.md security rule).
export const PER_ATTEMPT_MIN = 1;
export const PER_ATTEMPT_MAX = 500;
/** Column default — used when a legacy row carries no value. */
export const PER_ATTEMPT_DEFAULT = 25;

/**
 * Parses the submitted "questions per attempt" value.
 * Returns null for anything that is not a whole number inside the bounds
 * (empty, NaN, Infinity, "12.5", "1e3", negatives, out of range).
 */
export function parsePerAttempt(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const text = String(raw).trim();
  if (text === "") return null;
  // Digits only: rejects "12.5", "1e3", "+5", "-5", " 5px".
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < PER_ATTEMPT_MIN || n > PER_ATTEMPT_MAX) return null;
  return n;
}

/**
 * How many attempts one full cycle takes: every question of the pool is served
 * exactly once before that student's cycle restarts. The last attempt of a
 * cycle may be a partial/boundary one, hence Math.ceil.
 */
export function estimateCycleAttempts(pool: number, perAttempt: number): number {
  if (!Number.isFinite(pool) || !Number.isFinite(perAttempt)) return 0;
  if (pool <= 0 || perAttempt <= 0) return 0;
  return Math.ceil(pool / perAttempt);
}

/** A published pool can fill an attempt only when it holds at least that many. */
export function poolMeetsPerAttempt(pool: number, perAttempt: number): boolean {
  if (!Number.isFinite(pool) || !Number.isFinite(perAttempt)) return false;
  return pool >= perAttempt;
}

/**
 * The grades whose published pool is smaller than the count they must serve —
 * these block ACTIVATION (a live package must always be able to fill an attempt
 * for every grade it targets). Order is preserved.
 *
 * Migration 106: a grade may carry its OWN questions_per_attempt, so `need` on
 * a row wins over the package-level `perAttempt` argument. Rows without it —
 * every caller before 106 — behave exactly as they did.
 */
export function gradePoolShortfalls<T extends { pool: number; need?: number | null }>(
  grades: readonly T[],
  perAttempt: number,
): T[] {
  return grades.filter((g) => !poolMeetsPerAttempt(g.pool, g.need ?? perAttempt));
}

// Azerbaijani ordinal suffix by numeral vowel harmony ("6-cı sinif"). Grades
// run 1–11 today; the tens table keeps the helper correct if that ever grows.
const AZ_TENS: Record<number, string> = {
  10: "cu", 20: "ci", 30: "cu", 40: "cı", 50: "ci",
  60: "cı", 70: "ci", 80: "ci", 90: "cı", 100: "cü",
};
const AZ_UNITS: Record<number, string> = {
  1: "ci", 2: "ci", 3: "cü", 4: "cü", 5: "ci",
  6: "cı", 7: "ci", 8: "ci", 9: "cu",
};

export function azOrdinalSuffix(n: number): string {
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return "ci";
  const unit = n % 10;
  if (unit === 0) return AZ_TENS[n % 100] ?? AZ_TENS[n % 1000] ?? "cı";
  return AZ_UNITS[unit] ?? "ci";
}

/**
 * Fills `{placeholder}` slots in an i18n template. Unlike String.replace with a
 * plain string pattern this substitutes EVERY occurrence — the pool-shortfall
 * sentence names the required count twice.
 */
export function fillTemplate(
  text: string,
  vars: Record<string, string | number>,
): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.split(`{${k}}`).join(String(v)),
    text,
  );
}

/**
 * Native grade label per locale ("6-cı sinif" / "Grade 6" / "6-й класс").
 * The Azerbaijani ordinal suffix depends on the numeral, so this cannot be a
 * static i18n template — the trilingual word forms live here and are tested.
 * `fallback` (the DB grade name) is used when no usable level is known.
 */
export function gradeLabel(locale: Locale, level: number, fallback = ""): string {
  if (!Number.isFinite(level) || !Number.isInteger(level) || level <= 0) {
    return fallback;
  }
  if (locale === "en") return `Grade ${level}`;
  if (locale === "ru") return `${level}-й класс`;
  return `${level}-${azOrdinalSuffix(level)} sinif`;
}

// ---- Migration 106: per-grade question count + duration --------------------
// Attempt duration bounds, mirroring the DB CHECKs on both olympiad_packages
// and olympiad_package_grades.
const DURATION_MIN = 5;
const DURATION_MAX = 240;

/**
 * Per-grade question count + duration (migration 106).
 *
 * The form posts `qpa_<gradeId>` / `dur_<gradeId>` for every selected grade.
 * With ONE grade the form keeps its single shared pair of fields, so the
 * per-grade names are absent and this falls back to the package values — which
 * is exactly what "one grade behaves as before" means.
 *
 * Returns an error KEY for the first invalid grade rather than silently
 * substituting a default: a package created with the wrong question count is a
 * bug the admin cannot see until a student sits the attempt.
 */
export type PerGradeConfigRow = {
  grade_id: string;
  /** null = no override; the package value applies (DB coalesces). */
  questions_per_attempt: number | null;
  duration_minutes: number | null;
};

export function parsePerGradeConfig(
  fd: FormData,
  gradeIds: string[],
): { ok: true; rows: PerGradeConfigRow[] } | { ok: false; errorKey: string } {
  const rows: PerGradeConfigRow[] = [];
  for (const gid of gradeIds) {
    const rawQ = String(fd.get(`qpa_${gid}`) ?? "").trim();
    const rawD = String(fd.get(`dur_${gid}`) ?? "").trim();

    // Empty or absent → NULL, i.e. inherit. Storing the package's number
    // instead would SHADOW it: later editing the package-level count would
    // silently do nothing, because the grade value always wins.
    let qpa: number | null = null;
    if (rawQ !== "") {
      qpa = parsePerAttempt(rawQ);
      // Present but unparseable is an error, never a silent fallback — a
      // package created with the wrong count is invisible until a student
      // sits the attempt.
      if (qpa === null) return { ok: false, errorKey: "oly2.err.perAttempt" };
    }

    let dur: number | null = null;
    if (rawD !== "") {
      const n = Number(rawD);
      if (!Number.isInteger(n) || n < DURATION_MIN || n > DURATION_MAX) {
        return { ok: false, errorKey: "oly2.err.duration" };
      }
      dur = n;
    }

    rows.push({ grade_id: gid, questions_per_attempt: qpa, duration_minutes: dur });
  }
  return { ok: true, rows };
}
