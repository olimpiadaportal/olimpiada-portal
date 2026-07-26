import {
  indicatorRect,
  LAYOUT_EPSILON,
  layoutChanged,
  segmentIndex,
  type SegmentRect,
} from "@/components/segmentedLayout";

// Real-shaped measurements: the billing switcher in Azerbaijani, inside a track
// with 3pt of padding. The three cells are deliberately NOT equally wide.
const AZ_BILLING: SegmentRect[] = [
  { x: 3, width: 86.5 }, // Həftəlik
  { x: 89.5, width: 62 }, // Aylıq
  { x: 151.5, width: 58.5 }, // İllik
];

type Option = { value: string; label: string };

const OPTIONS: Option[] = [
  { value: "week", label: "Həftəlik" },
  { value: "month", label: "Aylıq" },
  { value: "year", label: "İllik" },
];

describe("segmentIndex", () => {
  it("finds the selected option", () => {
    expect(segmentIndex(OPTIONS, "week")).toBe(0);
    expect(segmentIndex(OPTIONS, "month")).toBe(1);
    expect(segmentIndex(OPTIONS, "year")).toBe(2);
  });

  it("reports -1 for a value that is not in the set", () => {
    expect(segmentIndex(OPTIONS, "quarter")).toBe(-1);
    expect(segmentIndex([], "week")).toBe(-1);
  });
});

describe("indicatorRect", () => {
  it("gives each option its OWN width — never an even split of the track", () => {
    expect(indicatorRect(AZ_BILLING, 0)).toEqual({ x: 3, width: 86.5 });
    expect(indicatorRect(AZ_BILLING, 1)).toEqual({ x: 89.5, width: 62 });
    expect(indicatorRect(AZ_BILLING, 2)).toEqual({ x: 151.5, width: 58.5 });
  });

  it("places the first option at the track padding, not at x=0", () => {
    // onLayout already folds the parent's padding into x, so the indicator can
    // sit at left:0 and translate by exactly this value.
    expect(indicatorRect(AZ_BILLING, 0)?.x).toBe(3);
  });

  it("stays null until the selected option has been measured (first render)", () => {
    expect(indicatorRect([], 0)).toBeNull();
    expect(indicatorRect([undefined, { x: 89.5, width: 62 }], 0)).toBeNull();
    // A later sibling measured first must not place the indicator either.
    expect(indicatorRect([undefined], 0)).toBeNull();
  });

  it("stays null when nothing is selected or the index is out of range", () => {
    expect(indicatorRect(AZ_BILLING, -1)).toBeNull();
    expect(indicatorRect(AZ_BILLING, 3)).toBeNull();
    expect(indicatorRect(AZ_BILLING, 1.5)).toBeNull();
  });

  it("rejects degenerate measurements instead of collapsing the chip", () => {
    expect(indicatorRect([{ x: 3, width: 0 }], 0)).toBeNull();
    expect(indicatorRect([{ x: 3, width: -10 }], 0)).toBeNull();
    expect(indicatorRect([{ x: Number.NaN, width: 40 }], 0)).toBeNull();
    expect(indicatorRect([{ x: 3, width: Number.POSITIVE_INFINITY }], 0)).toBeNull();
  });

  it("tracks a relayout — a locale switch remeasures every cell", () => {
    // Same index, Russian labels: wider cells, shifted origins.
    const ruBilling: SegmentRect[] = [
      { x: 3, width: 118 },
      { x: 121, width: 112 },
      { x: 233, width: 104 },
    ];
    expect(indicatorRect(ruBilling, 1)).toEqual({ x: 121, width: 112 });
  });
});

describe("layoutChanged", () => {
  it("accepts the very first measurement", () => {
    expect(layoutChanged(undefined, { x: 3, width: 86.5 })).toBe(true);
  });

  it("ignores sub-pixel jitter so Android cannot loop re-renders", () => {
    const previous = { x: 3, width: 86.5 };
    expect(layoutChanged(previous, { x: 3.01, width: 86.49 })).toBe(false);
    expect(layoutChanged(previous, { x: 3.4, width: 86.9 })).toBe(false);
  });

  it("accepts a real move or resize", () => {
    const previous = { x: 3, width: 86.5 };
    expect(layoutChanged(previous, { x: 3 + LAYOUT_EPSILON, width: 86.5 })).toBe(true);
    expect(layoutChanged(previous, { x: 3, width: 86.5 + LAYOUT_EPSILON })).toBe(true);
    expect(layoutChanged(previous, { x: 89.5, width: 62 })).toBe(true);
  });
});
