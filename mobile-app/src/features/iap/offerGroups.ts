// HOW THE OFFER LIST IS PRESENTED: one group per subject, its periods inside.
//
// buildOffers() returns one row per SKU — seven subjects times three periods is
// twenty-one purchase buttons in a single column, which is what the owner saw
// on device and rightly called strange. The panel now renders one section per
// subject with the periods as a choice inside it and ONE action, the way a
// subscription paywall does. This file is the pure half of that: no React, no
// react-native, so the grouping is unit-tested on its own.
//
// NOTHING HERE TOUCHES A PRICE. Each period carries the IapOffer it came from,
// untouched, so `displayPrice` is still StoreKit's own string when the panel
// renders it. This file neither reads nor compares it — "which period is the
// best value" would mean parsing a localised price, and that is exactly the
// kind of helper the store-boundary test exists to keep out of this module.
import type { IapOffer } from "./catalog";

export type IapInterval = IapOffer["interval"];

/** One subject and the periods it can be activated for. */
export type IapOfferGroup = {
  subjectId: string;
  subjectCode: string | null;
  subjectName: string | null;
  /** Shortest period first. Never empty, never two offers for one period. */
  offers: IapOffer[];
};

const INTERVAL_ORDER: Record<IapInterval, number> = { week: 0, month: 1, year: 2 };

/**
 * The period a subject opens on: monthly when it is sold, otherwise the
 * shortest period that is. Monthly is the middle option and the one most
 * families pick; preselecting the YEAR would put the largest charge one tap
 * from the action, which is the dark-pattern direction.
 */
const PREFERRED: IapInterval[] = ["month", "week", "year"];

/**
 * Group SKU rows by subject.
 *
 * SUBJECT ORDER IS buildOffers()'s ORDER, kept as-is: that sort is code-point
 * based and locale-independent on purpose (see catalog.ts), and re-sorting here
 * would reintroduce the reshuffle it removed. A subject's position is where its
 * FIRST offer appeared, so a subject still groups even if its rows were not
 * adjacent.
 *
 * A second offer for a period the subject already has is dropped (first wins).
 * The catalogue should never hold one, and showing two "Monthly" options that
 * charge different amounts would be worse than showing one.
 */
export function groupIapOffers(offers: readonly IapOffer[]): IapOfferGroup[] {
  const groups: IapOfferGroup[] = [];
  const index = new Map<string, IapOfferGroup>();
  for (const offer of offers) {
    let group = index.get(offer.subjectId);
    if (!group) {
      group = {
        subjectId: offer.subjectId,
        subjectCode: offer.subjectCode,
        subjectName: offer.subjectName,
        offers: [],
      };
      index.set(offer.subjectId, group);
      groups.push(group);
    }
    if (group.offers.some((o) => o.interval === offer.interval)) continue;
    group.offers.push(offer);
  }
  for (const group of groups) {
    group.offers.sort((a, b) => INTERVAL_ORDER[a.interval] - INTERVAL_ORDER[b.interval]);
  }
  return groups;
}

/** The offer a group shows as chosen before the parent touches anything. */
export function defaultOffer(group: IapOfferGroup): IapOffer | null {
  for (const interval of PREFERRED) {
    const hit = group.offers.find((o) => o.interval === interval);
    if (hit) return hit;
  }
  return group.offers[0] ?? null;
}

/**
 * The chosen offer for a group: the parent's pick when that period is still on
 * sale, the default otherwise. A pick can go stale when the catalogue changes
 * under the screen (a product switched off, a refetch) — it then falls back
 * rather than leaving the group with nothing selected and an action that
 * cannot say what it would charge.
 */
export function selectedOffer(
  group: IapOfferGroup,
  picked: IapInterval | undefined,
): IapOffer | null {
  if (picked) {
    const hit = group.offers.find((o) => o.interval === picked);
    if (hit) return hit;
  }
  return defaultOffer(group);
}

/**
 * Which subject section is open. `undefined` means the parent has not touched
 * the list yet, and the FIRST subject opens so a price is on screen without a
 * tap. `null` means they closed it, and it stays closed. A subject that has
 * left the list (just activated, or a sibling's list with different subjects)
 * hands the open state back to the first one.
 */
export function openSubjectId(
  groups: readonly IapOfferGroup[],
  chosen: string | null | undefined,
): string | null {
  if (chosen === null) return null;
  if (chosen !== undefined && groups.some((g) => g.subjectId === chosen)) return chosen;
  return groups[0]?.subjectId ?? null;
}
