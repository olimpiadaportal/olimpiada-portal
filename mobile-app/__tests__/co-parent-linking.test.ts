import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replaceAll("\r\n", "\n");

describe("mobile co-parent flow", () => {
  const entry = read("src/app/(parent)/add-child.tsx");
  const screen = read("src/app/(parent)/link-child.tsx");
  const home = read("src/app/(parent)/(tabs)/home.tsx");

  it("offers create and link as explicit Add Child choices", () => {
    expect(entry).toContain('t("link.choice.create")');
    expect(entry).toContain('t("link.choice.existing")');
    expect(entry).toContain('router.push("/(parent)/link-child" as never)');
  });

  it("collects the 8-digit id and one-time code with autofill disabled", () => {
    expect(screen).toContain('keyboardType="number-pad"');
    expect(screen).toContain('importantForAutofill="no"');
    expect(screen).toContain('action: "redeem"');
  });

  it("supports issue, approve, reject, revoke, and self-unlink", () => {
    for (const action of ["issue", "approve", "revoke", "leave"]) {
      expect(screen).toContain(`action: "${action}"`);
    }
    expect(screen).toContain('? "reject" : "revokeInvite"');
  });

  it("does not show subscription/edit controls on a shared-child card", () => {
    expect(home).toContain("{isCreator ? <View");
    expect(home).toContain('t("link.linked")');
  });
});
