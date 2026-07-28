// Round 53 — the input primitives need their OWN handle on the native node (to
// measure it when it takes focus) while still honouring the caller's ref (focus
// chaining). If the fan-out ever drops one of the two, either auto-scroll or
// "Next" silently stops working, with no crash to notice it by.
import { assignRef } from "@/lib/refs";

type FakeNode = { id: string };
const NODE: FakeNode = { id: "password" };

describe("assignRef", () => {
  it("writes into a ref object", () => {
    const ref: { current: FakeNode | null } = { current: null };
    assignRef(ref, NODE);
    expect(ref.current).toBe(NODE);
  });

  it("clears a ref object on unmount", () => {
    const ref: { current: FakeNode | null } = { current: NODE };
    assignRef(ref, null);
    expect(ref.current).toBeNull();
  });

  it("calls a callback ref with the node", () => {
    const seen: (FakeNode | null)[] = [];
    const ref = (node: FakeNode | null) => {
      seen.push(node);
    };
    assignRef(ref, NODE);
    assignRef(ref, null);
    expect(seen).toEqual([NODE, null]);
  });

  it("is a no-op for an absent ref — every primitive's `ref` prop is optional", () => {
    expect(() => assignRef(undefined, NODE)).not.toThrow();
    expect(() => assignRef(null, NODE)).not.toThrow();
  });
});
