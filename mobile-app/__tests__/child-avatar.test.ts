import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasRemovableChildPhoto,
  isChildAvatarPreset,
  resolveChildAvatarSource,
} from "@/lib/childAvatar";

/** A source file with its comments stripped — the guards below look for CODE,
 *  and a comment explaining what must never be done is not the deed. */
const srcCode = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", "src", ...parts), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("resolveChildAvatarSource", () => {
  it("resolves a photo when the kind is photo AND a path exists", () => {
    expect(
      resolveChildAvatarSource({
        avatar_kind: "photo",
        avatar_key: null,
        avatar_media_path: "students/abc/xyz.webp",
      }),
    ).toEqual({ type: "photo", path: "students/abc/xyz.webp" });
  });

  it("resolves the boy/girl presets", () => {
    expect(
      resolveChildAvatarSource({ avatar_kind: "preset", avatar_key: "boy" }),
    ).toEqual({ type: "preset", key: "boy" });
    expect(
      resolveChildAvatarSource({ avatar_kind: "preset", avatar_key: "girl" }),
    ).toEqual({ type: "preset", key: "girl" });
  });

  it("preset + NULL key = the default initials bubble", () => {
    expect(
      resolveChildAvatarSource({ avatar_kind: "preset", avatar_key: null }),
    ).toEqual({ type: "default" });
  });

  it("degrades every malformed shape to default (never throws)", () => {
    expect(resolveChildAvatarSource(null)).toEqual({ type: "default" });
    expect(resolveChildAvatarSource(undefined)).toEqual({ type: "default" });
    expect(resolveChildAvatarSource({})).toEqual({ type: "default" });
    // photo without a path can never render — initials, not a broken image
    expect(
      resolveChildAvatarSource({ avatar_kind: "photo", avatar_media_path: "" }),
    ).toEqual({ type: "default" });
    expect(
      resolveChildAvatarSource({ avatar_kind: "photo", avatar_media_path: null }),
    ).toEqual({ type: "default" });
    // unknown kinds/keys are display data, never trusted
    expect(
      resolveChildAvatarSource({ avatar_kind: "preset", avatar_key: "alien" }),
    ).toEqual({ type: "default" });
    expect(
      resolveChildAvatarSource({ avatar_kind: "wallpaper", avatar_key: "boy" }),
    ).toEqual({ type: "default" });
  });

  it("isChildAvatarPreset whitelists exactly boy|girl", () => {
    expect(isChildAvatarPreset("boy")).toBe(true);
    expect(isChildAvatarPreset("girl")).toBe(true);
    expect(isChildAvatarPreset("man")).toBe(false);
    expect(isChildAvatarPreset(null)).toBe(false);
    expect(isChildAvatarPreset(undefined)).toBe(false);
  });
});

describe("hasRemovableChildPhoto", () => {
  it("is true only for a photo — the only case with a file to delete", () => {
    expect(
      hasRemovableChildPhoto({ avatar_kind: "photo", avatar_media_path: "students/a/b.webp" }),
    ).toBe(true);
  });

  it("is false for a preset: the bundled PNG has no object behind it", () => {
    // Regression: deriving the child's Remove button from "some avatar URL
    // resolved" showed Remove for a parent-set preset and deleted nothing.
    expect(hasRemovableChildPhoto({ avatar_kind: "preset", avatar_key: "boy" })).toBe(false);
    expect(hasRemovableChildPhoto({ avatar_kind: "preset", avatar_key: "girl" })).toBe(false);
  });

  it("is false for default / malformed / missing rows", () => {
    expect(hasRemovableChildPhoto(null)).toBe(false);
    expect(hasRemovableChildPhoto(undefined)).toBe(false);
    expect(hasRemovableChildPhoto({})).toBe(false);
    expect(hasRemovableChildPhoto({ avatar_kind: "photo", avatar_media_path: "" })).toBe(false);
  });
});

// A child's photograph must never be reachable without authorization. The
// resolver above cannot enforce that on its own — the leak was a SECOND read
// path that turned profiles.avatar_media_id into a public-bucket URL for a
// student. These guards fail if that path comes back; they are deliberately
// literal, because the property they protect is "no student render site ever
// holds a public URL", which nothing else in the toolchain can see.
describe("no public URL survives on any student avatar path", () => {
  it("the student profile read resolves the students row only", () => {
    const src = srcCode("features", "profile", "studentProfile.ts");
    expect(src).not.toContain("avatar_media_id");
    expect(src).not.toContain("avatarUrl");
  });

  it("the student identity card passes no fallback URL", () => {
    const src = srcCode("features", "profile", "studentSections.tsx");
    expect(src).not.toContain("fallbackUrl");
  });

  it("the shared header trigger blanks the fallback URL for students", () => {
    // Parents keep their own public-bucket avatar here; students must not.
    const src = srcCode("components", "HeaderAvatarButton.tsx");
    expect(src).toMatch(/fallbackUrl=\{isStudent \? null :/);
  });
});
