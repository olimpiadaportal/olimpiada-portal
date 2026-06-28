// Dynamic Expo configuration for EAS Build
// Environment variables: Local (.env) or expo.dev (Project → Secrets)

// EAS Project ID (safe to expose - it's just an identifier, not a secret)
const EAS_PROJECT_ID = 'fd961f51-c451-45eb-93cd-05d1b108bb7e';

const IS_DEV = process.env.APP_ENV === 'development';
const IS_PREVIEW = process.env.APP_ENV === 'preview';

// App naming based on environment
const getAppName = () => {
  if (IS_DEV) return 'Elmly (Dev)';
  if (IS_PREVIEW) return 'Elmly (Preview)';
  return 'Elmly';
};

// Use same slug for all environments (single EAS project)
const getSlug = () => 'uniprep';

const getBundleId = () => {
  if (IS_DEV) return 'com.elmly.app.dev';
  if (IS_PREVIEW) return 'com.elmly.app.preview';
  return 'com.elmly.app';
};

export default {
  expo: {
    name: getAppName(),
    slug: getSlug(),
    version: '1.0.3',
    orientation: 'portrait',
    icon: './assets/icon.png', // 1024x1024 for iOS, Expo auto-resizes for Android
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    scheme: 'elmly',
    
    // Owner from environment variable (set in .env locally)
    owner: process.env.EXPO_OWNER,
    
    splash: {
      image: './assets/splash-icon.png', // 1080x1920 works for both iOS and Android
      resizeMode: 'contain', // Centers icon, fills background color
      backgroundColor: '#ffffff',
      dark: {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#0B1120' // Dark mode background
      }
    },
    
    ios: {
      supportsTablet: true,
      bundleIdentifier: getBundleId(),
      buildNumber: '1',
      infoPlist: {
        NSCameraUsageDescription: 'Elmly needs camera access to update your profile photo.',
        NSPhotoLibraryUsageDescription: 'Elmly needs photo library access to update your profile photo.',
      },
      // Deep linking - iOS will use the scheme defined at root level
      associatedDomains: ['applinks:elmly.az'],
    },
    
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png', // 512x512 transparent PNG
        backgroundColor: '#ffffff', // Light mode background
        // Note: Android 12+ supports themed icons automatically
      },
      package: getBundleId(),
      versionCode: 1,
      softwareKeyboardLayoutMode: 'resize',
      // Fix for navigation bar buttons overlapping app content
      navigationBarColor: '#ffffff',
      navigationBarStyle: 'dark-content',
      permissions: [
        'android.permission.CAMERA',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.VIBRATE',
        'android.permission.ACCESS_NETWORK_STATE'
      ],
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO'
      ],
      // Deep linking intent filters
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'elmly',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    
    web: {
      favicon: './assets/favicon.png' // Now uses your brand icon (replaced default Expo favicon)
    },
    
    plugins: [
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#4F46E5',
          sounds: []
        }
      ],
      'expo-secure-store',
      'expo-font',
      [
        'expo-updates',
        {
          username: process.env.EXPO_OWNER
        }
      ],
      'expo-navigation-bar'
    ],
    
    // EAS Updates configuration for OTA updates
    updates: {
      enabled: true,
      fallbackToCacheTimeout: 0,
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      codeSigningCertificate: './keys/certificate.pem',
      codeSigningMetadata: {
        keyid: 'main',
        alg: 'rsa-v1_5-sha256',
      },
    },
    
    runtimeVersion: {
      policy: 'appVersion'
    },
    
    // Extra configuration accessible in app via Constants.expoConfig.extra
    extra: {
      eas: {
        projectId: EAS_PROJECT_ID
      },
      // Supabase config
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      // Environment
      appEnv: process.env.APP_ENV || 'development'
    }
  }
};
