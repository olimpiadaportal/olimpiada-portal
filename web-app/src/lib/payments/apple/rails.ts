// THE TWO RAILS — SERVER ONLY.
//
// A rail is "one environment's verifier plus one environment's API client",
// bound together so they can never be mismatched. Both rails exist in every
// deployment, and that is the whole design:
//
//   * App Review testers purchase in SANDBOX, against our PRODUCTION server —
//     it is the only server their build knows. If production cannot verify
//     sandbox data, review fails.
//   * A sandbox purchase must never become real access. So sandbox is verified,
//     recorded, and structurally unable to grant: everything downstream is
//     generic in the environment and the entitlement writer takes an
//     `AppleGrant<"Production">`. The only crossing is `requireProductionGrant`,
//     one greppable name.
//
// There is therefore NO "which environment is this deployment" setting, and
// adding one would undo the separation.
import "server-only";
import { createAppStoreApi, type AppStoreApi } from "./client";
import { createAppleVerifier, type AppleVerifier } from "./verifier";
import type { AppleEnvironment } from "./environment";

export type AppleRail<E extends AppleEnvironment> = {
  readonly environment: E;
  readonly api: AppStoreApi<E>;
  readonly verifier: AppleVerifier<E>;
};

export function createAppleRail<E extends AppleEnvironment>(environment: E): AppleRail<E> {
  return {
    environment,
    api: createAppStoreApi(environment),
    verifier: createAppleVerifier(environment),
  };
}

/**
 * The production rail. Its grants can create access.
 *
 * Built per call rather than held in a module constant so that a configuration
 * change takes effect on the next request rather than on the next cold start;
 * construction is cheap (the expensive parse is inside `config.ts`, memoized).
 */
export function productionRail(): AppleRail<"Production"> {
  return createAppleRail("Production");
}

/**
 * The sandbox rail. Its grants are RECORDED and never granted.
 *
 * Worth recording rather than dropping: App Review's own purchases arrive here,
 * and "the reviewer's purchase reached us and verified" is the single most
 * useful fact to have when a rejection has to be answered.
 */
export function sandboxRail(): AppleRail<"Sandbox"> {
  return createAppleRail("Sandbox");
}
