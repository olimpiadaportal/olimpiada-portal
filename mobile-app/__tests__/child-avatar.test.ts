import {
  isChildAvatarPreset,
  resolveChildAvatarSource,
} from "@/lib/childAvatar";

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
