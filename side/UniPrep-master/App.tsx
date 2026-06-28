// Must be first import — patches Animated.Value.__detach to prevent stopTracking crash on Hermes
import './src/utils/patchAnimated';

import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { OfflineProvider } from './src/contexts/OfflineContext';
import { WalkthroughProvider } from './src/contexts/WalkthroughContext';
import { AIInsightsProvider } from './src/contexts/AIInsightsContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { UpdateModal } from './src/components/UpdateModal';
import { WalkthroughOverlay } from './src/components/walkthrough';
import { AlertProvider } from './src/components/AlertProvider';
import { StripeProvider } from './src/contexts/StripeContext';
// OfflineBanner is now only in RootNavigator to avoid duplicates
import { appUpdateService } from './src/services/appUpdateService';
import { systemSettingsService } from './src/services/systemSettingsService';
import { maintenanceModeService } from './src/services/maintenanceModeService';
import { useTranslation } from 'react-i18next';
import './src/i18n'; // Initialize i18n

function AppContent() {
  const { i18n, t } = useTranslation();
  const { activeTheme, colors } = useTheme();
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isInMaintenance, setIsInMaintenance] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize system settings (sync from admin panel)
      const settings = await systemSettingsService.getSettings(true); // Force refresh on startup
      
      if (!settings) {
        console.warn('Failed to load system settings');
        setIsInitializing(false);
        return;
      }

      // Check maintenance mode
      const maintenanceStatus = await maintenanceModeService.checkOnLaunch();
      if (maintenanceStatus.isActive) {
        setIsInMaintenance(true);
        setMaintenanceMessage(maintenanceStatus.message);
        setIsInitializing(false);
        return;
      }

      // Check for updates
      await checkForUpdates();
      
      // Start background sync (every 5 minutes)
      systemSettingsService.startPeriodicSync();
      maintenanceModeService.startMonitoring((status: any) => {
        if (status.isActive) {
          setIsInMaintenance(true);
          setMaintenanceMessage(status.message);
        }
      });
    } catch (error) {
      console.error('App initialization error:', error);
    } finally {
      setIsInitializing(false);
    }
  };

  const checkForUpdates = async () => {
    try {
      const result = await appUpdateService.checkForUpdate();
      
      if (result.updateAvailable && result.version) {
        setUpdateInfo(result);
        setShowUpdateModal(true);
      }
    } catch (error) {
      console.error('Update check error:', error);
    }
  };

  const handleUpdate = async () => {
    if (updateInfo?.version) {
      await appUpdateService.openAppStore(updateInfo.version);
    }
  };

  const handleLater = () => {
    if (!updateInfo?.forceUpdate) {
      setShowUpdateModal(false);
    }
  };

  // Get localized message
  const getUpdateMessage = () => {
    if (!updateInfo?.version) return '';
    
    const lang = i18n.language;
    if (lang === 'az') return updateInfo.version.update_message_az || updateInfo.version.update_message;
    if (lang === 'ru') return updateInfo.version.update_message_ru || updateInfo.version.update_message;
    return updateInfo.version.update_message;
  };

  // Show loading screen during initialization
  if (isInitializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 16, fontSize: 16, color: colors.textSecondary }}>{t('common.loading')}</Text>
      </View>
    );
  }

  // Show maintenance screen if in maintenance mode
  if (isInMaintenance) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEF2F2', padding: 24 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🔧</Text>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#991B1B', marginBottom: 8, textAlign: 'center' }}>
          {t('maintenance.title')}
        </Text>
        <Text style={{ fontSize: 16, color: '#7F1D1D', textAlign: 'center', marginBottom: 24 }}>
          {maintenanceMessage}
        </Text>
        <Text style={{ fontSize: 14, color: '#991B1B', textAlign: 'center' }}>
          {t('maintenance.backSoon')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <AIInsightsProvider>
      <WalkthroughProvider>
        <RootNavigator />
        <StatusBar style={activeTheme === 'dark' ? 'light' : 'dark'} />
      
      {/* Walkthrough Overlay - Stage 10.3 */}
      <WalkthroughOverlay />
      
      {/* Update Modal */}
      {updateInfo && (
        <UpdateModal
          visible={showUpdateModal}
          forceUpdate={updateInfo.forceUpdate}
          version={updateInfo.version.version}
          message={getUpdateMessage()}
          onUpdate={handleUpdate}
          onLater={updateInfo.forceUpdate ? undefined : handleLater}
        />
      )}
      </WalkthroughProvider>
    </AIInsightsProvider>
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <OfflineProvider>
              <AlertProvider>
                <StripeProvider>
                  <AppContent />
                </StripeProvider>
              </AlertProvider>
            </OfflineProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
