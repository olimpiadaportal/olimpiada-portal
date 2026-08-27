// The word an admin types to confirm a PERMANENT subject deletion.
//
// ITS OWN MODULE, and that is the whole point: this constant is needed by BOTH
// the dialog (a `"use client"` component) and the server action that validates
// it. It first lived in `deletion-confirm.ts`, which imports `server-only` — so
// the client import compiled fine under tsc and vitest and then failed the
// production build with "You're importing a component that needs server-only".
// A shared literal has to live somewhere neither side is forbidden from
// reaching, so this file imports nothing at all.
//
// Azerbaijani for "delete". Compared case-sensitively against this exact
// string: the character after S is U+0130 LATIN CAPITAL LETTER I WITH DOT
// ABOVE, a different codepoint from ASCII "I", so a dotless-I "SIL" does not
// pass and neither does "sil". That is deliberate, and it is why the literal is
// defined once here rather than retyped at each call site where a lookalike
// could quietly creep in.
export const SUBJECT_DELETE_WORD = "SİL";
