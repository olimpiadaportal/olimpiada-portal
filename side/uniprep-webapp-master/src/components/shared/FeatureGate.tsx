'use client';

import { ReactNode } from 'react';
import { useFeatureFlag, FeatureFlagName } from '@/hooks/useFeatureFlags';

interface FeatureGateProps {
  flag: FeatureFlagName;
  children: ReactNode;
  fallback?: ReactNode;
  showLoading?: boolean;
}

/**
 * FeatureGate component that conditionally renders children based on feature flag status.
 * Use this to wrap any UI that should be controlled by a feature flag.
 * 
 * @example
 * <FeatureGate flag="ai_explanations">
 *   <AIExplanationCard />
 * </FeatureGate>
 */
export function FeatureGate({ flag, children, fallback = null, showLoading = false }: FeatureGateProps) {
  const { enabled, loading } = useFeatureFlag(flag);

  if (loading && showLoading) {
    return (
      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-24 w-full" />
    );
  }

  if (loading) {
    return null;
  }

  return enabled ? <>{children}</> : <>{fallback}</>;
}

/**
 * Hook-based feature gate for more complex conditional logic
 */
export function useFeatureGate(flag: FeatureFlagName) {
  const { enabled, loading } = useFeatureFlag(flag);
  return { isEnabled: enabled, isLoading: loading };
}
