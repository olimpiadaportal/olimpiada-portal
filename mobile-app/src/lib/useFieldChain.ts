// "Next" -> "Next" -> "Done" focus chaining for ONE contiguous run of text
// inputs, so a screen wires a chain in two lines:
//
//   const chain = useFieldChain(2, { onLast: submit });   // submit already exists
//   <TextField {...chain.field(0)} label={…} value={…} />
//   <PasswordField {...chain.field(1)} label={…} value={…} />
//
// A "run" is a contiguous stretch of TEXT inputs, NOT a whole screen. Selects,
// avatar pickers, summary cards and second forms break a run: chaining across
// them would silently skip a required select or cross into a different submit
// handler. Declare one chain per run instead.
//
// `onLast` must be the screen's EXISTING submit function — this hook adds a
// trigger, it never changes what submitting does. Omit it and the return key
// simply closes the keyboard.
import { useCallback, useMemo, useRef } from "react";
import type { TextInput } from "react-native";
import {
  chainLastAction,
  chainReturnKeyType,
  chainSubmitBehavior,
  isLastField,
  type FieldChainLast,
} from "@/components/keyboardLayout";

export type FieldChainProps = {
  ref: (node: TextInput | null) => void;
  returnKeyType: "next" | "done";
  submitBehavior: "submit" | "blurAndSubmit";
  onSubmitEditing: () => void;
};

export type FieldChain = {
  /** Spread onto the field at `index` (0-based, in visual order). */
  field: (index: number) => FieldChainProps;
  /** Move focus manually — e.g. from ChildIdField's `onComplete`. */
  focus: (index: number) => void;
  /** What the return key on the last field does, given the options passed. */
  lastAction: FieldChainLast;
};

export function useFieldChain(count: number, options?: { onLast?: () => void }): FieldChain {
  const onLast = options?.onLast;
  const nodes = useRef<(TextInput | null)[]>([]);

  const focus = useCallback((index: number) => {
    // A guarded call on purpose: the login screen swaps its whole field set when
    // the Parent/Student segment changes, so a stale slot must be a no-op rather
    // than a focus() on an unmounted input.
    nodes.current[index]?.focus();
  }, []);

  const field = useCallback(
    (index: number): FieldChainProps => ({
      ref: (node: TextInput | null) => {
        nodes.current[index] = node;
      },
      returnKeyType: chainReturnKeyType(index, count),
      submitBehavior: chainSubmitBehavior(index, count),
      onSubmitEditing: () => {
        if (isLastField(index, count)) onLast?.();
        else focus(index + 1);
      },
    }),
    [count, focus, onLast],
  );

  return useMemo(
    () => ({ field, focus, lastAction: chainLastAction(Boolean(onLast)) }),
    [field, focus, onLast],
  );
}
