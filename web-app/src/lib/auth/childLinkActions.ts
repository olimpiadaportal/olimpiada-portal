"use server";

// ONE ROUTE IN: the invite code. The owner withdrew the "child id + child
// password" route on 2026-09-17 (migration 181) — `childLinkByCredentialsAction`
// and its rate-limit bucket were deleted here, and the module behind them with
// them. The reasoning is worth keeping where the next person will look: an
// invite code is a ONE-TIME, EXPIRING secret the CREATING parent generates
// deliberately and hands to a named adult; a child's password is a STANDING
// secret the child also knows and can pass to anyone. Of two overlapping doors,
// the weaker one went.

import { revalidatePath } from "next/cache";
import { requireParent } from "@/lib/auth/session";
import { getChildLinkState, mutateChildLink } from "@/lib/auth/childLinkCore";
import { getChildAccessAdults, type ChildAccessAdult } from "@/lib/auth/childAccessAdults";
import type { ChildLinkMutationInput } from "@/lib/childLink";

export async function childLinkStateAction() {
  const parent = await requireParent();
  return getChildLinkState(parent.profileId);
}

export async function childLinkMutationAction(input: ChildLinkMutationInput) {
  const parent = await requireParent();
  const result = await mutateChildLink(parent.profileId, input);
  if (result.ok) {
    revalidatePath("/dashboard");
    revalidatePath("/children/link");
    revalidatePath("/subscription");
  }
  return result;
}

export async function childAccessAdultsAction(studentProfileId: string): Promise<ChildAccessAdult[]> {
  const parent = await requireParent();
  return getChildAccessAdults(parent.profileId, studentProfileId);
}
