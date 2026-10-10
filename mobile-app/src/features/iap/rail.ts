// THE PLATFORM ROUTER: which store object and which BFF adapter this build's
// purchase surfaces use. One line of logic, in its own file so it cannot be
// decided twice.
//
// iOS → StoreKit + /api/mobile/v1/iap/apple/*
// Android → Google Play Billing + /api/mobile/v1/iap/google/* (owner decision
// 2026-10-10)
//
// Decided by IAP_STORE, a BUILD-TIME constant (platform.ts). Nothing here reads
// configuration: the admin control plane can close the rail (the screens'
// `purchaseEnabled`), never swap it.
import { appleIapApi, googleIapApi } from "./api";
import { IAP_STORE } from "./platform";
import { platformStore } from "./store";
import type { IapApi, IapStore } from "./types";

export const rail: { store: IapStore; api: IapApi } = {
  store: platformStore,
  api: IAP_STORE === "google" ? googleIapApi : appleIapApi,
};
