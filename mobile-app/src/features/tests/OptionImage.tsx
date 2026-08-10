// An answer option's figure (Round 53).
//
// Deliberately NOT the same component as QuestionImage: a question figure is a
// single, prominent 220pt-tall illustration, while option figures appear five
// at a time inside a tappable row and must stay small enough that all five fit
// on one screen — otherwise choosing an answer becomes a scrolling exercise.
//
// Failure is SILENT (render nothing) rather than a broken-image box. The option
// still has its letter and, usually, its text; a red placeholder inside a
// tappable answer row reads as "this answer is broken" and would discourage
// picking it, which is a worse failure than an absent picture.
import { useState } from "react";
import { Image } from "expo-image";
import { radius } from "@/theme/tokens";

/** Tall enough to read a diagram, short enough that five options still fit. */
const MAX_HEIGHT = 110;

export function OptionImage({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;

  return (
    <Image
      source={{ uri: url }}
      // contain, never cover: an answer figure cropped is an answer changed.
      contentFit="contain"
      // Left-aligned so the images line up with the option text above/below.
      style={{
        width: "100%",
        height: MAX_HEIGHT,
        borderRadius: radius.sm,
        // Transparent PNGs need a neutral ground or they vanish in dark mode.
        backgroundColor: "#ffffff",
      }}
      transition={120}
      onError={() => setFailed(true)}
      accessible={false}
    />
  );
}
