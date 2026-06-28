import { supabase } from './supabase';
import * as Application from 'expo-application';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getInstalledAppVersion } from '../hooks/useAppInfo';

interface AppVersion {
  version: string;
  build_number: number;
  force_update: boolean;
  update_message: string;
  update_message_az: string;
  update_message_ru: string;
  ios_url: string;
  android_url: string;
  created_at: string;
}

class AppUpdateService {
  /**
   * Get current app version
   */
  getCurrentVersion(): string {
    return getInstalledAppVersion();
  }

  /**
   * Get current build number
   */
  getCurrentBuildNumber(): number {
    return parseInt(Application.nativeBuildVersion || '1', 10);
  }

  /**
   * Check if update is available
   */
  async checkForUpdate(): Promise<{
    updateAvailable: boolean;
    forceUpdate: boolean;
    version?: AppVersion;
  }> {
    try {
      const appEnv = Constants.expoConfig?.extra?.appEnv || 'development';

      // Admin-managed Play Store update prompts are production policy.
      // Preview/internal APKs use a different package id and can otherwise compare
      // against production app_versions rows, producing impossible update prompts.
      if (appEnv !== 'production') {
        return { updateAvailable: false, forceUpdate: false };
      }

      // Fetch latest version from database
      const { data, error } = await supabase
        .from('app_versions')
        .select('*')
        .eq('platform', Platform.OS)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        console.log('No update info available');
        return { updateAvailable: false, forceUpdate: false };
      }

      const latestVersion = data as AppVersion;
      const currentVersion = this.getCurrentVersion();
      const currentBuild = this.getCurrentBuildNumber();

      // Compare versions
      const updateAvailable = this.isNewerVersion(
        latestVersion.version,
        currentVersion
      ) || latestVersion.build_number > currentBuild;

      return {
        updateAvailable,
        forceUpdate: latestVersion.force_update,
        version: latestVersion,
      };
    } catch (error) {
      console.error('Check update error:', error);
      return { updateAvailable: false, forceUpdate: false };
    }
  }

  /**
   * Compare version strings (semver)
   * @returns true if remote version is newer than local
   */
  private isNewerVersion(remote: string, local: string): boolean {
    const remoteParts = remote.split('.').map(Number);
    const localParts = local.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const r = remoteParts[i] || 0;
      const l = localParts[i] || 0;
      if (r > l) return true;
      if (r < l) return false;
    }
    return false;
  }

  /**
   * Open app store for update
   */
  async openAppStore(version: AppVersion): Promise<void> {
    const url = Platform.OS === 'ios' ? version.ios_url : version.android_url;
    
    if (url) {
      await Linking.openURL(url);
    } else {
      // Fallback to default store URLs
      const storeUrl = Platform.OS === 'ios'
        ? 'https://apps.apple.com/app/elmly/id123456789' // TODO: Replace with actual App ID
        : 'https://play.google.com/store/apps/details?id=com.elmly.app';
      
      await Linking.openURL(storeUrl);
    }
  }
}

export const appUpdateService = new AppUpdateService();
