// Maintenance Mode Service
// Stage 6 - Phase 3: Mobile App Integration
// Handles maintenance mode detection and messaging

import { systemSettingsService, SystemSettings } from './systemSettingsService';
import i18n from '../i18n';

export interface MaintenanceStatus {
  isActive: boolean;
  message: string;
  estimatedEnd?: string;
}

class MaintenanceModeService {
  /**
   * Check if maintenance mode is active
   * Returns maintenance status with localized message
   * @param forceRefresh - Force fetch from server instead of using cache
   */
  async check(forceRefresh = false): Promise<MaintenanceStatus> {
    try {
      const settings = await systemSettingsService.getSettings(forceRefresh);

      if (!settings) {
        // If we can't get settings, assume no maintenance
        return {
          isActive: false,
          message: '',
        };
      }

      console.log('🔍 Maintenance mode value from settings:', settings.maintenance_mode);
      const isActive = settings.maintenance_mode === true;

      if (!isActive) {
        return {
          isActive: false,
          message: '',
        };
      }

      // Get localized message
      const message = this.getLocalizedMessage(settings);

      return {
        isActive: true,
        message,
      };
    } catch (error) {
      console.error('Error checking maintenance mode:', error);
      // Fail safe: assume no maintenance if error
      return {
        isActive: false,
        message: '',
      };
    }
  }

  /**
   * Get localized maintenance message based on current language
   */
  private getLocalizedMessage(settings: SystemSettings): string {
    const currentLanguage = i18n.language || 'en';

    switch (currentLanguage) {
      case 'az':
        return settings.maintenance_message_az || 
               'Sistem texniki xidmət altındadır. Zəhmət olmasa sonra yenidən cəhd edin.';
      case 'ru':
        return settings.maintenance_message_ru || 
               'Система находится на техническом обслуживании. Пожалуйста, попробуйте позже.';
      case 'en':
      default:
        return settings.maintenance_message_en || 
               'System is under maintenance. Please try again later.';
    }
  }

  /**
   * Check maintenance mode on app launch
   * Returns true if app should show maintenance screen
   */
  async checkOnLaunch(): Promise<MaintenanceStatus> {
    console.log('🔍 Checking maintenance mode...');
    const status = await this.check();

    if (status.isActive) {
      console.log('🚧 Maintenance mode is ACTIVE');
    } else {
      console.log('✅ Maintenance mode is inactive');
    }

    return status;
  }

  /**
   * Subscribe to maintenance mode changes
   * Checks every minute for updates
   */
  startMonitoring(callback: (status: MaintenanceStatus) => void): NodeJS.Timeout {
    const interval = setInterval(async () => {
      console.log('🔄 Checking maintenance mode (periodic check)...');
      // IMPORTANT: Force refresh to get latest value from server
      const status = await this.check(true);
      console.log('📊 Maintenance status:', status);
      
      // Always call callback so app can react
      callback(status);
    }, 60 * 1000); // Check every minute

    console.log('👀 Maintenance mode monitoring started (checks every 60 seconds)');
    return interval;
  }

  /**
   * Stop monitoring maintenance mode
   */
  stopMonitoring(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    console.log('⏹️ Maintenance mode monitoring stopped');
  }

  /**
   * Force check and refresh settings
   */
  async forceCheck(): Promise<MaintenanceStatus> {
    await systemSettingsService.refresh();
    return await this.check();
  }
}

export const maintenanceModeService = new MaintenanceModeService();
