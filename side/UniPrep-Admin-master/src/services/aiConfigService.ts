/**
 * AI Configuration Service
 * Stage 5.5 - Phase 6: Configuration & Controls
 * 
 * Manages system-wide AI configuration including:
 * - Global settings
 * - Rate limits
 * - Feature flags
 * - Emergency controls
 * - Cost controls
 * - Provider configuration
 */

import { supabaseAdmin } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface AIConfiguration {
  id: string;
  config_key: string;
  config_category: 'system' | 'security' | 'performance' | 'features';
  config_value: Record<string, any>;
  description?: string;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  version: number;
  previous_value?: Record<string, any>;
}

export interface GlobalSettings {
  enabled: boolean;
  default_provider: string;
  default_model: string;
  default_temperature: number;
  default_max_tokens: number;
  fallback_provider: string;
  fallback_model: string;
  auto_fallback_enabled: boolean;
  log_all_requests: boolean;
  quality_threshold: number;
}

export interface RateLimits {
  global: {
    requests_per_minute: number;
    requests_per_hour: number;
    requests_per_day: number;
  };
  per_user: {
    requests_per_minute: number;
    requests_per_hour: number;
    requests_per_day: number;
  };
  per_feature: Record<string, {
    requests_per_minute: number;
    requests_per_hour: number;
  }>;
  enabled: boolean;
  block_on_limit: boolean;
  notify_on_limit: boolean;
}

export interface FeatureFlags {
  [featureName: string]: {
    enabled: boolean;
    beta?: boolean;
    allowed_models?: string[];
    admin_only?: boolean;
    auto_flag_threshold?: number;
    require_review?: boolean;
  };
}

export interface EmergencyControls {
  emergency_mode: boolean;
  emergency_message: string;
  throttle_mode: boolean;
  throttle_percentage: number;
  maintenance_mode: boolean;
  maintenance_message: string;
  allowed_features_during_emergency: string[];
  notify_admins: boolean;
  last_emergency_at?: string;
  last_emergency_reason?: string;
}

export interface CostControls {
  daily_budget_usd: number;
  monthly_budget_usd: number;
  auto_disable_on_budget: boolean;
  alert_at_percentage: number;
  prefer_cheaper_models: boolean;
  max_cost_per_request: number;
  track_per_feature: boolean;
  optimize_token_usage: boolean;
}

export interface ProviderConfig {
  [providerName: string]: {
    enabled: boolean;
    priority: number;
    api_key_configured: boolean;
    models: string[];
    timeout_ms: number;
    retry_attempts: number;
  };
}

export interface RateLimitCheck {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
  retry_after_seconds?: number;
}

// ============================================
// Service Functions
// ============================================

/**
 * Get all configurations
 */
