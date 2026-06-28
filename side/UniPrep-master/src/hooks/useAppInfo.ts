// Hook to get app metadata. Branding/support URLs come from admin settings;
// installed version comes from native build metadata.

import { useState, useEffect } from 'react';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { systemSettingsService } from '../services/systemSettingsService';

interface AppInfo {
  appName: string;
  appVersion: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
  webappUrl: string;
  loading: boolean;
}

// Default values (fallback - these are overridden by admin panel settings)
const DEFAULT_APP_NAME = 'Elmly';
const FALLBACK_APP_VERSION = '1.0.2';
const DEFAULT_SUPPORT_EMAIL = 'elmlyapp@gmail.com';
const DEFAULT_SUPPORT_PHONE = '+994 XX XXX XX XX';
const DEFAULT_WEBSITE_URL = 'https://www.elmly.app';
const DEFAULT_WEBAPP_URL = 'https://www.elmly.app';

export function getInstalledAppVersion(): string {
  return Constants.expoConfig?.version || Application.nativeApplicationVersion || FALLBACK_APP_VERSION;
}

// Cache the app info to avoid multiple fetches
let cachedAppInfo: { 
  appName: string; 
  appVersion: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
  webappUrl: string;
} | null = null;

export function useAppInfo(): AppInfo {
  const [appName, setAppName] = useState(cachedAppInfo?.appName || DEFAULT_APP_NAME);
  const [appVersion, setAppVersion] = useState(cachedAppInfo?.appVersion || getInstalledAppVersion());
  const [supportEmail, setSupportEmail] = useState(cachedAppInfo?.supportEmail || DEFAULT_SUPPORT_EMAIL);
  const [supportPhone, setSupportPhone] = useState(cachedAppInfo?.supportPhone || DEFAULT_SUPPORT_PHONE);
  const [websiteUrl, setWebsiteUrl] = useState(cachedAppInfo?.websiteUrl || DEFAULT_WEBSITE_URL);
  const [webappUrl, setWebappUrl] = useState(cachedAppInfo?.webappUrl || DEFAULT_WEBAPP_URL);
  const [loading, setLoading] = useState(!cachedAppInfo);

  useEffect(() => {
    // If we have cached values, use them immediately
    if (cachedAppInfo) {
      setAppName(cachedAppInfo.appName);
      setAppVersion(cachedAppInfo.appVersion);
      setSupportEmail(cachedAppInfo.supportEmail);
      setSupportPhone(cachedAppInfo.supportPhone);
      setWebsiteUrl(cachedAppInfo.websiteUrl);
      setWebappUrl(cachedAppInfo.webappUrl);
      setLoading(false);
      return;
    }

    const loadAppInfo = async () => {
      try {
        const settings = await systemSettingsService.getSettings();
        if (settings) {
          // Remove quotes if present (in case of double-encoded JSON strings)
          const cleanAppName = typeof settings.app_name === 'string' 
            ? settings.app_name.replace(/^"|"$/g, '') 
            : DEFAULT_APP_NAME;
          const installedAppVersion = getInstalledAppVersion();
          
          // Get support info - clean quotes from JSONB string values
          const cleanSupportEmail = typeof settings.support_email === 'string'
            ? settings.support_email.replace(/^"|"$/g, '')
            : DEFAULT_SUPPORT_EMAIL;
          const cleanSupportPhone = typeof settings.support_phone === 'string'
            ? settings.support_phone.replace(/^"|"$/g, '')
            : DEFAULT_SUPPORT_PHONE;
          const cleanWebsiteUrl = typeof settings.website_url === 'string'
            ? settings.website_url.replace(/^"|"$/g, '')
            : DEFAULT_WEBSITE_URL;
          const cleanWebappUrl = typeof settings.webapp_url === 'string'
            ? settings.webapp_url.replace(/^"|"$/g, '')
            : DEFAULT_WEBAPP_URL;
          
          // Cache the values
          cachedAppInfo = { 
            appName: cleanAppName, 
            appVersion: installedAppVersion,
            supportEmail: cleanSupportEmail,
            supportPhone: cleanSupportPhone,
            websiteUrl: cleanWebsiteUrl,
            webappUrl: cleanWebappUrl,
          };
          
          setAppName(cleanAppName);
          setAppVersion(installedAppVersion);
          setSupportEmail(cleanSupportEmail);
          setSupportPhone(cleanSupportPhone);
          setWebsiteUrl(cleanWebsiteUrl);
          setWebappUrl(cleanWebappUrl);
        }
      } catch (error) {
        console.error('Error loading app info:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAppInfo();
  }, []);

  return { appName, appVersion, supportEmail, supportPhone, websiteUrl, webappUrl, loading };
}

// Function to clear cached app info (useful for testing or when settings change)
export function clearAppInfoCache(): void {
  cachedAppInfo = null;
}

// Function to get app info synchronously (returns cached or default)
export function getAppInfoSync(): { appName: string; appVersion: string; supportEmail: string; supportPhone: string; websiteUrl: string; webappUrl: string } {
  return cachedAppInfo || { 
    appName: DEFAULT_APP_NAME, 
    appVersion: getInstalledAppVersion(),
    supportEmail: DEFAULT_SUPPORT_EMAIL,
    supportPhone: DEFAULT_SUPPORT_PHONE,
    websiteUrl: DEFAULT_WEBSITE_URL,
    webappUrl: DEFAULT_WEBAPP_URL,
  };
}
