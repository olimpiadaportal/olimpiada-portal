module.exports = function (api) {
  api.cache(true);
  
  const plugins = [];

  // MEDIUM-10: Strip console.log/warn/error in production builds
  // Prevents sensitive data (emails, tokens, auth state) from leaking via USB debugging or crash reporters
  if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
    plugins.push('transform-remove-console');
  }

  // NOTE: react-native-reanimated/plugin will be added in Phase B
  // when we migrate animations to reanimated's worklet API.
  // Adding it now breaks standard RN Animated (getValue/stopTracking crashes).

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
