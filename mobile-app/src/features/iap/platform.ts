// THE ANDROID SWITCH, and nothing else.
//
// Its own file so a screen can ask "may this device purchase?" without pulling
// StoreKit into the module graph. `store.ts` imports it too, so there is exactly
// ONE definition of the answer.
//
// A BUILD-TIME CONSTANT, NEVER A SERVER FLAG. CLAUDE.md and
// docs/STORE_PAYMENTS_COMPLIANCE.md both say it plainly: a purchase flow sitting
// in a store binary behind a remotely-flippable switch is Apple 2.3.1(a), and
// the penalty is developer-account termination rather than a rejection. Android
// stays purchase-silent because Google's consumption-only test is app-wide and
// this one binary serves the parent tabs and the child tabs alike.
import { Platform } from "react-native";

export const IAP_PLATFORM_SUPPORTED = Platform.OS === "ios";
