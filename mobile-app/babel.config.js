// Babel config for the Expo app.
//
// WHY THIS FILE EXISTS (added 2026-07-31): the project had NO babel config at
// all. Without one, `@expo/metro-config`'s transformer runs Babel with no
// presets, so nothing is transpiled — modern syntax reaches the bundle exactly
// as the dependency shipped it.
//
// That is invisible in Expo Go, because a development bundle is interpreted.
// It only surfaces on a RELEASE export (`eas build` / `eas update`), which
// compiles the bundle to Hermes bytecode ahead of time — and Hermes does NOT
// parse ECMAScript private class fields (`#field`). The first `eas update`
// failed with a wall of:
//
//     error: private properties are not supported
//         #focused;  #cleanup;  #setup;  #provider = defaultTimeoutProvider;
//
// Those come from @tanstack/react-query's FocusManager and timeoutManager —
// library code we do not control, which is precisely why the transform has to
// happen at build time rather than being "fixed" upstream.
//
// `babel-preset-expo` is the SDK's own preset (kept SDK-54-aligned via
// `npx expo install`). It already includes the private-methods /
// private-property-in-object transforms, so listing them separately is
// unnecessary and risks drifting from what the SDK expects.
module.exports = function (api) {
  // Babel caches on NODE_ENV; without this the dev and release transforms can
  // be served from one stale cache entry.
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
