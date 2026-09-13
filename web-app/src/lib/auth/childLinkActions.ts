"use server";

import { revalidatePath } from "next/cache";
import { requireParent } from "@/lib/auth/session";
import { getChildLinkState, mutateChildLink } from "@/lib/auth/childLinkCore";
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
