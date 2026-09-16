"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireParent } from "@/lib/auth/session";
import { getChildLinkState, mutateChildLink } from "@/lib/auth/childLinkCore";
import {
  getChildAccessAdults,
  linkChildByCredentials,
  type ChildAccessAdult,
  type CredentialLinkResult,
} from "@/lib/auth/childCredentialLink";
import { rateLimitAllow } from "@/lib/rateLimit";
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

/**
 * Link an existing child by verifying that child's own credentials.
 *
 * `requireParent()` is FIRST, before the form data is read - a credential
 * endpoint that parses input before authorizing is one refactor away from being
 * callable by anyone.
 *
 * The per-IP limiter here has its OWN scope ("childcredlink"). It deliberately
 * does not share the "childlogin" bucket: sharing would mean a parent's link
 * attempts burn a real child's login budget from the same household IP, locking
 * a child out of their own app as a side effect of an adult's typo. It is also
 * not the real control - rateLimit is in-memory per instance, so on a
 * multi-instance deploy the effective ceiling is limit x instances. The database
 * ledger checked inside linkChildByCredentials is the control.
 */
export async function childLinkByCredentialsAction(
  childUniqueId: string,
  password: string,
): Promise<CredentialLinkResult> {
  const parent = await requireParent();

  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
  if (!rateLimitAllow("childcredlink", ip, 20, 15 * 60 * 1000)) {
    return { ok: false, errorKey: "link.err.rate" };
  }
  const ipHash = createHash("sha256").update(ip).digest("hex");

  const result = await linkChildByCredentials({
    actorProfileId: parent.profileId,
    childUniqueId,
    password,
    ipHash,
  });

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