export async function getAllConfigurations(): Promise<AIConfiguration[]> {
  const { data, error } = await supabaseAdmin
    .from('ai_configuration')
    .select('*')
    .order('config_category', { ascending: true })
    .order('config_key', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get configuration by key
 */
export async function getConfiguration(configKey: string): Promise<AIConfiguration | null> {
  const { data, error } = await supabaseAdmin
    .from('ai_configuration')
    .select('*')
    .eq('config_key', configKey)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

/**
 * Get configuration value by key
 */
export async function getConfigValue<T = any>(configKey: string): Promise<T | null> {
  const config = await getConfiguration(configKey);
  return config ? (config.config_value as T) : null;
}

/**
 * Update configuration
 */
export async function updateConfiguration(
  configKey: string,
  configValue: Record<string, any>,
  updatedBy?: string
): Promise<AIConfiguration> {
  const { data, error } = await supabaseAdmin
    .from('ai_configuration')
    .update({
      config_value: configValue,
      updated_by: updatedBy || null,
    })
    .eq('config_key', configKey)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get global settings
 */
export async function getGlobalSettings(): Promise<GlobalSettings> {
  const config = await getConfigValue<GlobalSettings>('global_settings');
  if (!config) {
    throw new Error('Global settings not found');
  }
  return config;
}

/**
 * Update global settings
 */
export async function updateGlobalSettings(
  settings: Partial<GlobalSettings>,
  updatedBy?: string
): Promise<GlobalSettings> {
  const current = await getGlobalSettings();
  const updated = { ...current, ...settings };
  const config = await updateConfiguration('global_settings', updated, updatedBy);
  return config.config_value as GlobalSettings;
}

/**
 * Get rate limits
 */
export async function getRateLimits(): Promise<RateLimits> {
  const config = await getConfigValue<RateLimits>('rate_limits');
  if (!config) {
    throw new Error('Rate limits not found');
  }
  return config;
}

/**
 * Update rate limits
 */
export async function updateRateLimits(
  limits: Partial<RateLimits>,
  updatedBy?: string
): Promise<RateLimits> {
  const current = await getRateLimits();
  const updated = { ...current, ...limits };
  const config = await updateConfiguration('rate_limits', updated, updatedBy);
  return config.config_value as RateLimits;
}

/**
 * Get feature flags
 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const config = await getConfigValue<FeatureFlags>('feature_flags');
  if (!config) {
    throw new Error('Feature flags not found');
  }
  return config;
}

/**
 * Update feature flags
 */
export async function updateFeatureFlags(
  flags: Partial<FeatureFlags>,
  updatedBy?: string
): Promise<FeatureFlags> {
  const current = await getFeatureFlags();
  const updated = { ...current, ...flags };
  const config = await updateConfiguration('feature_flags', updated, updatedBy);
  return config.config_value as FeatureFlags;
}

/**
 * Get emergency controls
 */
export async function getEmergencyControls(): Promise<EmergencyControls> {
  const config = await getConfigValue<EmergencyControls>('emergency_controls');
  if (!config) {
    throw new Error('Emergency controls not found');
  }
  return config;
}

/**
 * Update emergency controls
 */
export async function updateEmergencyControls(
  controls: Partial<EmergencyControls>,
  updatedBy?: string
): Promise<EmergencyControls> {
  const current = await getEmergencyControls();
  const updated = { ...current, ...controls };
  const config = await updateConfiguration('emergency_controls', updated, updatedBy);
  return config.config_value as EmergencyControls;
}

/**
 * Activate emergency mode
 */
export async function activateEmergencyMode(
  reason: string,
  updatedBy?: string
): Promise<EmergencyControls> {
  const current = await getEmergencyControls();
  const updated = {
    ...current,
    emergency_mode: true,
    last_emergency_at: new Date().toISOString(),
    last_emergency_reason: reason,
  };
  const config = await updateConfiguration('emergency_controls', updated, updatedBy);
  return config.config_value as EmergencyControls;
}

/**
 * Deactivate emergency mode
 */
export async function deactivateEmergencyMode(
  updatedBy?: string
): Promise<EmergencyControls> {
  const current = await getEmergencyControls();
  const updated = {
    ...current,
    emergency_mode: false,
  };
  const config = await updateConfiguration('emergency_controls', updated, updatedBy);
  return config.config_value as EmergencyControls;
}

/**
 * Get cost controls
 */
export async function getCostControls(): Promise<CostControls> {
  const config = await getConfigValue<CostControls>('cost_controls');
  if (!config) {
    throw new Error('Cost controls not found');
  }
  return config;
}

/**
 * Update cost controls
 */
export async function updateCostControls(
  controls: Partial<CostControls>,
  updatedBy?: string
): Promise<CostControls> {
  const current = await getCostControls();
  const updated = { ...current, ...controls };
  const config = await updateConfiguration('cost_controls', updated, updatedBy);
  return config.config_value as CostControls;
}

/**
 * Get provider configuration
 */
export async function getProviderConfig(): Promise<ProviderConfig> {
  const config = await getConfigValue<ProviderConfig>('provider_config');
  if (!config) {
    throw new Error('Provider configuration not found');
  }
  return config;
}

/**
 * Update provider configuration
 */
export async function updateProviderConfig(
  config: Partial<ProviderConfig>,
  updatedBy?: string
): Promise<ProviderConfig> {
  const current = await getProviderConfig();
  const updated = { ...current, ...config };
  const configData = await updateConfiguration('provider_config', updated, updatedBy);
  return configData.config_value as ProviderConfig;
}

/**
 * Check if feature is enabled
 */
export async function isFeatureEnabled(featureName: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('is_feature_enabled', {
    p_feature_name: featureName,
  });

  if (error) throw error;
  return data || false;
}

/**
 * Check rate limit
 */
export async function checkRateLimit(
  featureType: string,
  userId?: string
): Promise<RateLimitCheck> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_feature_type: featureType,
    p_user_id: userId || null,
  });

  if (error) throw error;
  return data as RateLimitCheck;
}

/**
 * Get configuration history
 */
export async function getConfigurationHistory(
  configKey: string,
  limit: number = 10
): Promise<Array<{ version: number; value: any; updated_at: string }>> {
  // This would require a separate history table or querying previous_value
  // For now, return empty array - can be enhanced later
  return [];
}

/**
 * Export all configurations
 */
export async function exportConfigurations(): Promise<string> {
  const configs = await getAllConfigurations();
  return JSON.stringify(configs, null, 2);
}

/**
 * Get configuration summary for dashboard
 */
export async function getConfigurationSummary() {
  const [global, rateLimits, features, emergency, costs, providers] = await Promise.all([
    getGlobalSettings(),
    getRateLimits(),
    getFeatureFlags(),
    getEmergencyControls(),
    getCostControls(),
    getProviderConfig(),
  ]);

  // Count enabled features
  const enabledFeatures = Object.values(features).filter((f) => f.enabled).length;
  const totalFeatures = Object.keys(features).length;

  // Count enabled providers
  const enabledProviders = Object.values(providers).filter((p) => p.enabled).length;
  const totalProviders = Object.keys(providers).length;

  return {
    system_status: emergency.emergency_mode
      ? 'emergency'
      : emergency.maintenance_mode
      ? 'maintenance'
      : global.enabled
      ? 'operational'
      : 'disabled',
    ai_enabled: global.enabled,
    rate_limiting_enabled: rateLimits.enabled,
    features_enabled: `${enabledFeatures}/${totalFeatures}`,
    providers_enabled: `${enabledProviders}/${totalProviders}`,
    emergency_mode: emergency.emergency_mode,
    maintenance_mode: emergency.maintenance_mode,
    daily_budget: costs.daily_budget_usd,
    monthly_budget: costs.monthly_budget_usd,
    default_provider: global.default_provider,
    default_model: global.default_model,
  };
}
