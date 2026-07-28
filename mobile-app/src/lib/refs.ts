// Ref plumbing for the input primitives. They need their OWN handle on the
// native node (to measure it when it takes focus) while still honouring a
// caller-supplied ref used for focus chaining ("Next" -> next field).
import { useCallback, type Ref, type RefObject } from "react";

/** Write a node into either ref shape. A missing ref is a no-op, not an error. */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref) (ref as { current: T | null }).current = value;
}

/** Fan a single `ref` prop out to an internal ref object and the caller's ref. */
export function useMergedRef<T>(
  external: Ref<T> | undefined,
  internal: RefObject<T | null>,
): (node: T | null) => void {
  return useCallback(
    (node: T | null) => {
      internal.current = node;
      assignRef(external, node);
    },
    [external, internal],
  );
}
