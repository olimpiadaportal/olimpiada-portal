// FeatureGate Component
// Stage 6 - Week 3: Mobile Feature Integration
// Conditionally renders children based on feature flags

import React, { ReactNode } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useFeatureFlag, FeatureFlagName } from '../hooks/useFeatureFlags';

interface FeatureGateProps {
  /**
   * The feature flag to check
   */
  flag: FeatureFlagName;
  
  /**
   * Children to render if feature is enabled
   */
  children: ReactNode;
  
  /**
   * Optional fallback to render if feature is disabled
   */
  fallback?: ReactNode;
  
  /**
   * Show loading indicator while checking flag
   * @default false
   */
  showLoading?: boolean;
  
  /**
   * Invert the condition (show children when flag is disabled)
   * @default false
   */
  invert?: boolean;
}

/**
 * FeatureGate - Conditionally render components based on feature flags
 * 
 * Usage:
 * ```tsx
 * <FeatureGate flag="ai_insights">
 *   <AIInsightsComponent />
 * </FeatureGate>
 * 
 * <FeatureGate flag="competitive_mode" fallback={<ComingSoon />}>
 *   <CompetitiveMode />
 * </FeatureGate>
 * ```
 */
export function FeatureGate({
  flag,
  children,
  fallback = null,
  showLoading = false,
  invert = false,
}: FeatureGateProps) {
  const { enabled, loading } = useFeatureFlag(flag);

  if (loading && showLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#0066FF" />
      </View>
    );
  }

  // Determine if we should show children
  const shouldShow = invert ? !enabled : enabled;

  if (shouldShow) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * Multiple feature gates - all flags must be enabled
 */
interface MultiFeatureGateProps {
  flags: FeatureFlagName[];
  children: ReactNode;
  fallback?: ReactNode;
  showLoading?: boolean;
  /**
   * If true, show children if ANY flag is enabled (OR logic)
   * If false, show children only if ALL flags are enabled (AND logic)
   * @default false (AND logic)
   */
  anyFlag?: boolean;
}

export function MultiFeatureGate({
  flags,
  children,
  fallback = null,
  showLoading = false,
  anyFlag = false,
}: MultiFeatureGateProps) {
  const { useMultipleFeatureFlags } = require('../hooks/useFeatureFlags');
  const { flags: flagValues, loading } = useMultipleFeatureFlags(flags);

  if (loading && showLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#0066FF" />
      </View>
    );
  }

  const flagArray = Object.values(flagValues);
  const shouldShow = anyFlag
    ? flagArray.some(Boolean) // OR logic
    : flagArray.every(Boolean); // AND logic

  if (shouldShow) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * Higher-order component for feature gating
 */
export function withFeatureGate<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  flag: FeatureFlagName,
  FallbackComponent?: React.ComponentType<P>
) {
  return function FeatureGatedComponent(props: P) {
    return (
      <FeatureGate
        flag={flag}
        fallback={FallbackComponent ? <FallbackComponent {...props} /> : null}
      >
        <WrappedComponent {...props} />
      </FeatureGate>
    );
  };
}

const styles = StyleSheet.create({
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default FeatureGate;
