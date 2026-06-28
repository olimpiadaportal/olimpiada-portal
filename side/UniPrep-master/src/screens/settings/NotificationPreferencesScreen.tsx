// Notification Preferences Screen
// Stage 9 - Phase 3
// Detailed notification settings with schedule configuration

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { settingsService } from '../../services/settingsService';
import { notificationService } from '../../services/notificationService';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { UserSettings } from '../../types/settings';
import { colors, typography, spacing, borderRadius } from '../../constants/theme';
import { useAlert } from '../../components/AlertProvider';
import { TimePicker } from '../../components/TimePicker';

export const NotificationPreferencesScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { colors: themeColors } = useTheme();
  const { t } = useLanguage();
  const { showError, showInfo } = useAlert();

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
    checkPermissions();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;

    try {
      const userSettings = await settingsService.getSettings(user.id);
      setSettings(userSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkPermissions = async () => {
    const enabled = await notificationService.areNotificationsEnabled();
    if (!enabled) {
      showInfo(
        t('notifications.permissionRequired'),
        t('notifications.enableInSettings')
      );
    }
  };

  const updateSetting = async (key: keyof UserSettings, value: any) => {
    if (!user || !settings) return;

    try {
      const updated = { ...settings, [key]: value };
      setSettings(updated);
      await settingsService.updateSettings({ [key]: value }, user.id);
      console.log(`✅ Notification setting updated: ${key} = ${value}`);
    } catch (error) {
      console.error('Error updating setting:', error);
      showError(t('common.error'), t('errors.generic'));
    }
  };

  const handleReminderTimeChange = async (time: string) => {
    if (!user) return;
    // Save to settings (persists to notification_preferences.reminder_time)
    await updateSetting('reminderTime', time);
    // Schedule the actual local notification daily at that time
    const [hour, minute] = time.split(':').map(Number);
    const allDays = [1, 2, 3, 4, 5, 6, 7]; // Every day of week
    await notificationService.scheduleDailyReminder(user.id, hour, minute, allDays);
    console.log(`✅ Study reminder scheduled daily at ${time}`);
  };

  if (loading || !settings) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: themeColors.text }]}>
            {t('common.loading')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>
          {t('notifications.title')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Enable Notifications */}
        <View style={styles.section}>
          <View style={[styles.settingItem, { backgroundColor: themeColors.surface }]}>
            <View style={styles.settingLeft}>
              <Ionicons name="notifications" size={22} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingLabel, { color: themeColors.text }]}>
                  {t('settings.notificationsEnabled')}
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.textSecondary }]}>
                  {t('notifications.descriptions.enableAll', 'Enable all notifications')}
                </Text>
              </View>
            </View>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(value) => updateSetting('notificationsEnabled', value)}
              trackColor={{ false: themeColors.disabled, true: colors.primary + '80' }}
              thumbColor={settings.notificationsEnabled ? colors.primary : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Study Reminders - Only show for students */}
        {user?.user_type === 'student' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
              {t('notifications.preferences')}
            </Text>

            <View style={[styles.settingItem, { backgroundColor: themeColors.surface }]}>
              <View style={styles.settingLeft}>
                <Ionicons name="book" size={22} color={colors.primary} />
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingLabel, { color: themeColors.text }]}>
                    {t('settings.studyReminders')}
                  </Text>
                  <Text style={[styles.settingDescription, { color: themeColors.textSecondary }]}>
                    {t('notifications.descriptions.studyReminders', 'Daily study reminders')}
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.studyReminders}
                onValueChange={(value) => updateSetting('studyReminders', value)}
                trackColor={{ false: themeColors.disabled, true: colors.primary + '80' }}
                thumbColor={settings.studyReminders ? colors.primary : '#f4f3f4'}
                disabled={!settings.notificationsEnabled}
              />
            </View>

            <View style={[styles.settingItem, { backgroundColor: themeColors.surface }]}>
              <View style={styles.settingLeft}>
                <Ionicons name="document-text" size={22} color={colors.primary} />
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingLabel, { color: themeColors.text }]}>
                    {t('settings.examReminders')}
                  </Text>
                  <Text style={[styles.settingDescription, { color: themeColors.textSecondary }]}>
                    {t('notifications.descriptions.examReminders', 'Upcoming exam reminders')}
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.examReminders}
                onValueChange={(value) => updateSetting('examReminders', value)}
                trackColor={{ false: themeColors.disabled, true: colors.primary + '80' }}
                thumbColor={settings.examReminders ? colors.primary : '#f4f3f4'}
                disabled={!settings.notificationsEnabled}
              />
            </View>

            <View style={[styles.settingItem, { backgroundColor: themeColors.surface }]}>
              <View style={styles.settingLeft}>
                <Ionicons name="trophy" size={22} color={colors.primary} />
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingLabel, { color: themeColors.text }]}>
                    {t('settings.achievementNotifications')}
                  </Text>
                  <Text style={[styles.settingDescription, { color: themeColors.textSecondary }]}>
                    {t('notifications.descriptions.achievementNotifications', 'Achievement unlocked notifications')}
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.achievementNotifications}
                onValueChange={(value) => updateSetting('achievementNotifications', value)}
                trackColor={{ false: themeColors.disabled, true: colors.primary + '80' }}
                thumbColor={settings.achievementNotifications ? colors.primary : '#f4f3f4'}
                disabled={!settings.notificationsEnabled}
              />
            </View>
          </View>
        )}

        {/* Quiet Hours */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
            {t('settings.quietHours')}
          </Text>

          <View style={[styles.settingItem, { backgroundColor: themeColors.surface }]}>
            <View style={styles.settingLeft}>
              <Ionicons name="moon" size={22} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingLabel, { color: themeColors.text }]}>
                  {t('settings.quietHoursEnabled')}
                </Text>
                <Text style={[styles.settingDescription, { color: themeColors.textSecondary }]}>
                  {t('notifications.descriptions.quietHours', 'No notifications during quiet hours')}
                </Text>
              </View>
            </View>
            <Switch
              value={settings.quietHoursEnabled}
              onValueChange={(value) => updateSetting('quietHoursEnabled', value)}
              trackColor={{ false: themeColors.disabled, true: colors.primary + '80' }}
              thumbColor={settings.quietHoursEnabled ? colors.primary : '#f4f3f4'}
              disabled={!settings.notificationsEnabled}
            />
          </View>

          {settings.quietHoursEnabled && (
            <>
              <TimePicker
                value={settings.quietHoursStart}
                onChange={(time) => updateSetting('quietHoursStart', time)}
                label={t('settings.quietHoursStart')}
                disabled={!settings.notificationsEnabled}
              />

              <TimePicker
                value={settings.quietHoursEnd}
                onChange={(time) => updateSetting('quietHoursEnd', time)}
                label={t('settings.quietHoursEnd')}
                disabled={!settings.notificationsEnabled}
              />
            </>
          )}
        </View>

        {/* Schedule - Only show for students when study reminders are enabled */}
        {user?.user_type === 'student' && settings.studyReminders && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
              {t('notifications.schedule')}
            </Text>

            <TimePicker
              value={settings.reminderTime || '18:00'}
              onChange={handleReminderTimeChange}
              label={t('notifications.dailyReminder')}
              disabled={!settings.notificationsEnabled}
            />
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: typography.fontSizes.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    borderRadius: borderRadius.md,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingTextContainer: {
    marginLeft: spacing.md,
    flex: 1,
  },
  settingLabel: {
    fontSize: typography.fontSizes.md,
  },
  settingDescription: {
    fontSize: typography.fontSizes.xs,
    marginTop: 2,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: typography.fontSizes.sm,
    marginRight: spacing.xs,
  },
});
